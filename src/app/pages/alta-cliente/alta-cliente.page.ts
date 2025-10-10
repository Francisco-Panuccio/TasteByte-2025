import { Component, inject, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { supabase } from "src/supabase.client";
import { Usuario } from "src/app/interfaces/usuario";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Email } from "src/app/services/email/email";
import { Router } from "@angular/router";
import { ToastController } from "@ionic/angular";
import { Push } from "src/app/services/push/push";

@Component({
  selector: "app-alta-cliente",
  templateUrl: "./alta-cliente.page.html",
  styleUrls: ["./alta-cliente.page.scss"],
  standalone: false
})
export class AltaClientePage implements OnInit {
  private fb = inject(FormBuilder);
  private usuarios = inject(Usuarios);
  private email = inject(Email);
  private toast = inject(ToastController);
  private push = inject(Push);
  private readonly platform = Capacitor.getPlatform();

  formAnonimo!: FormGroup;
  fotoPreview: string | null = null;
  fotoUrl: string | null = null;
  cargando = false;
  mensaje: string | null = null;

  loading = true;
  escaneando = false;
  qrPayload: string | null = null;

  constructor(private router: Router) { }

  formAltaCliente = this.fb.group({
    nombres: ["", [Validators.required, Validators.minLength(2)]],
    apellidos: ["", [Validators.required, Validators.minLength(2)]],
    dni: ["", [Validators.required, Validators.pattern(/^\d{7,10}$/)]],
    correo: ["", [Validators.required, Validators.email]],
    clave: ["", [Validators.required, Validators.minLength(6)]],
    foto: ["", [Validators.required]]
  });

  get f() { return this.formAltaCliente.controls; }

  tipoCliente: "registrado" | "anonimo" = "registrado";

  formAltaAnonimo = this.fb.group({
    nombre: ["", [Validators.required, Validators.minLength(2)]],
    foto: ["", [Validators.required]]
  });

  get fAnonimo() { return this.formAltaAnonimo.controls; }

  ngOnInit() {
    setTimeout(() => { this.loading = false; }, 2000);
    this.formAnonimo = this.fb.group({ nombre: ["", [Validators.required, Validators.minLength(2)]] });
  }

  private async mostrarToast(message: string, header = "Aviso", duration = 1500): Promise<void> {
    const t = await this.toast.create({
      header,
      message,
      duration,
      cssClass: "toast",
      position: "top",
      buttons: [{ text: "OK", role: "cancel" }]
    });
    await t.present();
  }

  async escanearDNI() {
    this.escaneando = true;
    try {
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.Pdf417, BarcodeFormat.QrCode] });
      if (!result.barcodes?.length) throw new Error("No se detectó ningún código");
      const valor = result.barcodes[0].displayValue || "";
      this.qrPayload = valor;
      const partes = valor.split("@");
      if (partes.length >= 8) {
        const [, apellido, nombre, , dni] = partes;
        this.formAltaCliente.patchValue({ nombres: nombre || "", apellidos: apellido || "", dni: dni || "" });
      } else {
        const dniSolo = valor.replace(/\D/g, "");
        if (/^\d{7,10}$/.test(dniSolo)) this.formAltaCliente.patchValue({ dni: dniSolo });
        else throw new Error("QR inválido o incompleto");
      }
      await this.mostrarToast("DNI escaneado.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(e?.message || "Error al escanear el DNI", "Error");
    } finally {
      this.escaneando = false;
    }
  }

  async sacarFoto() {
    try {
      if (this.platform !== "web") {
        const status = await Camera.requestPermissions({ permissions: ["camera"] });
        if (status.camera !== "granted") { await this.mostrarToast("Permiso de cámara denegado", "Error"); return; }
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, quality: 85, source: CameraSource.Camera, allowEditing: false });
      let blob: Blob; let ext = "jpg";
      if (photo.webPath) { const resp = await fetch(photo.webPath); blob = await resp.blob(); ext = blob.type.includes("png") ? "png" : "jpg"; }
      else if (photo.base64String) { blob = this.base64ToBlob(photo.base64String, "image/jpeg"); }
      else { throw new Error("No se pudo obtener la imagen"); }

      const fileName = `cliente_${Date.now()}.${ext}`;
      const filePath = `cliente/${fileName}`;
      const up = await supabase.storage.from("clientes").upload(filePath, blob, { contentType: blob.type, upsert: true });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("clientes").getPublicUrl(filePath);
      this.formAltaCliente.patchValue({ foto: data.publicUrl });
      await this.mostrarToast("Foto cargada.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(`Error al tomar la foto: ${e?.message || e}`, "Error");
    }
  }

  private base64ToBlob(base64: string, type = "application/octet-stream") {
    const byteCharacters = atob(base64);
    const bytes = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) bytes[i] = byteCharacters.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  async enviar(tipo: string) {
    const form = tipo === "registrado" ? this.formAltaCliente : this.formAltaAnonimo;
    if (form.invalid) { form.markAllAsTouched(); await this.mostrarToast("Completá los campos obligatorios.", "Error"); return; }

    this.loading = true;
    try {
      const { data: { user: currentAuthUser } } = await supabase.auth.getUser();
      let esEmpleado = false;
      let currentSession: any = null;

      if (currentAuthUser?.email) {
        const usuarioActual: Usuario | null = await this.usuarios.getByEmail(currentAuthUser.email);
        const perfilesEmpleados = ["dueño", "supervisor", "maitre", "mozo", "bartender", "cocinero"];
        esEmpleado = usuarioActual?.perfil ? perfilesEmpleados.includes(usuarioActual.perfil) : false;
        if (esEmpleado) {
          const { data: sessionData } = await supabase.auth.getSession();
          currentSession = sessionData.session;
        }
      }

      if (tipo === "registrado") {
        const email = String(this.f["correo"].value).trim().toLowerCase();
        const password = String(this.f["clave"].value).trim();
        const nombres = String(this.f["nombres"].value).trim();
        const apellidos = String(this.f["apellidos"].value).trim();

        const sign = await supabase.auth.signUp({ email, password });
        if (sign.error) throw sign.error;

        const usuarioLike: any = {
          apellido: apellidos,
          nombre: nombres,
          dni: Number(String(this.f["dni"].value).trim()),
          email,
          perfil: "cliente_registrado",
          cuil: null,
        };

        const usuarioDB: Usuario = await this.usuarios.createFromUser(usuarioLike, String(this.f["foto"].value));

        await this.usuarios.update((usuarioDB as any).id, {
          dni_qr_payload: this.qrPayload,
          dni_qr_leido_en: this.qrPayload ? new Date().toISOString() : null
        });

        try {
          await this.email.sendEmail(email, "Registro Recibido - En Revisión", "registro_pendiente", { nombres });
        } catch { }

        try {
          const { data: rows, error: tkErr } = await supabase
            .from("push_tokens").select("token")
            .in("role", ["dueño", "supervisor"])
            .eq("active", true).eq("revoked", false);
          if (!tkErr) {
            const tokens = (rows ?? []).map((r: any) => r.token as string).filter(Boolean);
            if (tokens.length) {
              await this.push.send(
                tokens,
                "",
                "Nuevo cliente en lista de espera",
                { screen: "clientes-pendientes", tipo: "cliente_registrado", cliente_id: (usuarioDB as any).id, cliente_nombre: `${nombres} ${apellidos}` }
              );
            }
          }
          await this.mostrarToast(`${nombres} ${apellidos} espera aprobación`, "📋 Nuevo Cliente Pendiente", 1000);
        } catch { }

        if (esEmpleado && currentSession) {
          await supabase.auth.setSession({
            access_token: currentSession.access_token,
            refresh_token: currentSession.refresh_token
          });
        }

        if (!esEmpleado) {
          const estado = (usuarioDB as any)?.estado ?? "pendiente";
          if (estado !== "activo") {
            await supabase.auth.signOut();
            await this.mostrarToast("Te avisaremos cuando sea aprobada", "Cuenta en revisión", 1000);
            this.router.navigateByUrl("/login", { replaceUrl: true });
            return;
          }
          this.formAltaCliente.reset();
          this.qrPayload = null;
          await this.mostrarToast("Cliente registrado.", "Éxito");
        } else {
          this.formAltaCliente.reset();
          this.qrPayload = null;
          await this.mostrarToast("Cliente registrado.", "Éxito");
        }
      } else if (tipo === "anonimo") {
        const nombre = String(this.fAnonimo["nombre"].value).trim();
        const foto_url = String(this.fAnonimo["foto"].value).trim();

        const { error: insAnonErr } = await supabase.from("clientes_anonimos").insert({ nombre, foto_url });
        if (insAnonErr) throw insAnonErr;

        this.formAltaAnonimo.reset();
        if (!esEmpleado) {
          this.router.navigate(["/encuestas-espera"]);
        } else {
          await this.mostrarToast("Cliente anónimo registrado.", "Éxito");
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/already registered|User already registered/i.test(msg)) {
        await this.mostrarToast("Correo registrado.", "Error");
      } else if (/duplicate key.*numero_documento|numero_documento/i.test(msg)) {
        await this.mostrarToast("DNI registrado.", "Error");
      } else {
        await this.mostrarToast(msg || "No se pudo completar el registro.", "Error");
      }
    } finally {
      this.loading = false;
    }
  }

  async sacarFotoAnonimo() {
    try {
      if (this.platform !== "web") {
        const status = await Camera.requestPermissions({ permissions: ["camera"] });
        if (status.camera !== "granted") { await this.mostrarToast("Permiso de cámara denegado", "Error"); return; }
      }
      const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, quality: 85, source: CameraSource.Camera, allowEditing: false });
      let blob: Blob; let ext = "jpg";
      if (photo.webPath) { const response = await fetch(photo.webPath); blob = await response.blob(); ext = blob.type.includes("png") ? "png" : "jpg"; }
      else if (photo.base64String) { blob = this.base64ToBlob(photo.base64String, "image/jpeg"); }
      else { throw new Error("No se pudo obtener la imagen"); }

      const fileName = `anonimo_${Date.now()}.${ext}`;
      const filePath = `clientes_anonimos/${fileName}`;
      const up = await supabase.storage.from("clientes").upload(filePath, blob, { contentType: blob.type, upsert: true });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("clientes").getPublicUrl(filePath);
      this.formAltaAnonimo.patchValue({ foto: data.publicUrl });
      await this.mostrarToast("Foto cargada.", "Éxito");
    } catch (e: any) {
      await this.mostrarToast(`Error al tomar la foto: ${e?.message || e}`, "Error");
    }
  }
}