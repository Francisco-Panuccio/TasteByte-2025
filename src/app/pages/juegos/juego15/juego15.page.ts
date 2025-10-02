import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Descuentos } from 'src/app/services/descuentos/descuentos';

@Component({
  selector: 'app-juego15',
  templateUrl: './juego15.page.html',
  styleUrls: ['./juego15.page.scss'],
  standalone: false
})
export class Juego15Page implements OnInit {
  play = false;
  cartaActual = 0;
  cartaSiguiente = 0;
  urlCarta = '';
  urlBaraja = '';

  imagenes: string[] = [];

  intentos = 0;
  descuentoAplicado = false;
  juegoFinalizado = false;
  gano = false;

  mesaId!: number;
  clienteId!: number | null;
  usuarioId!: number | null;
  anonimoId!: string | null;
  userId!: string | null;


  constructor(private toast: ToastController,private router: Router,private route: ActivatedRoute,private descuentos: Descuentos) {
  this.route.queryParams.subscribe(params => {
    this.mesaId = params['mesaId'] ? Number(params['mesaId']) : 0;
    this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
    this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
    this.anonimoId = params['anonimoId'] ?? null;
    this.userId = params['userId'] ?? null;
  });
}

  async ngOnInit() {
    await this.precargaDeImagenes();
  }

  async precargaDeImagenes() {
    this.imagenes = [
      'assets/images/mayor-menor/baraja.jpg',
      'assets/images/mayor-menor/1.jpg',
      'assets/images/mayor-menor/2.jpg',
      'assets/images/mayor-menor/3.jpg',
      'assets/images/mayor-menor/4.jpg',
      'assets/images/mayor-menor/5.jpg',
      'assets/images/mayor-menor/6.jpg',
      'assets/images/mayor-menor/7.jpg',
      'assets/images/mayor-menor/8.jpg',
      'assets/images/mayor-menor/9.jpg',
      'assets/images/mayor-menor/10.jpg',
      'assets/images/mayor-menor/11.jpg',
      'assets/images/mayor-menor/12.jpg'
    ];
    this.urlBaraja = this.imagenes[0];
    this.urlCarta = this.urlBaraja;
  }

  iniciarJuego() {
    this.play = true;
    this.intentos = 0;
    this.descuentoAplicado = false;
    this.juegoFinalizado = false;
    this.cartaActual = this.generarCarta();
    this.urlCarta = this.imagenes[this.cartaActual];
  }

  generarCarta(): number {
    return Math.floor(Math.random() * 12) + 1;
  }

  async elegir(opcion: 'mayor' | 'menor') {
    if (this.juegoFinalizado) return;

    this.intentos++;
    let nuevaCarta = this.generarCarta();

    while (nuevaCarta === this.cartaActual) {
      nuevaCarta = this.generarCarta();
    }

    this.cartaSiguiente = nuevaCarta;
    this.urlCarta = this.imagenes[this.cartaSiguiente];

    const esMayor = this.cartaSiguiente > this.cartaActual;
    const acierto = (opcion === 'mayor' && esMayor) || (opcion === 'menor' && !esMayor);

    if (acierto) {
      this.gano = true;
      if (this.intentos === 1 && !this.descuentoAplicado && this.clienteId && this.usuarioId) {
      await this.descuentos.aplicarDescuento(this.clienteId,this.userId,  this.mesaId,15);
      this.descuentoAplicado = true;
      }
      
      this.mostrarToast('🎉 ¡Correcto!', 'success');
    } else {
      this.gano = false;
      this.mostrarToast('❌ Fallaste', 'danger');
    }

    this.cartaActual = this.cartaSiguiente;
    this.juegoFinalizado = true;
  }

  resetear() {
    this.iniciarJuego();
  }

  private async mostrarToast(mensaje: string, color: string) {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2000,
      color,
      position: 'top'
    });
    await t.present();
  }

  volver() {
    this.router.navigate(['/juegos'], {
      queryParams: {
        clienteId: this.clienteId,
        usuarioId: this.usuarioId,
        tienePermiso: true,
        qrValido: true
      }
    });
  }
}
