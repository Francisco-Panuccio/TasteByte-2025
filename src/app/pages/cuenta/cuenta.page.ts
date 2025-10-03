import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { supabase } from 'src/supabase.client';

@Component({
  selector: 'app-cuenta',
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  standalone: false
})
export class CuentaPage implements OnInit {
  pedidoId!: string;
  ped: any;
  items: any[] = [];
  descuento: number = 0;
  propinaSeleccionada: number = 0;
  totalFinal: number = 0;
  loading = true;

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;
  userId!: string | null;

  constructor(
    private ar: ActivatedRoute,
    private router: Router,
    private toast: ToastController,
    private route: ActivatedRoute
  ) {
    this.route.queryParams.subscribe(params => {
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'] ?? null;
      this.userId = params['userId'] ?? null;
    });
  }

  async ngOnInit() {
    this.pedidoId =
      this.ar.snapshot.paramMap.get('pedidoId') ??
      this.ar.snapshot.queryParamMap.get('pedidoId') ??
      '';

    if (!this.pedidoId) {
      await this.mostrarToast('⚠ No se detectó pedido.');
      this.router.navigate(['/encuestas-espera']);
      return;
    }

    await this.cargarPedido();
  }

  private async cargarPedido() {
    const { data: ped, error: errPed } = await supabase
      .from('pedidos')
      .select('id, total, estado, cliente_uid')
      .eq('id', this.pedidoId)
      .maybeSingle();

    if (errPed || !ped) {
      await this.mostrarToast('❌ Error cargando pedido.');
      return;
    }
    this.ped = ped;

    const { data: items, error: errItems } = await supabase
      .from('pedidos_items')
      .select('id, nombre, tipo, cantidad, precio_unit')
      .eq('pedido_id', this.pedidoId);

    if (!errItems && items) this.items = items;

    const { data: desc } = await supabase
      .from('descuentos')
      .select('porcentaje')
      .eq('pedido_id', this.pedidoId)
      .maybeSingle();

    if (desc) this.descuento = desc.porcentaje;
    this.actualizarTotal();
    this.loading = false;
  }

  actualizarTotal() {
    let subtotal = this.ped.total;
    if (this.descuento > 0) {
      subtotal = subtotal * (1 - this.descuento / 100);
    }
    this.totalFinal = subtotal * (1 + this.propinaSeleccionada / 100);
  }

  async pagar() {
    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: 'impagado',
        total: this.totalFinal
      })
      .eq('id', this.pedidoId);

    if (error) {
      await this.mostrarToast(`❌ Error al pagar: ${error.message}`);
      return;
    }

    await this.mostrarToast('✅ Pago solicitado. Espera confirmación del mozo.');
    this.volver();
  }

  volver() {
    this.router.navigate(['/encuestas-espera'], {
      queryParams: {
        clienteId: this.clienteId,
        anonimoId: this.anonimoId,
        tienePermiso: true,
        qrValido: true,
        userId: this.userId,
        mostrarCuenta: false
      }
    });
  }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      position: 'top'
    });
    await t.present();
  }
}
