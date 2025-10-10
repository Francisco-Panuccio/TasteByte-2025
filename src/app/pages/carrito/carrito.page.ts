import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { ToastController } from "@ionic/angular";
import { supabase } from "src/supabase.client";
import { Pedidos } from "src/app/services/pedidos/pedidos";

@Component({
  selector: "app-carrito",
  templateUrl: "./carrito.page.html",
  styleUrls: ["./carrito.page.scss"],
  standalone: false
})
export class CarritoPage implements OnInit {
  pedidoId!: string;
  ped: any;
  items: any[] = [];
  loading = true;
  popUp: boolean = false;

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;
  mesaId?: number;

  verificando = false;
  readonly imgFallback = "assets/images/no-image.png";

  constructor(
    private ar: ActivatedRoute,
    private pedidos: Pedidos,
    private toast: ToastController
  ) { }

  async ngOnInit() {
    this.pedidoId =
      this.ar.snapshot.paramMap.get("id") ??
      this.ar.snapshot.queryParamMap.get("id") ??
      "";

    const p = this.ar.snapshot.queryParamMap;
    this.anonimoId = p.get("anonimoId") ?? undefined;
    this.usuarioId = p.get("usuarioId") ? Number(p.get("usuarioId")) : null;
    this.clienteId = p.get("clienteId") ? Number(p.get("clienteId")) : null;
    this.mesaId = p.get("mesaId") ? Number(p.get("mesaId")) : undefined;

    try {
      if (!this.pedidoId) {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email ?? null;

        if (email) {
          const { ped, items } = await this.pedidos.getPedidoActualPorEmail(email);
          this.ped = ped;
          this.items = items ?? [];
          if (this.ped) await this.verificarDescuento(this.ped.id as string);
          if (!this.ped) await this.mostrarToast("No hay pedido activo");
        } else if (this.mesaId != null) {
          const activo = await this.pedidos.getPedidoActivo({ mesaId: this.mesaId }, true);
          if (activo?.id) {
            const r = await this.pedidos.getPedido(activo.id as string);
            this.ped = r.ped;
            this.items = r.items ?? [];
            if (this.ped) await this.verificarDescuento(this.ped.id as string);
          } else {
            await this.mostrarToast("No hay pedido asociado a la mesa");
          }
        } else {
          await this.mostrarToast("Falta id o mesa");
        }
      } else {
        const { ped, items } = await this.pedidos.getPedido(this.pedidoId);
        this.ped = ped;
        this.items = items ?? [];
        if (!this.ped) {
          await this.mostrarToast("Pedido no encontrado en la BD");
        } else {
          await this.verificarDescuento(this.ped.id as string);
        }
      }
    } catch (e: any) {
      await this.mostrarToast(`Error cargando carrito: ${e.message ?? e}`, "Error");
    } finally {
      this.loading = false;
    }
  }

  private async verificarDescuento(pedidoId: string) {
    const { data: desc, error: descError } = await supabase
      .from("descuentos")
      .select("porcentaje, pedido_id")
      .eq("pedido_id", pedidoId)
      .maybeSingle();

    if (descError) {
      await this.mostrarToast(`Error cargando descuento: ${descError.message}`, "Error");
      return;
    }

    if (desc && this.ped?.total != null) {
      this.ped.totalConDescuento = this.ped.total * (1 - desc.porcentaje / 100);
    }
  }

  getNombre(i: any): string {
    return (
      i.nombre ??
      i.producto?.nombre ??
      i.plato?.nombre ??
      i.bebida?.nombre ??
      "Ítem"
    );
  }

  getCantidad(i: any): number {
    return Number(i.cantidad ?? i.cant ?? i.cantidad_pedida ?? 1);
  }

  getPrecio(i: any): number {
    return Number(
      i.precio ??
      i.producto?.precio ??
      i.plato?.precio ??
      i.bebida?.precio ??
      0
    );
  }

  getFoto(i: any): string {
    return (
      i.foto_url ??
      i.producto?.foto_url ??
      i.plato?.foto_url ??
      i.bebida?.foto_url ??
      this.imgFallback
    );
  }

  onImgError(ev: Event) {
    const t = ev.target as HTMLImageElement;
    if (t && t.src !== this.imgFallback) t.src = this.imgFallback;
  }

  subtotal(i: any): number {
    return this.getPrecio(i) * this.getCantidad(i);
  }

  totalCalculado(): number {
    if (this.ped?.total != null) return Number(this.ped.total);
    return this.items.reduce((acc, it) => acc + this.subtotal(it), 0);
  }

  cerrar() {
    this.popUp = false;
  }

  private async mostrarToast(message: string, header = "Aviso", duration = 1500) {
    const t = await this.toast.create({
      header,
      message,
      duration,
      cssClass: "toast",
      position: "top"
    });
    await t.present();
  }
}