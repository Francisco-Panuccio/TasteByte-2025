import { Component, OnDestroy, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AnimationController } from "@ionic/angular";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Media, MediaObject } from "@awesome-cordova-plugins/media/ngx";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { SesionPushService } from "./services/sesionPushService/sesion-push-service";

@Component({
  selector: "app-root",
  templateUrl: "app.component.html",
  styleUrls: ["./app.component.scss"],
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  private lottieAnimation: any;
  private splashAudio?: MediaObject;
  private closeAudio?: MediaObject;
  private backListener?: Promise<PluginListenerHandle>;
  showSplash = true;

  constructor(
    private router: Router,
    private animationCtrl: AnimationController,
    private media: Media,
    private push: Push,
    private sesionPush: SesionPushService
  ) { this.sesionPush.init();}

  private perfilToRole(perfil?: string): string | undefined {
    const p = (perfil ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (p === "dueno") return "dueño";
    if (["supervisor", "maitre", "mozo", "bartender", "cocinero"].includes(p)) return p;
    if (p === "cliente_registrado" || p === "cliente_anonimo") return "cliente";
    return undefined;
  }

  async ngOnInit() {
    const firstLaunch = sessionStorage.getItem("splashShown") !== "1";
    if (firstLaunch) {
      sessionStorage.setItem("splashShown", "1");
      const plat = Capacitor.getPlatform();
      const startSrc = plat === "android" ? "file:///android_asset/public/assets/sounds/start.mp3" : "assets/sounds/start.mp3";
      this.splashAudio = this.media.create(startSrc);
      try { this.splashAudio.play(); } catch { }
      setTimeout(() => this.iniciarAnimacionesElementos(), 100);
    } else {
      this.showSplash = false;
    }

    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email as string | undefined;
      if (email) {
        const { data: u } = await supabase.from("usuarios").select("id, perfil").eq("correo_electronico", email).maybeSingle();
        const dbUserId = (u?.id ?? undefined) as number | undefined;
        const role = this.perfilToRole(u?.perfil);
        await this.push.init(dbUserId as any, role as any);
        if (role === "mozo") this.push.initMozoHandlers();
        await this.push.ready();

        if (role === 'mozo') {
        console.log('🧠 Registrando canal Realtime global push_eventos...');
        this.push.listenPedidosListosMozo(async (data: any) => {
          console.log("📦 Realtime global: pedido listo recibido →", data);

          await this.push.sendLocal(
          "Pedido listo para entregar",
          data.mensaje || `Mesa ${data.mesa_id ?? ''}: el pedido está listo 🍽️`
        );
          const pedidoId = String(data.pedido_id || data.pedidoId || '');
          if (!pedidoId || pedidoId === this.push['lastPedidoIdNotificado']) return;
          this.push['lastPedidoIdNotificado'] = pedidoId;


          if (window.location.href.includes("/pedidos-mozo")) {
            window.dispatchEvent(new CustomEvent("refrescarPedidosMozo"));
          }
        });
}

      }
    } catch { }

    this.backListener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        this.playCloseAndExit();
      }
    });
  }

  ngOnDestroy() {
    try { this.splashAudio?.stop(); } catch { }
    try { this.splashAudio?.release(); } catch { }
    try { this.closeAudio?.stop(); } catch { }
    try { this.closeAudio?.release(); } catch { }
    this.backListener?.then(h => h.remove()).catch(() => { });
  }

  private playCloseSound() {
    const plat = Capacitor.getPlatform();
    const closeSrc = plat === "android" ? "file:///android_asset/public/assets/sounds/close.mp3" : "assets/sounds/close.mp3";
    try {
      try { this.closeAudio?.stop(); } catch { }
      try { this.closeAudio?.release(); } catch { }
      this.closeAudio = this.media.create(closeSrc);
      this.closeAudio.play();
      setTimeout(() => {
        try { this.closeAudio?.stop(); } catch { }
        try { this.closeAudio?.release(); } catch { }
        this.closeAudio = undefined;
      }, 1500);
    } catch { }
  }

  private playCloseAndExit() {
    this.playCloseSound();
    setTimeout(() => {
      try { App.exitApp(); } catch { }
    }, 900);
  }

  private iniciarAnimacionesElementos() {
    const logoElement = document.querySelector(".logo");
    const tituloElement = document.querySelector(".titulo");
    const integrantesElement = document.querySelector(".integrantes");
    const animations: Promise<void>[] = [];
    if (logoElement) {
      const logoAnimation = this.animationCtrl.create().addElement(logoElement).duration(1500).fromTo("transform", "scale(0)", "scale(1)").fromTo("opacity", "0", "1");
      animations.push(logoAnimation.play());
    }
    if (tituloElement) {
      const tituloAnimation = this.animationCtrl.create().addElement(tituloElement).duration(1000).delay(500).fromTo("opacity", "0", "1");
      animations.push(tituloAnimation.play());
    }
    if (integrantesElement) {
      const integrantesAnimation = this.animationCtrl.create().addElement(integrantesElement).duration(1200).delay(1500).fromTo("opacity", "0", "1");
      animations.push(integrantesAnimation.play());
    }
    setTimeout(async () => {
      if (this.lottieAnimation) { this.lottieAnimation.destroy(); }
      try { this.splashAudio?.stop(); } catch { }
      this.showSplash = false;
      this.router.navigate(["/login"]);
    }, 5000);
  }
}