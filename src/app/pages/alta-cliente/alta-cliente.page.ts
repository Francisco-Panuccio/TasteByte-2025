import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase } from 'src/supabase.client';
import { Cliente } from 'src/app/interfaces/cliente';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

@Component({
  selector: 'app-alta-cliente',
  templateUrl: './alta-cliente.page.html',
  styleUrls: ['./alta-cliente.page.scss'],
  standalone: false
})
export class AltaClientePage {
  private fb = inject(FormBuilder);
  private readonly platform = Capacitor.getPlatform();

  loading = false;
  ok = false;
  err: string | null = null;
  escaneando = false;

  formAltaCliente = this.fb.group({
    nombres: ['', [Validators.required, Validators.minLength(2)]],
    apellidos: ['', [Validators.required, Validators.minLength(2)]],
    dni: ['', [Validators.required, Validators.pattern(/^\d{7,10}$/)]],
    correo: ['', [Validators.required, Validators.email]],
    clave: ['', [Validators.required, Validators.minLength(6)]],
    foto: ['', [Validators.required]]
  });

  get f() { return this.formAltaCliente.controls; }

  // ------------------ Escaneo DNI ------------------
  async escanearDNI() {
    this.err = null;
    this.escaneando = true;

    try {
      const result = await BarcodeScanner.scan();

      if (result.barcodes && result.barcodes.length > 0) {
        const valor = result.barcodes[0].displayValue || '';
        const partes = valor.split('@');

        if (partes.length >= 8) {
          const [, apellido, nombre, , dni] = partes;

          this.formAltaCliente.patchValue({
            nombres: nombre || '',
            apellidos: apellido || '',
            dni: dni || ''
          });
        } else {
          this.err = 'QR inválido o incompleto';
        }
      } else {
        this.err = 'No se detectó ningún código';
      }
    } catch (e) {
      console.error(e);
      this.err = 'Error al escanear el DNI';
    } finally {
      this.escaneando = false;
    }
  }

  // ------------------ Tomar Foto ------------------
  async sacarFoto() {
    this.err = null;

    try {
      // Pedir permisos en Android/iOS
      if (this.platform !== 'web') {
        const status = await Camera.requestPermissions({ permissions: ['camera'] });
        if (status.camera !== 'granted') {
          this.err = 'Permiso de cámara denegado';
          return;
        }
      }

      // Tomar foto
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: CameraSource.Camera
      });

      let blob: Blob;
      let ext = 'jpg';

      if (photo.webPath) {
        // WebPath funciona en web y mobile
        const response = await fetch(photo.webPath);
        blob = await response.blob();
        ext = blob.type.includes('png') ? 'png' : 'jpg';
      } else if (photo.base64String) {
        blob = this.base64ToBlob(photo.base64String, 'image/jpeg');
      } else {
        throw new Error('No se pudo obtener la imagen');
      }

      // Subir a Supabase
      const fileName = `cliente_${Date.now()}.${ext}`;
      const filePath = `clientes/${fileName}`;

      const { error } = await supabase.storage
        .from('clientes')
        .upload(filePath, blob, { contentType: blob.type, upsert: true });

      if (error) throw error;

      const { data } = supabase.storage.from('clientes').getPublicUrl(filePath);
      this.formAltaCliente.patchValue({ foto: data.publicUrl });

    } catch (e: any) {
      console.error('Error al tomar la foto:', e);
      this.err = `Error al tomar la foto: ${e.message || e}`;
    }
  }

  // ------------------ Utilidad ------------------
  private base64ToBlob(base64: string, type = 'application/octet-stream') {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type });
  }

  // ------------------ Enviar ------------------
  async enviar() {
    this.err = null; this.ok = false;
    if (this.formAltaCliente.invalid) {
      this.formAltaCliente.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const payload: Cliente = {
        nombres: String(this.f['nombres'].value).trim(),
        apellidos: String(this.f['apellidos'].value).trim(),
        dni: String(this.f['dni'].value).trim(),
        correo: String(this.f['correo'].value).trim(),
        clave: String(this.f['clave'].value).trim(),
        perfil: 'cliente',
        estado: 'pendiente',
        foto: String(this.f['foto'].value)
      };

      const { error } = await supabase.from('clientes').insert(payload);
      if (error) throw error;

      this.ok = true;
      this.formAltaCliente.reset();
    } catch (e) {
      console.error(e);
      this.err = 'No se pudo registrar el cliente';
    } finally {
      this.loading = false;
    }
  }
}
