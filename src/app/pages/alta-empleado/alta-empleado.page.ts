import { Component, inject, OnInit } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
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

  isDuenoSupervisor = false;
  perfilActual = "";

  formAltaEmpleado = this.fb.group({
    nombres: ["", [Validators.required, Validators.minLength(2)]],
    apellidos: ["", [Validators.required, Validators.minLength(2)]],
    dni: ["", [Validators.required, Validators.pattern(/^\d{7,10}$/)]],
    cuil: ["", [Validators.required, Validators.pattern(/^\d{11}$/)]],
    correo: ["", [Validators.required, Validators.email]],
    clave: ["", [Validators.required, Validators.minLength(6)]],
    perfil: ["", [Validators.required]],
    foto: ["", [Validators.required]]
  });

  get f() { return this.formAltaEmpleado.controls; }

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
      if (this.platform !== "web") {
        const status = await Camera.requestPermissions({ permissions: ["camera"] });
        if (status.camera !== "granted") {
          await this.mostrarToast("Permiso de cámara denegado.", "Error");
          return;
        }
      }
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        quality: 85,
        source: CameraSource.Camera,
        allowEditing: false
      });
      const response = await fetch(photo.webPath!);
      const blob = await response.blob();
      const ext = blob.type.includes("png") ? "png" : "jpg";
      const fileName = `empleado_${Date.now()}.${ext}`;
      const filePath = `empleados/${fileName}`;
      const up = await supabase.storage.from("empleados").upload(filePath, blob, { contentType: blob.type, upsert: true });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("empleados").getPublicUrl(filePath);
      this.formAltaEmpleado.patchValue({ foto: data.publicUrl });
      await this.mostrarToast("Foto cargada.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(`Error al tomar la foto: ${e?.message || e}`, "Error");
    }
  }

  async enviar() {
    if (!this.isDuenoSupervisor) return;
    if (this.formAltaEmpleado.invalid) {
      this.formAltaEmpleado.markAllAsTouched();
      await this.mostrarToast("Completá los campos obligatorios.", "Error");
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