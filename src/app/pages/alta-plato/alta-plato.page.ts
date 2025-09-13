import { Component, inject } from '@angular/core';
import { AbstractControl, AsyncValidatorFn, FormArray, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Plato } from 'src/app/interfaces/plato';
import { Platos } from 'src/app/services/platos/platos';
import { b64ToBlob } from '../../functions';
import { Perfil } from 'src/app/interfaces/perfil';

@Component({
  selector: 'app-alta-plato',
  templateUrl: './alta-plato.page.html',
  styleUrls: ['./alta-plato.page.scss'],
  standalone: false
})
export class AltaPlatoPage {
  private fb = inject(FormBuilder)
  private platos = inject(Platos);
  private readonly platform = Capacitor.getPlatform();

  loading: boolean = true;
  ok = false;
  err: string | null = null;

  formAltaPlato = this.fb.group({
    nombre: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(20)],
      asyncValidators: [this.nombreUnicoValidator()],
      updateOn: 'blur'
    }),
    descripcion: this.fb.control('', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]),
    tiempo_elaboracion_min: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(600)]),
    precio: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(1_000_000)]),
    fotos: this.fb.array<string>(['', '', ''], [this.tresFotosCargadas()])
  });

  get f() { return this.formAltaPlato.controls; }
  get fotosFA(): FormArray { return this.formAltaPlato.get('fotos') as FormArray; }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
  }

  // Perfil
  private getPerfilActual(): Perfil | null {
    const p = localStorage.getItem('perfil')?.toLowerCase() as Perfil | undefined;
    return p ?? null;
  }
  private exigeCocinero(): boolean {
    const p = this.getPerfilActual();
    const ok = p === 'cocinero';
    if (!ok) this.err = 'Acceso restringido: solo cocinero.';
    return ok;
  }

  private nombreUnicoValidator(): AsyncValidatorFn {
    return async (control: AbstractControl) => {
      const v = String(control.value || '').trim();
      if (!v) return null;
      try {
        const exists = await this.platos.existsByNombre(v);
        return exists ? { nombreExistente: true } : null;
      } catch { return null; }
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
    if (!this.exigeCocinero()) return;
    try {
      const perm = await Camera.checkPermissions();
      if (perm.camera !== 'granted' || perm.photos !== 'granted') {
        const req = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (req.camera !== 'granted' || req.photos !== 'granted') { this.err = 'Permisos de cámara/galería denegados'; return; }
      }
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
      } else if (photo.path) {
        const file = await Filesystem.readFile({ path: photo.path });
        blob = typeof file.data === 'string' ? b64ToBlob(file.data, 'image/jpeg') : (file.data as Blob);
      } else if (photo.base64String) {
        blob = b64ToBlob(photo.base64String, 'image/jpeg');
      } else {
        throw new Error('sin datos de imagen');
      }

      const fileName = `plato_${Date.now()}_${slot}.${ext}`;
      const publicUrl = await this.platos.uploadPhotoBlob(fileName, blob);
      this.fotosFA.at(slot).setValue(publicUrl);
      this.fotosFA.updateValueAndValidity();
    } catch { this.err = 'Error al cargar la foto'; }
  }

  async enviar() {
    this.err = null; this.ok = false;
    if (!this.exigeCocinero()) return;
    if (this.formAltaPlato.invalid) { this.formAltaPlato.markAllAsTouched(); return; }

    this.loading = true;
    try {
      const nombre = String(this.f['nombre'].value).trim();
      const exists = await this.platos.existsByNombre(nombre);
      if (exists) { this.err = 'El plato ya existe en la carta'; this.loading = false; return; }

      const payload: Plato = {
        nombre,
        descripcion: String(this.f['descripcion'].value).trim(),
        tiempo_elaboracion_min: Number(this.f['tiempo_elaboracion_min'].value),
        precio: Number(this.f['precio'].value),
        fotos: this.fotosFA.value as string[]
      };

      await this.platos.create(payload);
      this.ok = true;

      this.formAltaPlato.reset({
        nombre: '',
        descripcion: '',
        tiempo_elaboracion_min: null,
        precio: null,
        fotos: ['', '', '']
      });
    } catch { this.err = 'No se pudo guardar el plato'; }
    finally { this.loading = false; }
  }
}
