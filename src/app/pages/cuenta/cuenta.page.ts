import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { supabase } from 'src/supabase.client';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Push } from 'src/app/services/push/push';

@Component({
  selector: 'app-cuenta',
  templateUrl: './cuenta.page.html',
  styleUrls: ['./cuenta.page.scss'],
  standalone: false
})
export class CuentaPage implements OnInit {
  private push = inject(Push);
  pedidoId!: string;
  ped: any;
  items: any[] = [];
  descuento: number = 0;
  propinaSeleccionada: number = 0;
  totalFinal: number = 0;
  descuentoMonto: number = 0;
  propinaMonto: number = 0;
  loading = true;

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;
  userId!: string | null;

  constructor(private ar: ActivatedRoute, private router: Router, private toast: ToastController, private route: ActivatedRoute) {
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
      await this.mostrarToast('No se detectó pedido.');
      this.router.navigate(['/encuestas-espera']);
      return;
    }

    await this.cargarPedido();
  }

  private async cargarPedido() {
    const { data: ped, error: errPed } = await supabase
      .from("pedidos")
      .select("id, total, estado, cliente_uid")
      .eq("id", this.pedidoId)
      .maybeSingle();
    if (errPed || !ped) {
      await this.mostrarToast("Error cargando pedido.");
      return;
    }
    this.ped = ped;

    const { data: itemsTotales } = await supabase
      .from("pedido_items")
      .select("id, nombre, tipo, cantidad, precio_unit")
      .eq("pedido_id", this.pedidoId);

    if (itemsTotales) this.items = itemsTotales;

    const { data: desc } = await supabase
      .from("descuentos")
      .select("porcentaje")
      .eq("pedido_id", this.pedidoId)
      .order("aplicado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    this.descuento = Number(desc?.porcentaje ?? 0);
    this.actualizarTotal();
    this.loading = false;
  }

  actualizarTotal() {
    const base = Number(this.ped?.total ?? 0);
    this.descuentoMonto = +((base * this.descuento) / 100).toFixed(2);
    const baseConDesc = +(base - this.descuentoMonto).toFixed(2);
    this.propinaMonto = +((baseConDesc * this.propinaSeleccionada) / 100).toFixed(2);
    this.totalFinal = +(baseConDesc + this.propinaMonto).toFixed(2);
  }

  async escanearPropina() {
    try {
      const { barcodes } = await BarcodeScanner.scan();
      if (!barcodes?.length) {
        await this.mostrarToast('No se detectó ningún código QR.');
        return;
      }

      const contenido = barcodes[0].rawValue?.trim().toLowerCase();
      if (!contenido) {
        await this.mostrarToast('QR inválido.');
        return;
      }

      if (contenido.includes('10')) {
        this.propinaSeleccionada = 10;
      } else if (contenido.includes('15')) {
        this.propinaSeleccionada = 15;
      } else if (contenido.includes('20')) {
        this.propinaSeleccionada = 20;
      } else {
        this.propinaSeleccionada = 0;
        await this.mostrarToast('QR no reconocido. No se aplicó propina.');
      }

      this.actualizarTotal();
      await this.mostrarToast(`Propina seleccionada: ${this.propinaSeleccionada}%`);
    } catch (err) {
      console.error(err);
      await this.mostrarToast('Error al escanear QR.');
    }
  }

  async quitarPropina() {
    this.propinaSeleccionada = 0;
    this.actualizarTotal();
    await this.mostrarToast('Propina eliminada.');
  }

  async pagar(): Promise<void> {
    try {
      const { error } = await supabase
        .from("pedidos")
        .update({ estado: "impagado", total: this.totalFinal })
        .eq("id", this.pedidoId);
      if (error) {
        await this.mostrarToast(`Error al pagar: ${error.message}`);
        return;
      }

      const { data: pedRow } = await supabase
        .from("pedidos")
        .select("mesa_id, mesas(numero)")
        .eq("id", this.pedidoId)
        .maybeSingle();
      const mesaId = pedRow?.mesa_id ?? null;
      const mesaNumero = (pedRow as any)?.mesas?.numero ?? mesaId ?? "NN";
      const isDelivery = mesaId == null;
      const body = isDelivery
        ? "Cliente a domicilio realizó su pago"
        : `Cliente Mesa (${mesaNumero}) realizó su pago`;

      await this.push.sendToRoles(
        ["dueño", "mozo", "supervisor"],
        "Pago Realizado",
        body,
        { tipo: "pago_realizado", pedidoId: this.pedidoId, mesaId, mesaNumero }
      );

      await this.mostrarToast("Pago solicitado. Espere confirmación del mozo.");
      this.volver();
    } catch {
      await this.mostrarToast("Error al pagar.");
    }
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

  private async mostrarToast(mensaje: string) {
    const t = await this.toast.create({
      message: mensaje,
      duration: 1500,
      cssClass: "toast",
      position: 'top'
    });
    await t.present();
  }
}
