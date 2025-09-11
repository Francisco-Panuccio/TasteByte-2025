import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Animation, AnimationController, IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: false
})
export class Splash implements OnInit {

  constructor(
    private router: Router,
    private animationCtrl: AnimationController
  ) { }

  ngOnInit() {

    setTimeout(() => {
      this.iniciarAnimacion();
    }, 100);
  }

  iniciarAnimacion() {

    const logoElement = document.querySelector('.logo');
    const tituloElement = document.querySelector('.titulo');
    const grupoElement = document.querySelector('.nombre-grupo');
    const integrantesElement = document.querySelector('.integrantes');

    if (logoElement) {
      const logoAnimation: Animation = this.animationCtrl.create()
        .addElement(logoElement)
        .duration(1500)
        .fromTo('transform', 'scale(0)', 'scale(1)')
        .fromTo('opacity', '0', '1');
      logoAnimation.play();
    }

    if (tituloElement) {
      const tituloAnimation: Animation = this.animationCtrl.create()
        .addElement(tituloElement)
        .duration(1000)
        .delay(500)
        .fromTo('opacity', '0', '1');
      tituloAnimation.play();
    }

    if (grupoElement) {
      const grupoAnimation: Animation = this.animationCtrl.create()
        .addElement(grupoElement)
        .duration(1000)
        .delay(1000)
        .fromTo('transform', 'translateY(50px)', 'translateY(0)')
        .fromTo('opacity', '0', '1');
      grupoAnimation.play();
    }

    if (integrantesElement) {
      const integrantesAnimation: Animation = this.animationCtrl.create()
        .addElement(integrantesElement)
        .duration(1200)
        .delay(1500)
        .fromTo('opacity', '0', '1');
      integrantesAnimation.play();
    }

    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 4000);
  }
}