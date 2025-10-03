import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { supabase } from "src/supabase.client";
import { ToastController } from "@ionic/angular";

@Component({
  selector: "app-pedido",
  templateUrl: "./pedido.page.html",
  styleUrls: ["./pedido.page.scss"],
  standalone: false
})
export class PedidoPage implements OnInit {
  pedidoId!: string;
  ped: any;
  loading = true;
  items: any[] = [];
  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;
  verificando = false;

  constructor(
    private ar: ActivatedRoute,
    private pedidos: Pedidos,
    private router: Router,
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

    if (!this.pedidoId) {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;
      if (email) {
        const { ped, items } = await this.pedidos.getPedidoActualPorEmail(email);
        this.ped = ped;
        this.items = items;
        if (this.ped) {
          await this.verificarDescuento(this.ped.id);
        } else {
          await this.mostrarToast("⚠ No hay pedido activo");
        }
        this.loading = false;
        return;
      }
      this.loading = false;
      return;
    }

    const { ped, items } = await this.pedidos.getPedido(this.pedidoId);
    this.ped = ped;
    this.items = items;

    if (!this.ped) {
      await this.mostrarToast("⚠ Pedido no encontrado en la BD");
    } else {
      await this.verificarDescuento(this.ped.id);
    }

    this.loading = false;
  }

  private async verificarDescuento(pedidoId: string) {
    const { data: desc, error: descError } = await supabase
      .from("descuentos")
      .select("porcentaje, pedido_id")
      .eq("pedido_id", pedidoId)
      .maybeSingle();

    if (descError) {
      await this.mostrarToast(`❌ Error cargando descuento: ${descError.message}`, "danger");
      return;
    }

    if (desc && this.ped?.total) {
      this.ped.totalConDescuento = this.ped.total * (1 - desc.porcentaje / 100);
      await this.mostrarToast(`🎉 Descuento detectado: ${desc.porcentaje}% aplicado`);
    } else {
      await this.mostrarToast("ℹ Pedido sin descuento aplicado");
    }
  }

  volver() {
    this.router.navigate(["/encuestas-espera"], {
      queryParams: {
        clienteId: this.clienteId,
        anonimoId: this.anonimoId,
        tienePermiso: true,
        qrValido: true
      }
    });
  }

  private async checkTerminado(tabla: string, pedidoId: string): Promise<boolean> {
    const r1 = await supabase
      .from(tabla)
      .select("id")
      .eq("pedido_id", pedidoId)
      .eq("estado", "terminado")
      .limit(1)
      .maybeSingle();

    if (!r1.error) return !!r1.data;

    if ((r1.error as any)?.code === "42703") {
      const r2 = await supabase
        .from(tabla)
        .select("id")
        .eq("uuid", pedidoId)
        .eq("estado", "terminado")
        .limit(1)
        .maybeSingle();
      if (r2.error) throw r2.error;
      return !!r2.data;
    }

    throw r1.error;
  }

  async confirmarRecibido(): Promise<void> {
    if (!this.ped?.id) {
      await this.mostrarToast("❌ Pedido no cargado", "danger");
      return;
    }

    this.verificando = true;

    try {
      const pedidoId = this.ped.id as string;

      const [barOk, cocinaOk] = await Promise.all([
        this.checkTerminado("bar_pedidos", pedidoId),
        this.checkTerminado("cocina_pedidos", pedidoId)
      ]);

      if (barOk && cocinaOk) {
        const { error } = await supabase
          .from("pedidos")
          .update({ estado: "terminado" })
          .eq("id", pedidoId);

        if (error) {
          await this.mostrarToast(`❌ No se pudo marcar como terminado: ${error.message}`, "danger");
          return;
        }

        this.ped.estado = "terminado";
        await this.mostrarToast("✅ Pedido marcado como TERMINADO", "success");
      } else {
        const faltan = [barOk ? null : "bar", cocinaOk ? null : "cocina"].filter(Boolean).join(" y ");
        await this.mostrarToast(`⏳ Aún en preparación (${faltan})`, "warning");
      }
    } catch (e: any) {
      await this.mostrarToast(`❌ Error verificando estados: ${e.message ?? e}`, "danger");
    } finally {
      this.verificando = false;
    }
  }

  private async mostrarToast(mensaje: string, color: string = "primary") {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      position: "top"
    });
    await t.present();
  }
}