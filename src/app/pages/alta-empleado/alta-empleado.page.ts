import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { supabase } from 'src/supabase.client';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { AuthService } from 'src/app/services/auth/auth';
import { Usuario } from 'src/app/interfaces/usuario';
import { User } from 'src/app/classes/user';

@Component({
  selector: 'app-alta-empleado',
  templateUrl: './alta-empleado.page.html',
  styleUrls: ['./alta-empleado.page.scss'],
  standalone: false
})
export class AltaEmpleadoPage implements OnInit {
  private fb = inject(FormBuilder);
  private usuarios = inject(Usuarios);
  private auth = inject(AuthService);
  private readonly platform = Capacitor.getPlatform();

  loading = true;
  ok = false;
  err: string | null = null;
  escaneando = false;
  qrPayload: string | null = null;

  isDuenoSupervisor = false;
  perfilActual = "";

  formAltaEmpleado = this.fb.group({
    nombres: ['', [Validators.required, Validators.minLength(2)]],
    apellidos: ['', [Validators.required, Validators.minLength(2)]],
    dni: ['', [Validators.required, Validators.pattern(/^\d{7,10}$/)]],
    cuil: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
    correo: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(6)]],
    perfil: ['', [Validators.required]],
    foto: ['', [Validators.required]]
  });

  get f() { return this.formAltaEmpleado.controls; }

  async ngOnInit() {
    this.resetearFormulario();
    await this.verificarPermisos();
    this.loading = false;
  }

  ionViewWillEnter() {
    this.resetearFormulario();
  }

  private async verificarPermisos() {
    try {
      const user = await this.auth.getUser();
      if (!user) { this.err = "Debe iniciar sesión"; this.isDuenoSupervisor = false; return; }
      const usuarioDB: Usuario | null = await this.usuarios.getByEmail(user.email!);
      if (!usuarioDB) { this.err = "Usuario no encontrado en la base de datos"; this.isDuenoSupervisor = false; return; }
      this.perfilActual = usuarioDB.perfil?.toLowerCase() || "";
      this.isDuenoSupervisor = this.perfilActual === "dueno" || this.perfilActual === "dueño" || this.perfilActual === "supervisor";
      if (!this.isDuenoSupervisor) this.err = "No tiene permisos para dar de alta empleados";
    } catch { this.err = "Error verificando permisos"; this.isDuenoSupervisor = false; }
  }

  private resetearFormulario() {
    this.formAltaEmpleado.reset();
    this.formAltaEmpleado.markAsUntouched();
    this.formAltaEmpleado.markAsPristine();
    this.err = null;
    this.ok = false;
    this.qrPayload = null;
  }

  async escanearDNI() {
    this.err = null;
    if (!this.isDuenoSupervisor) return;
    this.escaneando = true;
    try {
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.Pdf417, BarcodeFormat.QrCode] });
      if (!result.barcodes?.length) throw new Error("No se detectó ningún código");
      const valor = result.barcodes[0].displayValue || "";
      this.qrPayload = valor;
      const partes = valor.split("@");
      if (partes.length >= 8) {
        const [, apellido, nombre, , dni] = partes;
        this.formAltaEmpleado.patchValue({ nombres: nombre || "", apellidos: apellido || "", dni: dni || "" });
      } else {
        const dniSolo = valor.replace(/\D/g, "");
        if (dniSolo.match(/^\d{7,10}$/)) this.formAltaEmpleado.patchValue({ dni: dniSolo });
        else throw new Error("QR inválido o incompleto");
      }
    } catch (e: any) { this.err = e.message || "Error al escanear el DNI"; }
    finally { this.escaneando = false; }
  }

  async sacarFoto() {
    this.err = null;
    if (!this.isDuenoSupervisor) return;
    try {
      if (this.platform !== "web") {
        const status = await Camera.requestPermissions({ permissions: ["camera"] });
        if (status.camera !== "granted") { this.err = "Permiso de cámara denegado"; return; }
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, quality: 85, source: CameraSource.Camera, allowEditing: false });
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const fileName = `empleado_${Date.now()}.${ext}`;
      const filePath = `empleados/${fileName}`;
      const up = await supabase.storage.from('empleados').upload(filePath, blob, { contentType: blob.type, upsert: true });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from('empleados').getPublicUrl(filePath);
      this.formAltaEmpleado.patchValue({ foto: data.publicUrl });
    } catch (e: any) { this.err = `Error al tomar la foto: ${e.message || e}`; }
  }

  async enviar() {
    this.err = null;
    this.ok = false;
    if (!this.isDuenoSupervisor) return;
    if (this.formAltaEmpleado.invalid) { this.formAltaEmpleado.markAllAsTouched(); return; }

    this.loading = true;
    try {
      const email = String(this.f["correo"].value).trim().toLowerCase();
      const password = String(this.f["clave"].value).trim();
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      const user = new User(
        String(this.f["apellidos"].value).trim(),
        String(this.f["nombres"].value).trim(),
        email,
        String(this.f["perfil"].value).trim(),
        String(this.f["dni"].value).trim(),
        String(this.f["cuil"].value).trim(),
        undefined
      );

      await this.usuarios.createFromUser(user, String(this.f["foto"].value));

      this.ok = true;
      this.formAltaEmpleado.reset();
    } catch (e: any) { this.err = e.message || "No se pudo registrar el empleado"; }
    finally { this.loading = false; }
  }
}