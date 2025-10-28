import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "src/app/services/auth/auth";
import { FormBuilder, Validators } from "@angular/forms";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType, ImpactStyle } from "@capacitor/haptics";
import { DeepLinkService } from '../../services/deep-link/depp-link';

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.page.html",
  styleUrls: ["./login.page.scss"],
})
export class LoginPage implements OnInit {
  loading = true;
  errorMsg = false;
  errorText = "Ocurrió un error";
  perfilOnInit = "";

  formLogin: ReturnType<FormBuilder["group"]>;
  private errorAudio = new Audio("assets/sounds/error.mp3");

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private push: Push,
    private deepLinkService: DeepLinkService
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

  private perfilToRole(perfil?: string): string | undefined {
    const p = (perfil ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (p === "dueno") return "dueño";
    if (["supervisor", "maitre", "mozo", "bartender", "cocinero", "delivery"].includes(p)) return p;
    if (p === "cliente_registrado" || p === "cliente_anonimo") return "cliente";
    return undefined;
  }

  private async initPush(userId: number | string, role?: string) {
    await this.push.init(userId as any, role as any);
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
    try { this.errorAudio.currentTime = 0; await this.errorAudio.play(); } catch { }
  }

  async ngOnInit() {
    const session = await this.auth.getSession();

    this.deepLinkService.initializeDeepLinkListener();

    await new Promise(resolve => setTimeout(resolve, 500));

    if (session) {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email as string | undefined;

      if (email) {
        const { data: u } = await supabase
          .from("usuarios")
          .select("id, perfil")
          .eq("correo_electronico", email)
          .maybeSingle();

        const perfil = u?.perfil;
        this.perfilOnInit = perfil;
        const usuarioRowId = u?.id;

        let estado: string | undefined;
        if (perfil === "cliente_registrado" && usuarioRowId) {
          const { data: cData } = await supabase
            .from("clientes")
            .select("estado")
            .eq("usuario_id", usuarioRowId)
            .maybeSingle();
          estado = cData?.estado;
          if (!this.isApproved(perfil, estado)) {
            await supabase.auth.signOut();
            this.errorText = "Cuenta Rechazada o Pendiente de Aprobación.";
            this.errorMsg = true;
            return;
          }
        }

        const role = this.perfilToRole(perfil);
        if (usuarioRowId) await this.initPush(usuarioRowId, role);
        else if (authData.user?.id) await this.initPush(authData.user.id, role);
      }

      await this.redirectByPerfil(this.perfilOnInit);
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

    const { email, password } = this.formLogin.value as { email: string; password: string };

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

    const { data: u } = await supabase
      .from("usuarios")
      .select("id, perfil")
      .eq("correo_electronico", emailAut)
      .maybeSingle();

    if (!u) {
      this.errorText = "No se encontró el perfil del usuario";
      this.errorMsg = true;
      await this.errorFeedback();
      return;
    }

    const perfil = u.perfil;
    const usuarioRowId = u.id;

    let estado: string | undefined;
    if (perfil === "cliente_registrado") {
      const { data: cData } = await supabase
        .from("clientes")
        .select("estado")
        .eq("usuario_id", usuarioRowId)
        .maybeSingle();
      estado = cData?.estado;
      if (!this.isApproved(perfil, estado)) {
        await supabase.auth.signOut();
        this.errorText = "Cuenta Rechazada o Pendiente de Aprobación.";
        this.errorMsg = true;
        await this.errorFeedback();
        return;
      }
    }

    const role = this.perfilToRole(perfil);
    await this.initPush(usuarioRowId ?? authData.user.id, role);

    await this.redirectByPerfil(perfil);
  }

  private async redirectByPerfil(perfil?: string): Promise<void> {
    const p = (perfil ?? "").toLowerCase();
    if (p === "mozo") {
      await this.router.navigateByUrl("/pedidos-mozo", { replaceUrl: true });
    } else if (p === "delivery") {
      await this.router.navigateByUrl("/listado-delivery", { replaceUrl: true });
    } else {
      await this.router.navigateByUrl("/home", { replaceUrl: true });
    }
  }

  async quickLogin(user: { email: string; password: string }) {
    this.formLogin.patchValue(user);
  }

  async loginWithGoogle() {
    try {
      event?.preventDefault();

      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'tastebyte://login-callback'
        : `${window.location.origin}/home`;

      console.log('🔐 Iniciando OAuth con redirect:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (error) throw error;

      console.log('🔄 Redirigiendo a Google...', data);

    } catch (e: any) {
      console.error('❌ Error en login con Google:', e);
      this.errorText = e.message || 'Error al iniciar sesión con Google';
      this.errorMsg = true;
    }
  }

  closeError() { this.errorMsg = false; }
}