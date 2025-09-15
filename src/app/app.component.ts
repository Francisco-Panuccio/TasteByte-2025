import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AnimationController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Media, MediaObject } from '@awesome-cordova-plugins/media/ngx';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private lottieAnimation: any;
  private splashAudio?: MediaObject;
  showSplash: boolean = true;

  constructor(private router: Router, private animationCtrl: AnimationController, private media: Media) { }

  async ngOnInit() {
    const plat = Capacitor.getPlatform();
    const src =
      plat === 'android'
        ? 'file:///android_asset/public/assets/sounds/start.mp3'
        : 'assets/sounds/start.mp3';

    this.splashAudio = this.media.create(src);
    try { this.splashAudio.play(); } catch { }

    /*setTimeout(() => this.iniciarAnimacionesElementos(), 100);*/
  }

  ngOnDestroy() {
    try { this.splashAudio?.stop(); } catch { }
    try { this.splashAudio?.release(); } catch { }
  }

  /*private iniciarAnimacionesElementos() {
    const logoElement = document.querySelector('.logo');
    const tituloElement = document.querySelector('.titulo');
    const integrantesElement = document.querySelector('.integrantes');

    const animations: Promise<void>[] = [];

    if (logoElement) {
      const logoAnimation = this.animationCtrl.create()
        .addElement(logoElement)
        .duration(1500)
        .fromTo('transform', 'scale(0)', 'scale(1)')
        .fromTo('opacity', '0', '1');
      animations.push(logoAnimation.play());
    }

    if (tituloElement) {
      const tituloAnimation = this.animationCtrl.create()
        .addElement(tituloElement)
        .duration(1000)
        .delay(500)
        .fromTo('opacity', '0', '1');
      animations.push(tituloAnimation.play());
    }

    if (integrantesElement) {
      const integrantesAnimation = this.animationCtrl.create()
        .addElement(integrantesElement)
        .duration(1200)
        .delay(1500)
        .fromTo('opacity', '0', '1');
      animations.push(integrantesAnimation.play());
    }

    setTimeout(async () => {
      if (this.lottieAnimation) { this.lottieAnimation.destroy(); }
      try { this.splashAudio?.stop(); } catch {}
      this.showSplash = false,
      this.router.navigate(["/login"]);
    }, 5000);
  }*/
}
