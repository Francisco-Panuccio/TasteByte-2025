import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-juegos',
  templateUrl: './juegos.page.html',
  styleUrls: ['./juegos.page.scss'],
  standalone: false
})
export class JuegosPage {
  mesaId!: number;
  clienteId!: number | null;
  usuarioId!: number | null;
  anonimoId!: string | null;

  // Control del descuento
  descuentoAplicado: boolean = false;
  porcentajeDescuento: number | null = null;

  constructor(private router: Router, private route: ActivatedRoute) {
    this.route.queryParams.subscribe(params => {
      this.mesaId = params['mesaId'] ? Number(params['mesaId']) : 0;
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'] ?? null;
    });
  }

  aplicarDescuento(porcentaje: number) {
    // Solo aplicar el primer descuento
    if (!this.descuentoAplicado) {
      this.descuentoAplicado = true;
      this.porcentajeDescuento = porcentaje;
      console.log(`Descuento aplicado: ${porcentaje}%`);
    }
  }

  volver() {
    this.router.navigate(['/encuestas-espera'], {
        queryParams: { clienteId: this.clienteId, anonimoId : this.anonimoId, tienePermiso : true, qrValido : true }
      });
  }


}
