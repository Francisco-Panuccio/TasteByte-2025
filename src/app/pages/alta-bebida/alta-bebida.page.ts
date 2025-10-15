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
import { ActionSheetController, AlertController, ToastController } from "@ionic/angular";

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
  private toast = inject(ToastController);
  private actionSheet = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private readonly platform = Capacitor.getPlatform();

  loading = true;

  placeholderUrl = "assets/icon/signo.png";
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

  get faltanFotos(): number {
    const arr = (this.fotosFA.value as string[]) ?? [];
    return 3 - arr.filter(u => typeof u === "string" && u.trim().length > 0).length;
  }

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
    if (!ok) await this.mostrarToast("Acceso restringido: solo bartender.", "Error");
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
      return regex.test(String(v)) ? null : { decimales: true };
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

  private nextEmptyIndex(): number {
    const arr = (this.fotosFA.value as string[]) || [];
    for (let i = 0; i < 3; i++) {
      const v = arr[i];
      if (!v || String(v).trim() === "") return i;
    }
    return -1;
  }

  private async setPhotoAt(index: number, blob: Blob): Promise<void> {
    const ext = blob.type.includes("png") ? "png" : "jpg";
    if (this.pending[index]?.previewUrl) URL.revokeObjectURL(this.pending[index]!.previewUrl);
    const previewUrl = URL.createObjectURL(blob);
    this.pending[index] = { blob, ext, previewUrl };
    this.fotosFA.at(index).setValue(previewUrl);
  }

  async elegirFotos(): Promise<void> {
    if (!(await this.exigeBartender())) return;
    const sheet = await this.actionSheet.create({
      cssClass: "action-sheet-form",
      buttons: [
        { text: "Cámara", handler: () => this.capturarSecuencial() },
        { text: "Galería", handler: () => this.seleccionarDesdeGaleria() },
        { text: "Cancelar", role: "cancel" }
      ]
    });
    await sheet.present();
  }

  private async seleccionarDesdeGaleria(): Promise<void> {
    try {
      const onWeb = this.platform === "web";
      if (!onWeb) {
        const perm = await Camera.checkPermissions();
        if (perm.photos !== "granted") {
          const req = await Camera.requestPermissions({ permissions: ["photos"] });
          if (req.photos !== "granted") {
            await this.mostrarToast("Permisos de galería denegados", "Error");
            return;
          }
        }
      }

      const libres = Math.max(0, this.faltanFotos);
      if (libres === 0) {
        await this.mostrarToast("Ya cargaste 3 fotos", "Aviso");
        return;
      }

      const result: any = await (Camera as any).pickImages({ quality: 85, limit: libres });
      const photos = Array.isArray(result?.photos) ? result.photos : [];
      if (photos.length === 0) {
        this.fotosFA.markAsTouched();
        return;
      }

      for (const ph of photos) {
        const idx = this.nextEmptyIndex();
        if (idx === -1) break;

        let blob: Blob | null = null;
        const webPath: string | undefined = ph.webPath ?? ph.path;
        if (webPath) {
          const res = await fetch(webPath);
          blob = await res.blob();
        } else if (ph.base64String) {
          blob = b64ToBlob(ph.base64String, "image/jpeg");
        }
        if (!blob) continue;

        await this.setPhotoAt(idx, blob);
      }

      this.fotosFA.markAsTouched();
      this.fotosFA.updateValueAndValidity();
    } catch {
      await this.mostrarToast("Error al seleccionar fotos", "Error");
    }
  }

  private async capturarSecuencial(): Promise<void> {
    try {
      const onWeb = this.platform === "web";
      if (!onWeb) {
        const perm = await Camera.checkPermissions();
        if (perm.camera !== "granted") {
          const req = await Camera.requestPermissions({ permissions: ["camera"] });
          if (req.camera !== "granted") {
            await this.mostrarToast("Permiso de cámara denegado", "Error");
            return;
          }
        }
      }

      let restantes = this.faltanFotos;
      if (restantes === 0) {
        await this.mostrarToast("Ya cargaste 3 fotos", "Aviso");
        return;
      }

      while (restantes > 0) {
        const photo = await Camera.getPhoto({
          resultType: onWeb ? CameraResultType.Uri : CameraResultType.Base64,
          quality: 85,
          source: CameraSource.Camera,
          allowEditing: false
        });

        let blob: Blob | null = null;
        if (onWeb && photo.webPath) {
          const res = await fetch(photo.webPath);
          blob = await res.blob();
        } else if (photo.base64String) {
          blob = b64ToBlob(photo.base64String, "image/jpeg");
        }
        if (!blob) break;

        const idx = this.nextEmptyIndex();
        if (idx === -1) break;
        await this.setPhotoAt(idx, blob);

        restantes = this.faltanFotos;
        if (restantes > 0) {
          const alert = await this.alertCtrl.create({
            cssClass: "alert-foto",
            header: "Foto Guardada",
            message: `Falta/n ${restantes} foto/s más. ¿Tomar otra?`,
            buttons: [
              { text: "No", role: "cancel" },
              { text: "Si", role: "confirm" }
            ]
          });
          await alert.present();
          const { role } = await alert.onDidDismiss();
          if (role !== "confirm") break;
        }
      }

      this.fotosFA.markAsTouched();
      this.fotosFA.updateValueAndValidity();
    } catch {
      await this.mostrarToast("Error al tomar foto", "Error");
    }
  }

  eliminarFoto(i: number): void {
    const p = this.pending[i];
    if (p?.previewUrl) {
      URL.revokeObjectURL(p.previewUrl);
    }
    this.pending[i] = null;
    this.fotosFA.at(i).setValue("");
    this.fotosFA.markAsDirty();
    this.fotosFA.markAsTouched();
    this.fotosFA.updateValueAndValidity();
  }

  async enviar() {
    if (!(await this.exigeBartender())) return;
    if (this.formAltaBebida.invalid) {
      this.formAltaBebida.markAllAsTouched();
      await this.mostrarToast("Completá los campos obligatorios", "Error");
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
        await this.mostrarToast("La bebida ya existe en la carta", "Error");
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

      await this.mostrarToast("Bebida creada", "Éxito");
    } catch {
      await this.mostrarToast("No se pudo guardar la bebida", "Error");
    } finally {
      this.loading = false;
    }
  }

  private async mostrarToast(message: string, header = "Aviso"): Promise<void> {
    const t = await this.toast.create({
      header,
      message,
      duration: 1500,
      cssClass: "toast",
      position: "top"
    });
    await t.present();
  }
}