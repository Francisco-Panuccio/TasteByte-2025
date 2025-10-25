import { Component, inject, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from "@angular/core";
import { ToastController } from "@ionic/angular";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";

type Estado = "en_espera" | "pendiente" | "aceptado" | "rechazado" | "terminado";

type PedidoDelivery = {
  id: string;
  estado: Estado;
  total: number;
  eta_minutos: number | null;
  created_at: string;
  cliente_email: string | null;
  cliente_uid: string | null;
  delivery_direccion: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  tipo?: "delivery" | "mesa";
};

@Component({
  selector: "app-pedidos-delivery",
  templateUrl: "./pedidos-delivery.page.html",
  styleUrls: ["./pedidos-delivery.page.scss"],
  standalone: false
})
export class PedidosDeliveryPage implements OnInit, OnDestroy {
  private toast = inject(ToastController);
  private pedidos = inject(Pedidos);
  private push = inject(Push);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  filtro: "pendiente" | "todos" = "pendiente";
  rows: PedidoDelivery[] = [];
  sub?: RealtimeChannel;

  private isVisible(r: PedidoDelivery): boolean {
    return this.filtro === "pendiente" ? r.estado === "en_espera" : true;
  }
  private removeById(id: string): void {
    this.rows = this.rows.filter(x => x.id !== id);
  }
  private upsertRow(r: PedidoDelivery): void {
    const idx = this.rows.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      const next = { ...this.rows[idx], ...r };
      this.rows = [...this.rows.slice(0, idx), next, ...this.rows.slice(idx + 1)];
    } else {
      this.rows = [r, ...this.rows];
    }
  }

  async ngOnInit() {
    await this.cargar();

    const handler = (payload: any) => {
      this.zone.run(() => {
        const ev = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const row = ev === "DELETE" ? payload.old : payload.new;
        if (!row) return;
        const r = row as PedidoDelivery;

        if (ev === "DELETE") {
          this.removeById(r.id);
        } else {
          if (!this.isVisible(r)) this.removeById(r.id);
          else this.upsertRow(r);
        }
        this.cdr.detectChanges();
      });
    };

    this.sub = supabase
      .channel("delivery_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, handler)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, handler)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, handler)
      .subscribe();
  }

  ngOnDestroy() {
    if (this.sub) supabase.removeChannel(this.sub);
  }

  trackById = (_: number, r: PedidoDelivery) => r.id;

  async cargar() {
    this.loading = true;
    try {
      let q: any = supabase
        .from("pedidos")
        .select("id, estado, total, eta_minutos, created_at, cliente_email, cliente_uid, delivery_direccion, delivery_lat, delivery_lng, tipo")
        .eq("tipo", "delivery")
        .order("created_at", { ascending: false });

      if (this.filtro === "pendiente") q = q.eq("estado", "en_espera");

      const { data, error } = await q;
      if (error) throw error;
      this.rows = (data ?? []) as PedidoDelivery[];
    } catch (e: any) {
      (await this.toast.create({ message: e?.message ?? "Error listando deliverys", duration: 1500, cssClass: "toast", position: "top" })).present();
    } finally {
      this.loading = false;
    }
  }

  async aceptar(r: PedidoDelivery) {
    try {
      const next: Estado = "pendiente";
      await this.pedidos.actualizarEstado(r.id, next);

      if (this.filtro === "pendiente") this.removeById(r.id);

      if (r.cliente_uid) {
        const { data: toks } = await supabase
          .from("push_tokens")
          .select("token")
          .eq("usuario_id", r.cliente_uid)
          .eq("role", "cliente")
          .eq("active", true)
          .eq("revoked", false);

        const tokens = Array.from(new Set((toks ?? []).map((t: any) => t.token as string))).filter(Boolean);
        if (tokens.length) {
          const eta = r.eta_minutos ?? 0;
          await this.push.send(tokens, "Pedido confirmado", `Tiempo estimado: ${eta} minutos`, {
            tipo: "delivery_confirmado",
            pedidoId: r.id,
            eta
          });
        }
      }

      await this.mostrarToast("Pedido aceptado");
    } catch {
      await this.mostrarToast("Error al actualizar");
    }
  }

  async rechazar(r: PedidoDelivery) {
    try {
      await this.pedidos.actualizarEstado(r.id, "rechazado");
      this.removeById(r.id);

      await this.mostrarToast("Pedido rechazado");
    } catch {
      await this.mostrarToast("Error al rechazar");
    }
  }

  private async mostrarToast(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1200, cssClass: "toast", position: "top" });
    await t.present();
  }
}