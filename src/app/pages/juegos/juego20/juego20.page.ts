import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Descuentos } from 'src/app/services/descuentos/descuentos';

interface Carta {
  id: number;
  imagen: string;
  volteada: boolean;
  encontrada: boolean;
}

@Component({
  selector: 'app-juego20',
  templateUrl: './juego20.page.html',
  styleUrls: ['./juego20.page.scss'],
  standalone: false
})
export class Juego20Page implements OnInit {
  cartas: Carta[] = [];
  seleccionadas: Carta[] = [];
  intentos = 0;
  aciertos = 0;
  descuentoAplicado = false;
  juegoFinalizado = false;

  vidasRestantes = 3;

  mesaId!: number;
  clienteId!: number | null;
  usuarioId!: number | null;
  anonimoId!: string | null;
  userId!: string | null;

  imagenesBase: string[] = [
    'assets/images/memotest/avocado.png',
    'assets/images/memotest/bananas.png',
    'assets/images/memotest/cherries.png',
    'assets/images/memotest/grapes.png',
    'assets/images/memotest/strawberry.png',
    'assets/images/memotest/watermelon.png'
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private descuentos: Descuentos,
    private toast: ToastController
  ) {
    this.route.queryParams.subscribe(params => {
      this.mesaId = params['mesaId'] ? Number(params['mesaId']) : 0;
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'] ?? null;
      this.userId = params['userId'] ?? null;
    });
  }

  ngOnInit() {
    this.iniciarJuego();
  }

  iniciarJuego() {
    this.intentos = 0;
    this.aciertos = 0;
    this.vidasRestantes = 3;
    this.descuentoAplicado = false;
    this.juegoFinalizado = false;
    this.seleccionadas = [];

    const pares = [...this.imagenesBase, ...this.imagenesBase];
    this.cartas = pares
      .map((imagen, index) => ({
        id: index,
        imagen,
        volteada: false,
        encontrada: false
      }))
      .sort(() => Math.random() - 0.5);
  }

  seleccionarCarta(carta: Carta) {
    if (carta.volteada || carta.encontrada || this.seleccionadas.length === 2 || this.juegoFinalizado) return;

    carta.volteada = true;
    this.seleccionadas.push(carta);

    if (this.seleccionadas.length === 2) {
      this.intentos++;
      setTimeout(() => this.compararCartas(), 800);
    }
  }

  async compararCartas() {
    const [c1, c2] = this.seleccionadas;
    if (c1.imagen === c2.imagen) {
      c1.encontrada = true;
      c2.encontrada = true;
      this.aciertos++;
      this.seleccionadas = [];

      if (this.aciertos === this.imagenesBase.length) {
        this.finalizarJuego(true);
      }
    } else {
      c1.volteada = false;
      c2.volteada = false;
      this.vidasRestantes--;

      if (this.vidasRestantes <= 0) {
        this.finalizarJuego(false);
        this.seleccionadas = [];
        return;
      }
    }
    this.seleccionadas = [];
  }

  private async presentToast(header: string, message: string) {
    const t = await this.toast.create({
      cssClass: "toast",
      header,
      message,
      duration: 1500,
      position: "top"
    });
    await t.present();
  }

  async finalizarJuego(ganador: boolean) {
    this.juegoFinalizado = true;

    if (ganador) {
      await this.presentToast("🎉 ¡Ganó el Juego! 🎉", "Felicitaciones");
      if (this.intentos === 1 && !this.descuentoAplicado && this.clienteId && this.userId) {
        await this.descuentos.aplicarDescuento(this.clienteId, this.userId, this.mesaId, 20, "juego20");
        this.descuentoAplicado = true;
      } else {
        await this.presentToast("😢 Perdió el Juego 😢", "Inténtelo Nuevamente");
        if (this.userId) {
          await this.descuentos.registrarIntento(this.userId, "juego20", false);
        }
      }
    } else {
      if (this.userId) {
        await this.descuentos.registrarIntento(this.userId, "juego20", false);
      }
    }
  }

  resetear() {
    this.iniciarJuego();
  }

  volver() {
    this.router.navigate(['/juegos'], {
      queryParams: {
        clienteId: this.clienteId,
        anonimoId: this.anonimoId,
        tienePermiso: true,
        qrValido: true
      }
    });
  }
}
