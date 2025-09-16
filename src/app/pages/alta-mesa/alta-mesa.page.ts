import { Component, inject, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Mesa, TipoMesa } from 'src/app/interfaces/mesa';
import { Mesas } from 'src/app/services/mesas/mesas';
import { b64ToBlob } from '../../functions';
import { AuthService } from 'src/app/services/auth/auth';
import { Perfil } from 'src/app/interfaces/perfil';

@Component({
  selector: 'app-alta-mesa',
  templateUrl: './alta-mesa.page.html',
  styleUrls: ['./alta-mesa.page.scss'],
  standalone: false
})
export class AltaMesaPage implements OnInit {
  private fb = inject(FormBuilder);
  private mesasSvc = inject(Mesas);
  private auth = inject(AuthService);

  loading = true;
  ok = false;
  err: string | null = null;

  readonly tipos = [
    { label: "VIP", value: "VIP" },
    { label: "Estándar", value: "estándar" },
    { label: "Movilidad Reducida", value: "movilidad_reducida" },
  ] as const;
  private readonly platform = Capacitor.getPlatform();

  formAltaMesa: FormGroup = this.fb.group({
    numero: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(9999)]),
    capacidad: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(20)]),
    tipo: this.fb.control<string>("", [Validators.required, this.tipoValido()]),
    foto_url: this.fb.control<string>("", [Validators.required])
  });

  get f() { return this.formAltaMesa.controls; }

  ngOnInit() {
    setTimeout(() => this.loading = false, 2000);
  }

  private tipoValido(): ValidatorFn {
    const permitidos = new Set(this.tipos.map(t => t.value));
    return (c: AbstractControl) => permitidos.has(c.value) ? null : { tipoInvalido: true };
  }

  private async getPerfilActual(): Promise<Perfil | null> {
    try {
      const user = await this.auth.getUser();
      const meta = (user as any)?.user_metadata;
      const p: string | undefined = meta?.perfil ?? meta?.role ?? meta?.rol;
      if (p) return p.toLowerCase() as Perfil;
    } catch { }
    const local = localStorage.getItem("perfil")?.toLowerCase() as Perfil | undefined;
    return local ?? null;
  }

  private async exigeDuenoOSupervisor(): Promise<boolean> {
    const p = await this.getPerfilActual();
    const ok: boolean = p === "dueño" || p === "dueno" || p === "supervisor";
    if (!ok) this.err = "Acceso Restringido Solo Dueño o Supervisor.";
    return ok;
  }

  async elegirFoto(source?: "cam" | "gal") {
    this.err = null;
    try {
      if (!(await this.exigeDuenoOSupervisor())) return;

      const perm = await Camera.checkPermissions();
      if (perm.camera !== "granted" || perm.photos !== "granted") {
        const req = await Camera.requestPermissions({ permissions: ["camera", "photos"] });
        if (req.camera !== "granted" || req.photos !== "granted") { this.err = "Permisos Denegados"; return; }
      }

      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: source ? (source === "cam" ? CameraSource.Camera : CameraSource.Photos) : CameraSource.Prompt
      });

      let blob: Blob;
      let ext = "jpg";

      if (this.platform === "web" && photo.webPath) {
        const res = await fetch(photo.webPath);
        blob = await res.blob();
        ext = blob.type.includes("png") ? "png" : "jpg";
      } else if (photo.path) {
        const file = await Filesystem.readFile({ path: photo.path });
        blob = typeof file.data === "string" ? b64ToBlob(file.data, "image/jpeg") : (file.data as Blob);
      } else if (photo.base64String) {
        blob = b64ToBlob(photo.base64String, "image/jpeg");
      } else {
        throw new Error("Sin imagen");
      }

      const fileName = `mesa_${Date.now()}.${ext}`;
      const url = await this.mesasSvc.uploadPhotoBlob(fileName, blob);
      this.formAltaMesa.get("foto_url")!.setValue(url);
    } catch {
      this.err = "Error al cargar la foto";
    }
  }

  async enviar() {
    this.err = null; this.ok = false;
    if (this.formAltaMesa.invalid) { this.formAltaMesa.markAllAsTouched(); return; }
    if (!(await this.exigeDuenoOSupervisor())) return;

    this.loading = true;
    try {
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
      this.formAltaMesa.reset({ numero: null, capacidad: null, tipo: null, foto_url: "" });
    } catch {
      this.err = "No se pudo guardar la mesa";
    } finally {
      this.loading = false;
    }
  }
}
