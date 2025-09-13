import { Component, inject, OnInit } from '@angular/core';
import { AbstractControl, AsyncValidatorFn, FormArray, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Bebida } from 'src/app/interfaces/bebida';
import { Bebidas } from 'src/app/services/bebidas';
import { Perfil } from 'src/app/interfaces/perfil';
import {supabase} from '../../../supabase.client';

@Component({
  selector: 'app-alta-bebida',
  templateUrl: './alta-bebida.page.html',
  styleUrls: ['./alta-bebida.page.scss'],
  standalone: false
})
export class AltaBebidaPage implements OnInit{
  private fb = inject(FormBuilder);
  private bebidas = inject(Bebidas);
  private readonly platform = Capacitor.getPlatform();

  loading = true;
  ok = false;
  err: string | null = null;
  accesoRestringido = false;

  formAltaBebida = this.fb.group({
    nombre: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(30)],
      asyncValidators: [this.nombreUnicoValidator()],
      updateOn: 'change'
    }),
    descripcion: this.fb.control('', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]),
    tiempo_elaboracion_min: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(180)]),
    precio: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.5),
      Validators.max(500_000),
      this.decimalesValidator(2)
    ]),
    fotos: this.fb.array<string>(['', '', ''], [this.tresFotosCargadas()])
  });

  get f() { return this.formAltaBebida.controls; }
  get fotosFA(): FormArray { return this.formAltaBebida.get('fotos') as FormArray; }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
  }

  constructor() {
    if (!this.esBartender()) {
      this.accesoRestringido = true;
      this.formAltaBebida.disable();
      this.err = 'Acceso restringido: solo bartender.';
    }
  }

  private esBartender(): boolean {
    const perfil = localStorage.getItem('perfil')?.toLowerCase() as Perfil | undefined;
    return perfil === 'bartender';
  }

  private nombreUnicoValidator(): AsyncValidatorFn {
    return async (control: AbstractControl) => {
      const v = String(control.value || '').trim();
      if (!v) return null;
      try {
        const lista = await this.bebidas.list();
        const exists = lista.some(b => b.nombre.toLowerCase() === v.toLowerCase());
        return exists ? { nombreExistente: true } : null;
      } catch { return null; }
    };
  }

 private decimalesValidator(maxDecimales: number): ValidatorFn {
    return (ctrl: AbstractControl) => {
    const v = ctrl.value;
    if (v == null || v === '') return null;
    const regex = new RegExp(`^\\d+(\\.\\d{1,${maxDecimales}})?$`);
    return regex.test(v) ? null : { decimales: true };
  };
}

  private tresFotosCargadas(): ValidatorFn {
    return (fa: AbstractControl) => {
      const arr = (fa.value as string[]) || [];
      const lenOk = Array.isArray(arr) && arr.length === 3;
      const allFilled = lenOk && arr.every(u => typeof u === 'string' && u.trim().length > 0);
      return allFilled ? null : { fotosIncompletas: true };
    };
  }

  async elegirFoto(slot: number, source?: 'cam' | 'gal') {
    this.err = null;
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: source ? (source === 'cam' ? CameraSource.Camera : CameraSource.Photos) : CameraSource.Prompt
      });

      let blob: Blob;
      let ext = 'jpg';

      if (this.platform === 'web' && photo.webPath) {
        const res = await fetch(photo.webPath);
        blob = await res.blob();
        ext = blob.type.includes('png') ? 'png' : 'jpg';
      } else if (photo.base64String) {

        const byteCharacters = atob(photo.base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
      } else {
        throw new Error('sin datos de imagen');
      }

      const fileName = `bebida_${Date.now()}_${slot}.${ext}`;

      const { error: uploadError } = await supabase
        .storage
        .from('bebidas')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase
        .storage
        .from('bebidas')
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;


      this.fotosFA.at(slot).setValue(publicUrl);
      this.fotosFA.updateValueAndValidity();
    } catch {
      this.err = 'Error al cargar la foto';
    }
  }

  async enviar() {
    this.err = null; this.ok = false;
    if (this.accesoRestringido) return;
    if (this.formAltaBebida.invalid) { this.formAltaBebida.markAllAsTouched(); return; }

    this.loading = true;
    try {
      const payload: Bebida = {
        nombre: String(this.f['nombre'].value).trim(),
        descripcion: String(this.f['descripcion'].value).trim(),
        tiempo_elaboracion_min: Number(this.f['tiempo_elaboracion_min'].value),
        precio: Number(this.f['precio'].value),
        fotos: this.fotosFA.value as string[]
      };

      await this.bebidas.create(payload);
      this.ok = true;

      this.formAltaBebida.reset({
        nombre: '',
        descripcion: '',
        tiempo_elaboracion_min: null,
        precio: null,
        fotos: ['', '', '']
      });
    } catch { this.err = 'No se pudo guardar la bebida'; }
    finally { this.loading = false; }
  }
}
