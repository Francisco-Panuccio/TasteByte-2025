import { Component, inject, OnInit } from "@angular/core";
import { AbstractControl, FormBuilder, ValidationErrors, ValidatorFn, Validators } from "@angular/forms";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { supabase } from "src/supabase.client";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { AuthService } from "src/app/services/auth/auth";
import { Usuario } from "src/app/interfaces/usuario";
import { User } from "src/app/classes/user";
import { ToastController } from "@ionic/angular";

@Component({
  selector: "app-alta-empleado",
  templateUrl: "./alta-empleado.page.html",
  styleUrls: ["./alta-empleado.page.scss"],
  standalone: false
})
export class AltaEmpleadoPage implements OnInit {
  private fb = inject(FormBuilder);
  private usuarios = inject(Usuarios);
  private auth = inject(AuthService);
  private toast = inject(ToastController);
  private readonly platform = Capacitor.getPlatform();

  loading = true;
  escaneando = false;
  qrPayload: string | null = null;
  fotoPreview: string | null = null;

  isDuenoSupervisor = false;
  perfilActual = "";

  constructor() {
    this.formAltaEmpleado = this.fb.group(
      {
        nombres: ["", [Validators.required, Validators.minLength(3)]],
        apellidos: ["", [Validators.required, Validators.minLength(3)]],
        dni: ["", [Validators.required, this.dniValidator]],
        cuil: ["", [Validators.required, this.cuilValidator]],
        correo: ["", [Validators.required, Validators.email]],
        clave: ["", [Validators.required, Validators.minLength(6)]],
        confirm: ["", [Validators.required]],
        perfil: ["", [Validators.required]],
        foto: ["", [Validators.required]]
      },
      { validators: this.passwordsMatch }
    );
  }

  formAltaEmpleado: ReturnType<FormBuilder["group"]>;

  get f() { return this.formAltaEmpleado.controls; }

  get isFormValid(): boolean {
    return this.formAltaEmpleado.valid && !!this.fotoPreview;
  }

  passwordsMatch: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const pass = group.get("clave")?.value ?? "";
    const conf = group.get("confirm")?.value ?? "";
    const confirmCtrl = group.get("confirm");
    if (!confirmCtrl) return null;
    const others = { ...(confirmCtrl.errors ?? {}) };
    delete (others as any)["passwordmatch"];
    if (conf && pass !== conf) {
      confirmCtrl.setErrors({ ...others, passwordmatch: true });
      return { passwordmatch: true };
    } else {
      confirmCtrl.setErrors(Object.keys(others).length ? others : null);
      return null;
    }
  };

  dniValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? "").replace(/\D/g, "");
    return v.length === 8 ? null : { dni: true };
  };

  cuilValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? "").replace(/\D/g, "");
    return v.length === 11 ? null : { cuil: true };
  };

  async ngOnInit() {
    this.resetearFormulario();
    await this.verificarPermisos();
    this.loading = false;
  }

  ionViewWillEnter() {
    this.resetearFormulario();
  }

  private async verificarPermisos() {
    try {
      const user = await this.auth.getUser();
      if (!user) {
        await this.mostrarToast("Debe iniciar sesión.", "Error");
        this.isDuenoSupervisor = false;
        return;
      }
      const usuarioDB: Usuario | null = await this.usuarios.getByEmail(user.email!);
      if (!usuarioDB) {
        await this.mostrarToast("Usuario no encontrado en la base de datos.", "Error");
        this.isDuenoSupervisor = false;
        return;
      }
      this.perfilActual = usuarioDB.perfil?.toLowerCase() || "";
      this.isDuenoSupervisor = this.perfilActual === "dueno" || this.perfilActual === "dueño" || this.perfilActual === "supervisor";
      if (!this.isDuenoSupervisor) {
        await this.mostrarToast("No tiene permisos para dar de alta empleados.", "Error");
      }
    } catch {
      await this.mostrarToast("Error verificando permisos.", "Error");
      this.isDuenoSupervisor = false;
    }
  }

  private resetearFormulario() {
    this.formAltaEmpleado.reset();
    this.formAltaEmpleado.markAsUntouched();
    this.formAltaEmpleado.markAsPristine();
    this.qrPayload = null;
    this.fotoPreview = null;
  }

  private base64ToBlob(b64: string, mime: string): Blob {
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  }

  async escanearDNI() {
    if (!this.isDuenoSupervisor) return;
    this.escaneando = true;
    try {
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.Pdf417, BarcodeFormat.QrCode] });
      if (!result.barcodes?.length) throw new Error("No se detectó ningún código.");
      const valor = result.barcodes[0].displayValue || "";
      this.qrPayload = valor;
      const partes = valor.split("@");
      if (partes.length >= 8) {
        const [, apellido, nombre, , dni] = partes;
        this.formAltaEmpleado.patchValue({ nombres: nombre || "", apellidos: apellido || "", dni: dni || "" });
      } else {
        const dniSolo = valor.replace(/\D/g, "");
        if (dniSolo.match(/^\d{7,10}$/)) this.formAltaEmpleado.patchValue({ dni: dniSolo });
        else throw new Error("QR inválido o incompleto.");
      }
      await this.mostrarToast("DNI escaneado.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(e?.message || "Error al escanear el DNI.", "Error");
    } finally {
      this.escaneando = false;
    }
  }

  async sacarFoto() {
    if (!this.isDuenoSupervisor) return;
    try {
      const isWeb = this.platform === "web";
      if (!isWeb) {
        const perm = await Camera.checkPermissions();
        if (perm.camera !== "granted") {
          const status = await Camera.requestPermissions({ permissions: ["camera"] });
          if (status.camera !== "granted") {
            await this.mostrarToast("Permiso de cámara denegado.", "Error");
            return;
          }
        }
      }

      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        quality: 85,
        source: CameraSource.Camera,
        allowEditing: false
      });

      if (!photo.base64String) throw new Error("No se pudo obtener la imagen.");

      const mime = photo.format === "png" ? "image/png" : "image/jpeg";
      const ext = photo.format === "png" ? "png" : "jpg";
      this.fotoPreview = `data:${mime};base64,${photo.base64String}`;

      const blob = this.base64ToBlob(photo.base64String, mime);
      const fileName = `empleado_${Date.now()}.${ext}`;
      const filePath = `empleados/${fileName}`;
      const up = await supabase.storage.from("empleados").upload(filePath, blob, { contentType: mime, upsert: true });
      if (up.error) throw up.error;

      const { data } = supabase.storage.from("empleados").getPublicUrl(filePath);
      this.formAltaEmpleado.patchValue({ foto: data.publicUrl });

      await this.mostrarToast("Foto cargada.", "Éxito");
    } catch (e: any) {
      this.fotoPreview = null;
      await this.mostrarToast(`Error al tomar la foto: ${e?.message || e}`, "Error");
    }
  }

  async enviar() {
    if (!this.isDuenoSupervisor) return;
    if (this.formAltaEmpleado.invalid) {
      this.formAltaEmpleado.markAllAsTouched();
      await this.mostrarToast("Complete los campos obligatorios.", "Error");
      return;
    }

    this.loading = true;

    let currentSession: any = null;
    let currentAuthUser: any = null;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      currentAuthUser = authUser;

      if (currentAuthUser?.email) {
        const { data: sessionData } = await supabase.auth.getSession();
        currentSession = sessionData.session;
      }

      const email = String(this.f["correo"].value).trim().toLowerCase();
      const password = String(this.f["clave"].value).trim();
      const { error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      const user = new User(
        String(this.f["apellidos"].value).trim(),
        String(this.f["nombres"].value).trim(),
        email,
        String(this.f["perfil"].value).trim(),
        String(this.f["dni"].value).trim(),
        String(this.f["cuil"].value).trim(),
        undefined
      );

      await this.usuarios.createFromUser(user, String(this.f["foto"].value));

      if (currentSession) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token
        });
        if (restoreError) {
          console.error("Error restaurando sesión:", restoreError);
        }
      }

      this.formAltaEmpleado.reset();
      await this.mostrarToast("Empleado registrado.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(e?.message || "No se pudo registrar el empleado.", "Error");
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