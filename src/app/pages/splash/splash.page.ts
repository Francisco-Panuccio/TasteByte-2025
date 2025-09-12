import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Animation, AnimationController } from '@ionic/angular';
import lottie from 'lottie-web';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: false
})
export class Splash implements OnInit {

  private lottieAnimation: any;

  constructor(
    private router: Router,
    private animationCtrl: AnimationController
  ) { }

  ngOnInit() {
    setTimeout(() => {
      this.iniciarAnimacionesElementos();
    }, 100);
  }

  

  iniciarAnimacionesElementos() {
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

    
    setTimeout(() => {
      if (this.lottieAnimation) {
        this.lottieAnimation.destroy(); 
      }
      this.router.navigate(['/splash']);
    }, 5000);
  }
}