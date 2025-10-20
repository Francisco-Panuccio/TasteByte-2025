import { Component, inject, OnInit } from "@angular/core";
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from "@angular/forms";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Mesa, TipoMesa } from "src/app/interfaces/mesa";
import { Mesas } from "src/app/services/mesas/mesas";
import { b64ToBlob } from "../../functions";
import { Qr } from "src/app/services/qr/qr";
import { ToastController } from "@ionic/angular";

@Component({
  selector: "app-alta-mesa",
  templateUrl: "./alta-mesa.page.html",
  styleUrls: ["./alta-mesa.page.scss"],
  standalone: false
})
export class AltaMesaPage implements OnInit {
  private fb = inject(FormBuilder);
  private mesasSvc = inject(Mesas);
  private qr = inject(Qr);
  private toast = inject(ToastController);

  qrValue: string | undefined;
  loading = true;

  readonly tipos = [
    { label: "VIP", value: "VIP" },
    { label: "Estándar", value: "estándar" },
    { label: "Movilidad Reducida", value: "movilidad_reducida" }
  ] as const;

  placeholderUrl = "assets/icon/signo.png";
  private readonly platform = Capacitor.getPlatform();
  private pendingFoto: { blob: Blob; ext: string; previewUrl: string } | null = null;

  formAltaMesa: FormGroup = this.fb.group({
    numero: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(9999)]),
    capacidad: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(20)]),
    tipo: this.fb.control<string | null>(null, [Validators.required, this.tipoValido()]),
    foto_url: this.fb.control<string>("", [Validators.required])
  });

  get f() { return this.formAltaMesa.controls; }
  get fotoCtrl() { return this.formAltaMesa.get("foto_url")!; }

  ngOnInit() { setTimeout(() => (this.loading = false), 2000); }

  private tipoValido(): ValidatorFn {
    const permitidos = new Set(this.tipos.map(t => t.value));
    return (c: AbstractControl) => (c.value != null && permitidos.has(c.value)) ? null : { tipoInvalido: true };
  }

  async capturarDesdeCamara(): Promise<void> {
    try {
      const onWeb = this.platform === "web";
      if (!onWeb) {
        const perm = await Camera.checkPermissions();
        if (perm.camera !== "granted") {
          const req = await Camera.requestPermissions({ permissions: ["camera"] });
          if (req.camera !== "granted") { await this.mostrarToast("Permiso de cámara denegado", "Error"); return; }
        }
      }

      const ph = await Camera.getPhoto({
        resultType: onWeb ? CameraResultType.Uri : CameraResultType.Base64,
        quality: 85,
        source: CameraSource.Camera,
        allowEditing: false
      });

      let blob: Blob | null = null;
      let ext = "jpg";
      if (onWeb && ph.webPath) {
        const res = await fetch(ph.webPath);
        blob = await res.blob();
        ext = blob.type.includes("png") ? "png" : "jpg";
      } else if (ph.base64String) {
        blob = b64ToBlob(ph.base64String, "image/jpeg");
      }
      if (!blob) return;

      if (this.pendingFoto?.previewUrl) URL.revokeObjectURL(this.pendingFoto.previewUrl);
      const previewUrl = URL.createObjectURL(blob);
      this.pendingFoto = { blob, ext, previewUrl };
      this.fotoCtrl.setValue(previewUrl);
      this.fotoCtrl.markAsTouched();
      this.fotoCtrl.updateValueAndValidity();
    } catch { await this.mostrarToast("Error al tomar foto", "Error"); }
  }

  eliminarFoto(): void {
    if (this.pendingFoto?.previewUrl) URL.revokeObjectURL(this.pendingFoto.previewUrl);
    this.pendingFoto = null;
    this.fotoCtrl.setValue("");
    this.fotoCtrl.markAsDirty();
    this.fotoCtrl.markAsTouched();
    this.fotoCtrl.updateValueAndValidity();
  }

  async enviar() {
    if (this.formAltaMesa.invalid) {
      this.formAltaMesa.markAllAsTouched();
      await this.mostrarToast("Complete los campos obligatorios", "Error");
      return;
    }

    this.loading = true;
    try {
      if (this.pendingFoto) {
        const fileName = `mesa_${Date.now()}.${this.pendingFoto.ext}`;
        const publicUrl = await this.mesasSvc.uploadPhotoBlob(fileName, this.pendingFoto.blob);
        URL.revokeObjectURL(this.pendingFoto.previewUrl);
        this.pendingFoto = null;
        this.fotoCtrl.setValue(publicUrl);
      }

      const numero = Number(this.f["numero"].value);
      const existe = await this.mesasSvc.existsByNumero(numero);
      if (existe) { await this.mostrarToast("Mesa existente", "Error"); this.loading = false; return; }

      const payload: Mesa = {
        numero,
        capacidad: Number(this.f["capacidad"].value),
        tipo: this.f["tipo"].value as TipoMesa,
        foto_url: String(this.fotoCtrl.value)
      };

      const creada = await this.mesasSvc.create(payload);
      await this.mesasSvc.setQr(creada.id!, creada.numero);
      this.qrValue = await this.qr.getQrMesa(creada.id!);

      this.formAltaMesa.reset({ numero: null, capacidad: null, tipo: null, foto_url: "" });
      await this.mostrarToast("Mesa creada", "Éxito");
    } catch { await this.mostrarToast("No se pudo guardar la mesa", "Error"); }
    finally { this.loading = false; }
  }

  private async mostrarToast(message: string, header = "Aviso"): Promise<void> {
    const t = await this.toast.create({ header, message, duration: 1500, cssClass: "toast", position: "top" });
    await t.present();
  }
}