import { Component, inject, OnInit } from "@angular/core";
import { AbstractControl, FormBuilder, ValidationErrors, ValidatorFn, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { User } from "src/app/classes/user";
import { AuthService } from "src/app/services/auth/auth";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { supabase } from "src/supabase.client";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Email } from "src/app/services/email/email";
import { Push } from "src/app/services/push/push";
import { BarcodeFormat, BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

@Component({
  selector: "app-register",
  standalone: false,
  templateUrl: "./register.page.html",
  styleUrls: ["./register.page.scss"]
})
export class RegisterPage implements OnInit {
  private email = inject(Email);
  private push = inject(Push);

  loading = true;
  errorMsg = false;
  submitting = false;
  errorText = "Ocurrió un error";

  fotoPreview: string | null = null;
  fotoUrl: string | null = null;
  err: string | null = null;
  escaneando = false;
  qrPayload: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios
  ) {
    this.formRegister = this.fb.group(
      {
        fullname: ["", [Validators.required]],
        lastname: ["", [Validators.required]],
        documentType: ["dni", [Validators.required]],
        documentNumber: ["", [Validators.required, this.dniValidator]],
        profile: ["", [Validators.required]],
        email: ["", [Validators.required, Validators.email]],
        password: ["", [Validators.required, Validators.minLength(6)]],
        confirm: ["", [Validators.required]]
      },
      { validators: this.passwordsMatch }
    );
  }

  formRegister: ReturnType<FormBuilder["group"]>;

  get isFormValid(): boolean {
    return this.formRegister.valid && !!this.fotoPreview;
  }

  passwordsMatch: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const pass = group.get("password")?.value ?? "";
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
    this.formRegister.get("documentType")!.valueChanges.subscribe((t) => {
      const ctrl = this.formRegister.get("documentNumber")!;
      ctrl.clearValidators();
      ctrl.addValidators([Validators.required, t === "dni" ? this.dniValidator : this.cuilValidator]);
      ctrl.updateValueAndValidity({ emitEvent: false });
    });
    setTimeout(() => (this.loading = false), 2000);
  }

  async tomarFoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });
      this.fotoPreview = image.dataUrl || null;
    } catch (e) { }
  }

  async escanearDNI() {
    this.err = null;
    this.escaneando = true;
    try {
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.Pdf417, BarcodeFormat.QrCode] });
      if (!result.barcodes?.length) throw new Error("No se detectó ningún código");

      const valor = result.barcodes[0].displayValue || "";
      this.qrPayload = valor;

      const partes = valor.split("@");
      if (partes.length >= 8) {
        const [, apellido, nombre, , dni] = partes;
        this.formRegister.patchValue({ fullname: nombre || "", lastname: apellido || "", documentNumber: dni || "" });
      } else {
        const dniSolo = valor.replace(/\D/g, "");
        if (dniSolo.match(/^\d{7,10}$/)) {
          this.formRegister.patchValue({ documentNumber: dniSolo });
        } else {
          throw new Error("QR inválido o incompleto");
        }
      }
    } catch (e: any) {
      this.err = e.message || "Error al escanear el DNI";
    } finally {
      this.escaneando = false;
    }
  }

  async onRegister() {
    if (this.submitting) return;
    this.submitting = true;
    this.errorMsg = false;
    try {
      this.formRegister.markAllAsTouched();
      this.formRegister.updateValueAndValidity({ emitEvent: true });
      if (this.formRegister.invalid) throw new Error("Formulario inválido");
      if (!this.fotoPreview) throw new Error("Debe tomar una foto");

      const v = this.formRegister.value as any;
      const email: string = String(v.email || "").trim().toLowerCase();
      const password: string = String(v.password || "");
      const digits = String(v.documentNumber ?? "").replace(/\D/g, "");
      const isDni = v.documentType === "dni";
      const dniStr = isDni ? digits : undefined;
      const cuilStr = !isDni ? digits : undefined;

      const isCliente = v.profile === "cliente_registrado";
      const bucket = isCliente ? "clientes" : "empleados";
      const dir = isCliente ? "clientes" : "empleados";

      const emailTaken = await this.usuarios.existsByEmail(email);
      if (emailTaken) throw new Error("Correo ya registrado");

      let docTaken = false;
      if (isDni && dniStr) docTaken = await this.usuarios.existsByDni(Number(dniStr));
      if (!isDni && cuilStr) docTaken = await this.usuarios.existsByCuil(Number(cuilStr));
      if (docTaken) throw new Error(isDni ? "DNI ya registrado" : "CUIL ya registrado");

      const { data, error } = await this.auth.signUp(email, password);
      if (error) throw new Error(error.message || "Error en autenticación");

      const user = new User(v.lastname, v.fullname, email, v.profile, dniStr, cuilStr, undefined);

      const fileName = `foto_${Date.now()}.jpeg`;
      const filePath = `${dir}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, this.dataURLtoBlob(this.fotoPreview!), { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(filePath);
      this.fotoUrl = publicUrl.publicUrl;

      const usuarioDB = await this.usuarios.createFromUser(user, this.fotoUrl);

      if (isCliente) {
        const clienteNombre = `${user.apellido} ${user.nombre}`;
        await this.email.enviarEmailPersonalizado(
          "🍴Registro Exitoso🍴",
          email,
          "Bienvenido a TasteByte",
          `<p>Buenas ${user.nombre + " " + user.apellido}, gracias por registrarse.</p>
            <p>Su cuenta se encuentra actualmente pendiente de revisión, disculpe las molestias.</p>
            <p>En minutos un dueño o supervisor autorizará su ingreso.</p>
            <p>Muchas gracias, esperamos que disfrute nuestras comidas en TasteByte.</p>`,
          "Registro Recibido - En Revisión"
        );
        try {
          const { data: rows, error: tkErr } = await supabase
            .from("push_tokens")
            .select("token")
            .in("role", ["dueno", "supervisor"])
            .eq("active", true)
            .eq("revoked", false);
          if (!tkErr) {
            const tokens = (rows ?? []).map((r: any) => r.token as string).filter(Boolean);
            if (tokens.length) {
              await this.push.send(
                tokens,
                "",
                "Nuevo cliente en lista de espera",
                { screen: "clientes-pendientes", tipo: "cliente_registrado", cliente_id: usuarioDB.id, cliente_nombre: clienteNombre }
              );
            }
          }
        } catch { }
      }

      if (isCliente) {
        try { await supabase.auth.signOut(); } catch { }
        await this.router.navigateByUrl("/login", { replaceUrl: true });
        return;
      }

      await this.router.navigateByUrl(data.session ? "/home" : "/login", { replaceUrl: true });
    } catch (e: any) {
      this.errorText = typeof e?.message === "string" ? e.message : "Error en el registro";
      this.errorMsg = true;
    } finally {
      this.submitting = false;
    }
  }

  private dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
  }

  closeError() {
    this.errorMsg = false;
  }
}