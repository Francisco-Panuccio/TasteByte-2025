import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Descuentos } from 'src/app/services/descuentos/descuentos';

@Component({
  selector: 'app-juego10',
  templateUrl: './juego10.page.html',
  styleUrls: ['./juego10.page.scss'],
  standalone: false
})
export class Juego10Page implements OnInit {
  palabra = '';
  letras_adivinadas: string[] = [];
  letras_utilizadas: string[] = [];

  play = false;
  fallos = 0;
  max_fallos = 6;
  url_ahorcado!: string;
  imagenes: string[] = [];

  letras_seleccionadas = 0;
  intentos = 0;
  descuentoAplicado = false;
  cargando_palabra = false;

  inicio!: number;
  tiempoTranscurrido = '00:00:00';
  intervalo!: ReturnType<typeof setInterval>;
  juego_finalizado = 0;

  mesaId!: number;
  clienteId!: number | null;
  usuarioId!: number | null;
  anonimoId!: string | null;
  userId!: string | null;

  constructor(private router: Router, private route: ActivatedRoute, private descuentos: Descuentos) {
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
    await this.fetchPalabraRandom();
  }

  async fetchPalabraRandom() {
    this.cargando_palabra = true;
    const palabras = ['IONIC', 'SUPABASE', 'ANGULAR', 'JUEGO', 'CLIENTE'];
    this.palabra = palabras[Math.floor(Math.random() * palabras.length)];
    this.cargando_palabra = false;
  }

  jugar() {
    this.play = true;
    this.intentos++;

    this.inicio = Date.now();
    this.intervalo = setInterval(() => {
      const msTranscurridos = Date.now() - this.inicio;
      const tiempo = new Date(msTranscurridos);
      this.tiempoTranscurrido = tiempo.toISOString().substring(11, 19);
    }, 1000);
  }

  adivinarLetra(letra: string) {
    if (this.letras_utilizadas.includes(letra)) return;
    this.letras_utilizadas.push(letra);
    this.letras_seleccionadas++;

    if (this.palabra.includes(letra)) {
      this.letras_adivinadas.push(letra);
      const todas = this.palabra.split('').every(l =>
        this.letras_adivinadas.includes(l)
      );
      if (todas) this.finalizarJuego(true);
    } else {
      this.fallos++;
      this.url_ahorcado = this.imagenes[this.fallos];
      if (this.fallos >= this.max_fallos) this.finalizarJuego(false);
    }
  }

  async finalizarJuego(resultado: boolean) {
    clearInterval(this.intervalo);
    this.juego_finalizado = resultado ? 1 : 2;

    if (resultado && this.intentos === 1 && !this.descuentoAplicado && this.userId) {
      await this.descuentos.aplicarDescuento(this.clienteId, this.userId, this.mesaId, 10, 'juego10');
      this.descuentoAplicado = true;
    } else if (!this.descuentoAplicado && this.userId) {
      await this.descuentos.registrarIntento(this.userId, 'juego10', false);
    }

  }

  async resetear() {
    clearInterval(this.intervalo);
    await this.fetchPalabraRandom();
    this.letras_adivinadas = [];
    this.letras_utilizadas = [];
    this.play = false;
    this.fallos = 0;
    this.url_ahorcado = this.imagenes[0];
    this.letras_seleccionadas = 0;
    this.tiempoTranscurrido = '00:00:00';
    this.juego_finalizado = 0;
  }

  async precargaDeImagenes() {
    this.imagenes = [
      'assets/images/ahorcado/0_ahorcado.png',
      'assets/images/ahorcado/1_ahorcado.png',
      'assets/images/ahorcado/2_ahorcado.png',
      'assets/images/ahorcado/3_ahorcado.png',
      'assets/images/ahorcado/4_ahorcado.png',
      'assets/images/ahorcado/5_ahorcado.png',
      'assets/images/ahorcado/6_ahorcado.png'
    ];
    this.url_ahorcado = this.imagenes[0];
  }

  volver() {
    this.router.navigate(['/juegos'], {
      queryParams: {
        clienteId: this.clienteId,
        usuarioId: this.usuarioId,
        anonimoId: this.anonimoId,
        userId: this.userId,
        tienePermiso: true,
        qrValido: true
      }
    });
  }
}
