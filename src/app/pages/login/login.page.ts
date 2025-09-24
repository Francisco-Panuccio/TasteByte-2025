import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "src/app/services/auth/auth";
import { FormBuilder, Validators } from "@angular/forms";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType, ImpactStyle } from "@capacitor/haptics";

type Role = "mozo" | "cliente";

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.page.html",
  styleUrls: ["./login.page.scss"],
})
export class LoginPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;
  errorText: string = "Ocurrió un error";

  formLogin: ReturnType<FormBuilder["group"]>;

  private errorAudio = new Audio("assets/sounds/error.mp3");

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private push: Push
  ) {
    this.formLogin = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
    });
    this.errorAudio.preload = "auto";
    try { this.errorAudio.load(); } catch { }
  }

  private isApproved(perfil?: string, estado?: string): boolean {
    if (perfil === "cliente_registrado" && estado === "activo") return true;
    return perfil !== "cliente_registrado";
  }

  private async initPush(userId: string, role: Role) {
    await this.push.init(userId, role);
    if (role === "mozo") this.push.initMozoHandlers();
    await this.push.ready();
  }

  private sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

  private async errorFeedback() {
    try {
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        const plat = Capacitor.getPlatform();
        if (plat === "android") {
          try { await Haptics.vibrate({ duration: 1500 }); } catch { }
          try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { }
        } else {
          for (let i = 0; i < 4; i++) {
            try { await Haptics.notification({ type: NotificationType.Error }); } catch { }
            await this.sleep(250);
          }
        }
      } else {
        try { (navigator as any).vibrate?.(1500); } catch { }
      }
    } catch { }
    try {
      this.errorAudio.currentTime = 0;
      await this.errorAudio.play();
    } catch { }
  }

  async ngOnInit() {
    const session = await this.auth.getSession();
    if (session) {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email as string | undefined;

      if (email) {
        const { data: u, error } = await supabase
          .from("usuarios")
          .select("id, perfil")
          .eq("correo_electronico", email)
          .maybeSingle();

        if (error) { console.error("Error Cargando Perfil del Usuario", error); }

        const perfil = u?.perfil;
        const userId = u?.id;

        let estado: string | undefined;
        if (perfil === "cliente_registrado" && userId) {
          const { data: cData, error: cErr } = await supabase
            .from("clientes")
            .select("estado")
            .eq("usuario_id", userId)
            .maybeSingle();
          if (cErr) { console.error("Error Cargando Estado del Cliente", cErr); }
          estado = cData?.estado;

          if (!this.isApproved(perfil, estado)) {
            await supabase.auth.signOut();
            this.errorText = "Cuenta Rechazada o Pendiente de Aprobación.";
            this.errorMsg = true;
            return;
          }
        }

        const role: Role = u?.perfil === "mozo" ? "mozo" : "cliente";
        if (authData.user?.id) {
          await this.initPush(authData.user.id, role);
        }
      }

      await this.router.navigateByUrl("/home", { replaceUrl: true });
      return;
    }

    setTimeout(() => (this.loading = false), 2000);
  }

  goAnonRegister() { this.router.navigateByUrl("/anon-register"); }

  async onLogin() {
    this.errorMsg = false;
    this.formLogin.markAllAsTouched();
    this.formLogin.updateValueAndValidity({ emitEvent: true });
    if (this.formLogin.invalid) return;

    const { email, password } = this.formLogin.value as { email: string; password: string; };

    const { error: signErr } = await this.auth.signIn(email, password);
    if (signErr) {
      this.errorText = "Credenciales Inválidas";
      this.errorMsg = true;
      await this.errorFeedback();
      return;
    }

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      this.errorText = "No se pudo obtener el usuario";
      this.errorMsg = true;
      await this.errorFeedback();
      return;
    }

    const emailAut = authData.user.email as string | undefined;
    if (!emailAut) {
      this.errorText = "No se pudo obtener el email";
      this.errorMsg = true;
      await this.errorFeedback();
      return;
    }

    const { data: u, error: uErr } = await supabase
      .from("usuarios")
      .select("id, perfil")
      .eq("correo_electronico", emailAut)
      .maybeSingle();

    if (uErr || !u) {
      this.errorText = "No se encontró el perfil del usuario";
      this.errorMsg = true;
      await this.errorFeedback();
      return;
    }

    const perfil = u.perfil;
    const userId = u.id;

    let estado: string | undefined;
    if (perfil === "cliente_registrado") {
      const { data: cData, error: cErr } = await supabase
        .from("clientes")
        .select("estado")
        .eq("usuario_id", userId)
        .maybeSingle();
      if (cErr) { console.error("Error Cargando Estado del Cliente", cErr); }
      estado = cData?.estado;

      if (!this.isApproved(perfil, estado)) {
        await supabase.auth.signOut();
        this.errorText = "Cuenta Rechazada o Pendiente de Aprobación.";
        this.errorMsg = true;
        await this.errorFeedback();
        return;
      }
    }

    const role: Role = perfil === "mozo" ? "mozo" : "cliente";
    await this.initPush(authData.user.id, role);

    await this.router.navigateByUrl("/home", { replaceUrl: true });
  }

  async quickLogin(user: { email: string; password: string }) {
    this.formLogin.patchValue(user);
  }

  closeError() { this.errorMsg = false; }
}
