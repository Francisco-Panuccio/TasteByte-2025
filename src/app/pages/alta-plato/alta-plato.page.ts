import { Component, inject } from "@angular/core";
import { AbstractControl, AsyncValidatorFn, FormArray, FormBuilder, ValidatorFn, Validators } from "@angular/forms";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Plato } from "src/app/interfaces/plato";
import { Platos } from "src/app/services/platos/platos";
import { b64ToBlob } from "../../functions";
import { ActionSheetController, AlertController, ToastController } from "@ionic/angular";

type PendingFoto = { blob: Blob; ext: string; previewUrl: string };

@Component({
  selector: "app-alta-plato",
  templateUrl: "./alta-plato.page.html",
  styleUrls: ["./alta-plato.page.scss"],
  standalone: false
})
export class AltaPlatoPage {
  private fb = inject(FormBuilder);
  private platos = inject(Platos);
  private toast = inject(ToastController);
  private actionSheet = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private readonly platform = Capacitor.getPlatform();

  private pending: Array<PendingFoto | null> = [null, null, null];
  loading: boolean = true;
  placeholderUrl = "assets/icon/signo.png";

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

  get faltanFotos(): number {
    const arr = (this.fotosFA.value as string[]) ?? [];
    return 3 - arr.filter(u => typeof u === "string" && u.trim().length > 0).length;
  }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
  }

  private nombreUnicoValidator(): AsyncValidatorFn {
    return async (control: AbstractControl) => {
      const v = String(control.value || "").trim();
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
        await this.mostrarToast("Ya cargó 3 fotos", "Aviso");
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
        await this.mostrarToast("Ya cargó 3 fotos", "Aviso");
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

  async enviar() {
    if (this.formAltaPlato.invalid) {
      this.formAltaPlato.markAllAsTouched();
      await this.mostrarToast("Complete los campos obligatorios", "Error");
      return;
    }

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
      if (exists) {
        await this.mostrarToast("El plato ya existe en la carta", "Error");
        this.loading = false;
        return;
      }

      const payload: Plato = {
        nombre,
        descripcion: String(this.f["descripcion"].value).trim(),
        tiempo_elaboracion_min: Number(this.f["tiempo_elaboracion_min"].value),
        precio: Number(this.f["precio"].value),
        fotos: this.fotosFA.value as string[],
        esPostre: !!this.f["esPostre"].value
      };

      await this.platos.create(payload);

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

      await this.mostrarToast("Plato creado", "Éxito");
    } catch {
      await this.mostrarToast("No se pudo guardar el plato", "Error");
    } finally {
      this.loading = false;
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