import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { supabase } from 'src/supabase.client';
import { Usuario } from 'src/app/interfaces/usuario';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { Email } from 'src/app/services/email/email';

@Component({
  selector: 'app-alta-cliente',
  templateUrl: './alta-cliente.page.html',
  styleUrls: ['./alta-cliente.page.scss'],
  standalone: false
})
export class AltaClientePage implements OnInit {
  private fb = inject(FormBuilder);
  private usuarios = inject(Usuarios);
  private email = inject(Email);
  private readonly platform = Capacitor.getPlatform();

  loading = true;
  ok = false;
  err: string | null = null;
  escaneando = false;
  qrPayload: string | null = null;

  formAltaCliente = this.fb.group({
    nombres: ["", [Validators.required, Validators.minLength(2)]],
    apellidos: ["", [Validators.required, Validators.minLength(2)]],
    dni: ["", [Validators.required, Validators.pattern(/^\d{7,10}$/)]],
    correo: ["", [Validators.required, Validators.email]],
    clave: ["", [Validators.required, Validators.minLength(6)]],
    foto: ["", [Validators.required]]
  });

  get f() { return this.formAltaCliente.controls; }

  ngOnInit() {
    this.loading = false;
  }

  // ------------------ Escaneo DNI ------------------
  async escanearDNI() {
    this.err = null;
    this.escaneando = true;
    try {
      const result = await BarcodeScanner.scan({
        formats: [BarcodeFormat.Pdf417, BarcodeFormat.QrCode]
      })
      if (!result.barcodes?.length) throw new Error("No se detectó ningún código");

      const valor = result.barcodes[0].displayValue || "";
      this.qrPayload = valor;

      const partes = valor.split("@");
      if (partes.length >= 8) {
        const [, apellido, nombre, , dni] = partes;
        this.formAltaCliente.patchValue({
          nombres: nombre || "",
          apellidos: apellido || "",
          dni: dni || ""
        });
      } else {
        const dniSolo = valor.replace(/\D/g, "");
        if (dniSolo.match(/^\d{7,10}$/)) {
          this.formAltaCliente.patchValue({ dni: dniSolo });
        } else {
          throw new Error("QR inválido o incompleto");
        }
      }
    } catch (e: any) {
      this.err = e.message || "Error al escanear el DNI";
    } finally {
      this.escaneando = false;
    }
  }

  // ------------------ Tomar Foto ------------------
  async sacarFoto() {
    this.err = null;
    try {
      if (this.platform !== "web") {
        const status = await Camera.requestPermissions({ permissions: ["camera"] });
        if (status.camera !== "granted") {
          this.err = "Permiso de cámara denegado";
          return;
        }
      }

      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: CameraSource.Camera,
        allowEditing: false
      });

      let blob: Blob;
      let ext = "jpg";

      if (photo.webPath) {
        const response = await fetch(photo.webPath);
        blob = await response.blob();
        ext = blob.type.includes("png") ? "png" : "jpg";
      } else if (photo.base64String) {
        blob = this.base64ToBlob(photo.base64String, "image/jpeg");
      } else {
        throw new Error("No se pudo obtener la imagen");
      }

      const fileName = `cliente_${Date.now()}.${ext}`;
      const filePath = `clientes/${fileName}`;

      const up = await supabase.storage.from('clientes').upload(filePath, blob, { contentType: blob.type, upsert: true });
      if (up.error) throw up.error;

      const { data } = supabase.storage.from('clientes').getPublicUrl(filePath);
      this.formAltaCliente.patchValue({ foto: data.publicUrl });
    } catch (e: any) {
      this.err = `Error al tomar la foto: ${e.message || e}`;
    }
  }

  private base64ToBlob(base64: string, type = 'application/octet-stream') {
    const byteCharacters = atob(base64);
    const bytes = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) bytes[i] = byteCharacters.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  // ------------------ Enviar ------------------
  async enviar() {
    this.err = null;
    this.ok = false;

    if (this.formAltaCliente.invalid) {
      this.formAltaCliente.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const email = String(this.f["correo"].value).trim().toLowerCase();
      const password = String(this.f["clave"].value).trim();
      const nombres = String(this.f["nombres"].value).trim();
      const apellidos = String(this.f["apellidos"].value).trim(); // ← Agregar apellidos

      const sign = await supabase.auth.signUp({ email, password });
      if (sign.error) { throw sign.error; }

      const usuario: any = {
        apellido: apellidos, // ← Usar variable
        nombre: nombres,
        dni: Number(String(this.f["dni"].value).trim()),
        email,
        perfil: "cliente_registrado",
        cuil: null
      };
      const usuarioDB: Usuario = await this.usuarios.createFromUser(usuario);

      const { error: insClienteErr } = await supabase.from("clientes").insert({
        tipo: "cliente_registrado",
        usuario_id: (usuarioDB as any).id,
        estado: "pendiente"
      });
      if (insClienteErr) throw insClienteErr;

      await this.usuarios.update((usuarioDB as any).id, {
        foto_url: String(this.f["foto"].value),
        dni_qr_payload: this.qrPayload,
        dni_qr_leido_en: this.qrPayload ? new Date().toISOString() : null
      });

      try {
        await this.email.sendEmail(
          email,
          "Registro Recibido - En Revisión",
          "registro_pendiente",
          { nombres }
        );
      } catch (e) { 
        console.error('Error enviando email:', e);
      }

      // ✅ ✅ ✅ AGREGAR ESTO - PUSH NOTIFICATION A DUEÑOS/SUPERVISORES ✅ ✅ ✅
      try {
        await supabase.functions.invoke('send-push', {
          body: {
            perfiles: ['dueño', 'supervisor'], // ← Perfiles a notificar
            title: '📋 Nuevo Cliente Pendiente',
            body: `${nombres} ${apellidos} espera aprobación`,
            data: { 
              screen: 'clientes-pendientes',
              tipo: 'nuevo_cliente',
              cliente_id: (usuarioDB as any).id,
              cliente_nombre: `${nombres} ${apellidos}`
            }
          }
        });
        console.log('Notificación enviada a dueños/supervisores');
      } catch (pushError) {
        console.warn('Error enviando push notification:', pushError);
        // No romper el flujo si falla la notificación
      }

      this.ok = true;
      this.formAltaCliente.reset();
      this.qrPayload = null;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/already registered|User already registered/i.test(msg)) {
        this.err = "Correo registrado";
      } else if (/duplicate key.*numero_documento|numero_documento/i.test(msg)) {
        this.err = "DNI registrado";
      } else {
        this.err = msg || "No se pudo completar el registro";
      }
    } finally {
      this.loading = false;
    }
  }
}