import { Component, inject } from '@angular/core';
import { AbstractControl, AsyncValidatorFn, FormArray, FormBuilder, ValidatorFn, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Plato } from 'src/app/interfaces/plato';
import { Platos } from 'src/app/services/platos/platos';
import { b64ToBlob } from '../../functions';

type PendingFoto = { blob: Blob; ext: string; previewUrl: string };

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

  private pending: Array<PendingFoto | null> = [null, null, null];

  formAltaPlato = this.fb.group({
    nombre: this.fb.control("", {
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(20)],
      asyncValidators: [this.nombreUnicoValidator()],
      updateOn: "blur"
    }),
    descripcion: this.fb.control("", [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]),
    tiempo_elaboracion_min: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(600)]),
    precio: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(1_000_000)]),
    fotos: this.fb.array<string>(["", "", ""], [this.tresFotosCargadas()]),
    esPostre: this.fb.control(false)
  });

  get f() { return this.formAltaPlato.controls; }
  get fotosFA(): FormArray { return this.formAltaPlato.get("fotos") as FormArray; }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
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

  async elegirFoto(slot: number, source?: "cam" | "gal") {
    this.err = null;
    try {
      const onWeb = this.platform === "web";
      if (!onWeb) {
        const needPhotos = source === "gal";
        const perm = await Camera.checkPermissions();
        if (perm.camera !== "granted" || (needPhotos && perm.photos !== "granted")) {
          const req = await Camera.requestPermissions({ permissions: needPhotos ? ["camera", "photos"] : ["camera"] });
          if (req.camera !== "granted" || (needPhotos && req.photos !== "granted")) {
            this.err = "Permisos de cámara/galería denegados";
            return;
          }
        }
      }

      const photo = await Camera.getPhoto({
        resultType: onWeb ? CameraResultType.Uri : CameraResultType.Base64,
        quality: 85,
        source: source ? (source === "cam" ? CameraSource.Camera : CameraSource.Photos) : CameraSource.Prompt,
        allowEditing: false
      });

      let blob: Blob;
      let ext = "jpg";

      if (onWeb && photo.webPath) {
        const res = await fetch(photo.webPath);
        blob = await res.blob();
        ext = blob.type.includes("png") ? "png" : "jpg";
      } else if (photo.base64String) {
        blob = b64ToBlob(photo.base64String, "image/jpeg");
      } else {
        throw new Error("No se pudo obtener la imagen");
      }

      if (this.pending[slot]?.previewUrl) {
        URL.revokeObjectURL(this.pending[slot]!.previewUrl);
      }

      const previewUrl = URL.createObjectURL(blob);
      this.pending[slot] = { blob, ext, previewUrl };

      this.fotosFA.at(slot).setValue(previewUrl);
      this.fotosFA.updateValueAndValidity();
    } catch (e) {
      console.error("elegirFoto:", e);
      this.err = "Error al cargar la foto";
    }
  }

  async enviar() {
    this.err = null; this.ok = false;
    if (this.formAltaPlato.invalid) { this.formAltaPlato.markAllAsTouched(); return; }

    this.loading = true;
    try {
      for (let i = 0; i < this.pending.length; i++) {
        const p = this.pending[i];
        if (!p) continue;
        const fileName = `plato_${Date.now()}_${i}.${p.ext}`;
        const publicUrl = await this.platos.uploadPhotoBlob(fileName, p.blob);
        this.fotosFA.at(i).setValue(publicUrl);
        URL.revokeObjectURL(p.previewUrl);
        this.pending[i] = null;
      }
      this.fotosFA.updateValueAndValidity();

      const nombre = String(this.f["nombre"].value).trim();
      const exists = await this.platos.existsByNombre(nombre);
      if (exists) { this.err = "El plato ya existe en la carta"; this.loading = false; return; }

      const payload: Plato = {
        nombre,
        descripcion: String(this.f["descripcion"].value).trim(),
        tiempo_elaboracion_min: Number(this.f["tiempo_elaboracion_min"].value),
        precio: Number(this.f["precio"].value),
        fotos: this.fotosFA.value as string[],
        esPostre: !!this.f["esPostre"].value
      };

      await this.platos.create(payload);
      this.ok = true;

      for (let i = 0; i < this.pending.length; i++) {
        if (this.pending[i]?.previewUrl) URL.revokeObjectURL(this.pending[i]!.previewUrl);
        this.pending[i] = null;
      }

      this.formAltaPlato.reset({
        nombre: "",
        descripcion: "",
        tiempo_elaboracion_min: null,
        precio: null,
        fotos: ["", "", ""],
        esPostre: false
      });
    } catch { this.err = "No se pudo guardar el plato"; }
    finally { this.loading = false; }
  }
}
