import { Component, inject, OnInit } from "@angular/core";
import { AbstractControl, AsyncValidatorFn, FormArray, FormBuilder, ValidatorFn, Validators } from "@angular/forms";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Bebida } from "src/app/interfaces/bebida";
import { Bebidas } from "src/app/services/bebidas/bebidas";
import { Perfil } from "src/app/interfaces/perfil";
import { supabase } from "../../../supabase.client";
import { AuthService } from "src/app/services/auth/auth";
import { b64ToBlob } from "../../functions";

type PendingFoto = { blob: Blob; ext: string; previewUrl: string };

@Component({
  selector: "app-alta-bebida",
  templateUrl: "./alta-bebida.page.html",
  styleUrls: ["./alta-bebida.page.scss"],
  standalone: false
})
export class AltaBebidaPage implements OnInit {
  private fb = inject(FormBuilder);
  private bebidas = inject(Bebidas);
  private auth = inject(AuthService);
  private readonly platform = Capacitor.getPlatform();

  loading = true;
  ok = false;
  err: string | null = null;

  private pending: Array<PendingFoto | null> = [null, null, null];

  formAltaBebida = this.fb.group({
    nombre: this.fb.control("", {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(30)],
      asyncValidators: [this.nombreUnicoValidator()],
      updateOn: "blur"
    }),
    descripcion: this.fb.control("", [Validators.required, Validators.minLength(10), Validators.maxLength(500)]),
    tiempo_elaboracion_min: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(180)]),
    precio: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0.5),
      Validators.max(500_000),
      this.decimalesValidator(2)
    ]),
    fotos: this.fb.array<string>(["", "", ""], [this.tresFotosCargadas()])
  });

  get f() { return this.formAltaBebida.controls; }
  get fotosFA(): FormArray { return this.formAltaBebida.get("fotos") as FormArray; }

  async ngOnInit() {
    setTimeout(() => (this.loading = false), 2000);
    const esBartender = await this.exigeBartender();
    if (!esBartender) this.formAltaBebida.disable();
  }

  private async getPerfilActual(): Promise<Perfil | null> {
    try {
      const user = await this.auth.getUser();
      if (!user?.email) return null;
      const { data, error } = await supabase.from("usuarios").select("perfil").eq("correo_electronico", user.email).single();
      if (error || !data) return null;
      return (data.perfil as string).toLowerCase() as Perfil;
    } catch {
      return null;
    }
  }

  private async exigeBartender(): Promise<boolean> {
    const p = await this.getPerfilActual();
    const ok = p === "bartender";
    if (!ok) this.err = "Acceso restringido: solo bartender.";
    return ok;
  }

  private nombreUnicoValidator(): AsyncValidatorFn {
    return async (control: AbstractControl) => {
      const v = String(control.value || "").trim();
      if (!v) return null;
      try {
        const exists = await this.bebidas.existsByNombre(v);
        return exists ? { nombreExistente: true } : null;
      } catch {
        return null;
      }
    };
  }

  private decimalesValidator(maxDecimales: number): ValidatorFn {
    return (ctrl: AbstractControl) => {
      const v = ctrl.value;
      if (v == null || v === "") return null;
      const regex = new RegExp(`^\\d+(\\.\\d{1,${maxDecimales}})?$`);
      return regex.test(v) ? null : { decimales: true };
    };
  }

  private tresFotosCargadas(): ValidatorFn {
    return (fa: AbstractControl) => {
      const arr = (fa.value as string[]) || [];
      const lenOk = Array.isArray(arr) && arr.length === 3;
      const allFilled = lenOk && arr.every(u => typeof u === "string" && u.trim().length > 0);
      return allFilled ? null : { fotosIncompletas: true };
    };
  }

  async elegirFoto(slot: number, source?: "cam" | "gal") {
    this.err = null;
    if (!(await this.exigeBartender())) return;

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
    this.err = null;
    this.ok = false;
    if (!(await this.exigeBartender())) return;
    if (this.formAltaBebida.invalid) {
      this.formAltaBebida.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      for (let i = 0; i < this.pending.length; i++) {
        const p = this.pending[i];
        if (!p) continue;
        const fileName = `bebida_${Date.now()}_${i}.${p.ext}`;
        const publicUrl = await this.bebidas.uploadPhotoBlob(fileName, p.blob);
        this.fotosFA.at(i).setValue(publicUrl);
        URL.revokeObjectURL(p.previewUrl);
        this.pending[i] = null;
      }
      this.fotosFA.updateValueAndValidity();

      const nombre = String(this.f["nombre"].value).trim();
      const exists = await this.bebidas.existsByNombre(nombre);
      if (exists) {
        this.err = "La bebida ya existe en la carta";
        this.loading = false;
        return;
      }

      const payload: Bebida = {
        nombre,
        descripcion: String(this.f["descripcion"].value).trim(),
        tiempo_elaboracion_min: Number(this.f["tiempo_elaboracion_min"].value),
        precio: Number(this.f["precio"].value),
        fotos: this.fotosFA.value as string[]
      };

      await this.bebidas.create(payload);
      this.ok = true;

      for (let i = 0; i < this.pending.length; i++) {
        if (this.pending[i]?.previewUrl) URL.revokeObjectURL(this.pending[i]!.previewUrl);
        this.pending[i] = null;
      }

      this.formAltaBebida.reset({
        nombre: "",
        descripcion: "",
        tiempo_elaboracion_min: null,
        precio: null,
        fotos: ["", "", ""]
      });
    } catch {
      this.err = "No se pudo guardar la bebida";
    } finally {
      this.loading = false;
    }
  }
}