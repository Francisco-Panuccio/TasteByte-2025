import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { supabase } from 'src/supabase.client';

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
  loading: boolean = true;
  userId!: string | null;

  descuentoAplicado: boolean = false;
  porcentajeDescuento: number | null = null;

  constructor(private router: Router, private route: ActivatedRoute) {
    this.route.queryParams.subscribe(params => {
      this.mesaId = params['mesaId'] ? Number(params['mesaId']) : 0;
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'] ?? null;
      this.userId = params['userId'] ?? null;
    });
  }

  async ngOnInit() {
    if (!this.userId) {
      const { data } = await supabase.auth.getUser();
      this.userId = data.user?.id ?? null;
    }
    setTimeout(() => (this.loading = false), 500);
  }

  aplicarDescuento(porcentaje: number) {
    if (!this.descuentoAplicado) {
      this.descuentoAplicado = true;
      this.porcentajeDescuento = porcentaje;
      console.log(`Descuento aplicado: ${porcentaje}%`);
    }
  }

  volver() {
    this.router.navigate(['/encuestas-espera'], {
      queryParams: { clienteId: this.clienteId, anonimoId: this.anonimoId, tienePermiso: true, qrValido: true, userId: this.userId }
    });
  }
}
