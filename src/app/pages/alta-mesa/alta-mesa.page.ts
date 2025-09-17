import { Component, inject, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Mesa, TipoMesa } from 'src/app/interfaces/mesa';
import { Mesas } from 'src/app/services/mesas/mesas';
import { b64ToBlob } from '../../functions';

@Component({
  selector: 'app-alta-mesa',
  templateUrl: './alta-mesa.page.html',
  styleUrls: ['./alta-mesa.page.scss'],
  standalone: false
})
export class AltaMesaPage implements OnInit {
  private fb = inject(FormBuilder);
  private mesasSvc = inject(Mesas);

  loading = true;
  ok = false;
  err: string | null = null;

  readonly tipos = [
    { label: "VIP", value: "VIP" },
    { label: "Estándar", value: "estándar" },
    { label: "Movilidad Reducida", value: "movilidad_reducida" },
  ] as const;
  private readonly platform = Capacitor.getPlatform();

  private pendingFoto: { blob: Blob; ext: string } | null = null;
  private previewUrl: string | null = null;

  formAltaMesa: FormGroup = this.fb.group({
    numero: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(9999)]),
    capacidad: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(20)]),
    tipo: this.fb.control<string | null>(null, [Validators.required, this.tipoValido()]),
    foto_url: this.fb.control<string>("", [Validators.required])
  });

  get f() { return this.formAltaMesa.controls; }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
  }

  private tipoValido(): ValidatorFn {
    const permitidos = new Set(this.tipos.map(t => t.value));
    return (c: AbstractControl) => c.value != null && permitidos.has(c.value) ? null : { tipoInvalido: true };
  }

  async elegirFoto(source?: "cam" | "gal") {
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

      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = null;
      }

      this.pendingFoto = { blob, ext };
      this.previewUrl = URL.createObjectURL(blob);
      this.formAltaMesa.get("foto_url")!.setValue(this.previewUrl);
    } catch (e) {
      console.error("elegirFoto:", e);
      this.err = "Error al cargar la foto";
    }
  }

  async enviar() {
    this.err = null; this.ok = false;
    if (this.formAltaMesa.invalid) { this.formAltaMesa.markAllAsTouched(); return; }

    this.loading = true;
    try {
      if (this.pendingFoto) {
        const fileName = `mesa_${Date.now()}.${this.pendingFoto.ext}`;
        const publicUrl = await this.mesasSvc.uploadPhotoBlob(fileName, this.pendingFoto.blob);
        this.formAltaMesa.get("foto_url")!.setValue(publicUrl);
      }

      const numero = Number(this.f["numero"].value);
      const existe = await this.mesasSvc.existsByNumero(numero);
      if (existe) { this.err = "Mesa Existente"; this.loading = false; return; }

      const payload: Mesa = {
        numero,
        capacidad: Number(this.f["capacidad"].value),
        tipo: this.f["tipo"].value as TipoMesa,
        foto_url: String(this.f["foto_url"].value)
      };

      const creada = await this.mesasSvc.create(payload);
      await this.mesasSvc.setQr(creada.id!, creada.numero);

      this.ok = true;

      if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); }
      this.previewUrl = null;
      this.pendingFoto = null;

      this.formAltaMesa.reset({ numero: null, capacidad: null, tipo: null, foto_url: "" });
    } catch {
      this.err = "No se pudo guardar la mesa";
    } finally {
      this.loading = false;
    }
  }
}
