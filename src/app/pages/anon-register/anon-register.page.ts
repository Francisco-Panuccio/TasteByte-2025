import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { supabase } from 'src/supabase.client';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-anon-register',
  templateUrl: './anon-register.page.html',
  styleUrls: ['./anon-register.page.scss'],
  standalone: false,
})
export class AnonRegisterPage implements OnInit {
  formAnon = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    foto: ['', Validators.required],
  });

  loading = false;
  err: string | null = null;

  constructor(private fb: FormBuilder, private router: Router) {}

  ngOnInit() {
    setTimeout(() => {
      this.loading = false;
    }, 2000);
  }

  async sacarFoto() {
    this.err = null;
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: CameraSource.Camera,
      });

      let blob: Blob;
      let ext = 'jpg';

      if (photo.webPath) {
        const response = await fetch(photo.webPath);
        blob = await response.blob();
        ext = blob.type.includes('png') ? 'png' : 'jpg';
      } else {
        throw new Error('No se pudo obtener la imagen');
      }

      const fileName = `anonimo_${Date.now()}.${ext}`;
      const filePath = `clientes_anonimos/${fileName}`;

      const up = await supabase.storage
        .from('clientes')
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });
      if (up.error) throw up.error;

      const { data } = supabase.storage.from('clientes').getPublicUrl(filePath);
      this.formAnon.patchValue({ foto: data.publicUrl });
    } catch (e: any) {
      this.err = e.message || 'Error al tomar la foto';
    }
  }

  async registrarAnonimo() {
    if (this.formAnon.invalid) {
      this.formAnon.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const { nombre, foto } = this.formAnon.value;

      const { data, error } = await supabase
        .from('clientes_anonimos')
        .insert({
          nombre,
          foto_url: foto,
        })
        .select('id')
        .single();

      if (error) throw error;

      const anonimoId = data.id;

      this.router.navigate(['/encuestas-espera'], {
        queryParams: {
          anonimoId,
          tienePermiso: true,
          yaRegistrado: true,
          qrValido: true,
        },
        replaceUrl: true,
      });
    } catch (e: any) {
      this.err = e.message || 'No se pudo registrar anónimo';
    } finally {
      this.loading = false;
    }
  }
}
