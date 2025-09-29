import { Component, OnDestroy, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AnimationController } from "@ionic/angular";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Media, MediaObject } from "@awesome-cordova-plugins/media/ngx";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";

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

  showSplash: boolean = true;

  constructor(
    private router: Router,
    private animationCtrl: AnimationController,
    private media: Media,
    private push: Push
  ) { }

  async ngOnInit() {
    const firstLaunch = sessionStorage.getItem("splashShown") !== "1";

    if (firstLaunch) {
      sessionStorage.setItem("splashShown", "1");
      const plat = Capacitor.getPlatform();
      const startSrc = plat === "android"
        ? "file:///android_asset/public/assets/sounds/start.mp3"
        : "assets/sounds/start.mp3";
      this.splashAudio = this.media.create(startSrc);
      try { this.splashAudio.play(); } catch { }
      setTimeout(() => this.iniciarAnimacionesElementos(), 100);
    } else {
      this.showSplash = false;
    }

    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id as string | undefined;
      if (userId) {
        const { data: u } = await supabase.from("usuarios").select("perfil").eq("id", userId).single();
        const role = u?.perfil === "mozo" ? "mozo" : "cliente";
        await this.push.init(userId, role);
        if (role === "mozo") this.push.initMozoHandlers();
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
    const closeSrc = plat === "android"
      ? "file:///android_asset/public/assets/sounds/close.mp3"
      : "assets/sounds/close.mp3";
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
      const logoAnimation = this.animationCtrl.create()
        .addElement(logoElement)
        .duration(1500)
        .fromTo("transform", "scale(0)", "scale(1)")
        .fromTo("opacity", "0", "1");
      animations.push(logoAnimation.play());
    }

    if (tituloElement) {
      const tituloAnimation = this.animationCtrl.create()
        .addElement(tituloElement)
        .duration(1000)
        .delay(500)
        .fromTo("opacity", "0", "1");
      animations.push(tituloAnimation.play());
    }

    if (integrantesElement) {
      const integrantesAnimation = this.animationCtrl.create()
        .addElement(integrantesElement)
        .duration(1200)
        .delay(1500)
        .fromTo("opacity", "0", "1");
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