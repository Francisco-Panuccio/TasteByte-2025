import { Component, inject, OnInit, OnDestroy, NgZone, ChangeDetectorRef, ViewChild } from "@angular/core";
import { ToastController } from "@ionic/angular";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Email } from "src/app/services/email/email";
import { Pdf } from "src/app/services/pdf/pdf";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { FacturaData, FacturaPage, ItemFactura } from "../factura/factura.page";

type Estado = "pendiente" | "aceptado" | "rechazado" | "terminado" | "recibido" | "impagado";

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

const ALLOWED_STATES: Estado[] = ["pendiente", "aceptado", "impagado"];

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
  private pdf = inject(Pdf);
  private email = inject(Email);
  @ViewChild("facturaCmp", { static: true }) facturaCmp!: FacturaPage;
  pedidoItemsByPedido: Record<string, Array<{ nombre: string; cantidad: number }>> = {};

  private readonly FACTURA_EMPTY: FacturaData = {
    fecha: new Date(),
    receptor: { cuitOdni: "", nombreCompleto: "" },
    items: [],
    totales: { total: 0, propinaPct: 0, propinaMonto: 0, descuentoPct: 0, descuentoMonto: 0 },
  };

  facturaData: FacturaData = this.FACTURA_EMPTY;

  private sentNuevoPedido = new Set<string>();
  private sentDespachado = new Set<string>();
  private delivering = new Set<string>();
  private inflight = new Set<string>();

  loading = true;
  filtro: "pendiente" | "aceptado" | "todos" = "todos";
  rows: PedidoDelivery[] = [];
  sub?: RealtimeChannel;

  private isVisible(r: PedidoDelivery): boolean {
    if (!ALLOWED_STATES.includes(r.estado)) return false;
    if (this.filtro === "pendiente") return r.estado === "pendiente";
    if (this.filtro === "aceptado") return r.estado === "aceptado";
    return true;
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
          if (!ALLOWED_STATES.includes(r.estado) || !this.isVisible(r)) this.removeById(r.id);
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
        .in("estado", ALLOWED_STATES)
        .order("created_at", { ascending: false });

      if (this.filtro === "pendiente") q = q.eq("estado", "pendiente");
      if (this.filtro === "aceptado") q = q.eq("estado", "aceptado");

      const { data, error } = await q;
      if (error) throw error;
      this.rows = (data ?? []) as PedidoDelivery[];

      const pids = this.rows.map(p => p.id).filter(Boolean) as string[];
      this.pedidoItemsByPedido = {};

      if (pids.length) {
        const { data: itemsRows, error: eItems } = await supabase
          .from("pedido_items")
          .select("pedido_id, nombre, cantidad")
          .in("pedido_id", pids);

        if (eItems) throw eItems;
        for (const r of itemsRows ?? []) {
          const pid = String(r.pedido_id);
          if (!this.pedidoItemsByPedido[pid]) this.pedidoItemsByPedido[pid] = [];
          this.pedidoItemsByPedido[pid].push({
            nombre: String(r.nombre ?? ""),
            cantidad: Number(r.cantidad ?? 0),
          });
        }
      }
    } catch (e: any) {
      (await this.toast.create({ message: e?.message ?? "Error listando pedidos", duration: 1500, cssClass: "toast", position: "top" })).present();
    } finally {
      this.loading = false;
    }
  }

  async aceptar(r: PedidoDelivery) {
    if (this.inflight.has(r.id)) return;
    this.inflight.add(r.id);
    try {
      const next: Estado = "aceptado";
      await this.pedidos.actualizarEstado(r.id, next);

      await this.crearTicketsAreas(r.id);
      await this.notificarAreasNuevoPedidoDelivery({ id: r.id });

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
          await Promise.resolve(this.push.send(tokens, "Pedido Confirmado", `Tiempo estimado: ${eta} minutos`, {
            tipo: "delivery_confirmado",
            pedidoId: r.id,
            eta
          }));
        }
      }

      await this.mostrarToast("Pedido aceptado");
    } catch {
      await this.mostrarToast("Error al actualizar");
    } finally {
      this.inflight.delete(r.id);
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

  async entregar(r: PedidoDelivery) {
    const key = `ent:${r.id}`;
    if (this.delivering.has(key)) return;
    this.delivering.add(key);
    try {
      if (this.sentDespachado.has(r.id)) return;
      this.sentDespachado.add(r.id);

      const chk = await this.validarEstadoAreas(r.id);
      if (!chk.valido) {
        (await this.toast.create({ message: chk.mensaje, duration: 1500, position: "top", cssClass: "toast" })).present();
        this.sentDespachado.delete(r.id);
        return;
      }

      const { data: upd, error: eUpd } = await supabase
        .from("pedidos")
        .update({ estado: "recibido" })
        .eq("id", r.id)
        .eq("estado", "aceptado")
        .select("id");
      if (eUpd) throw eUpd;

      const transiciono = Array.isArray(upd) && upd.length > 0;

      if (transiciono && r.tipo === "delivery") {
        try {
          await this.push.sendToRoles(
            ["delivery"],
            "Pedido Despachado",
            "Pedido entregado al repartidor",
            { tipo: "delivery_despachado", pedidoId: r.id }
          );
        } catch { }
      }

      if (this.filtro === "aceptado") this.removeById(r.id);
      (await this.toast.create({ message: "Pedido entregado al repartidor", duration: 1400, position: "top", cssClass: "toast" })).present();
    } catch {
      (await this.toast.create({ message: "No se pudo entregar", duration: 1400, position: "top", cssClass: "toast" })).present();
      this.sentDespachado.delete(r.id);
    } finally {
      this.delivering.delete(key);
    }
  }

  private async validarEstadoAreas(
    pedidoId: string
  ): Promise<{ valido: boolean; mensaje: string }> {
    try {
      const [{ data: bar }, { data: cocina }] = await Promise.all([
        supabase.from("bar_pedidos").select("estado").eq("pedido_id", pedidoId).maybeSingle(),
        supabase.from("cocina_pedidos").select("estado").eq("pedido_id", pedidoId).maybeSingle(),
      ]);

      const hasBar = !!bar;
      const hasCocina = !!cocina;
      const doneBar = hasBar && bar!.estado === "terminado";
      const doneCocina = hasCocina && cocina!.estado === "terminado";

      const listo =
        (hasBar && hasCocina && doneBar && doneCocina) ||
        (hasBar && !hasCocina && doneBar) ||
        (!hasBar && hasCocina && doneCocina);

      if (listo) return { valido: true, mensaje: "Listo para entregar" };

      let faltan: string[] = [];
      if (hasBar && !doneBar) faltan.push("bar");
      if (hasCocina && !doneCocina) faltan.push("cocina");
      if (!hasBar && !hasCocina) return { valido: false, mensaje: "El pedido no está distribuido en bar/cocina." };

      const msg = faltan.length === 2 ? "Falta en cocina y bar" : `Falta en ${faltan[0]}`;
      return { valido: false, mensaje: msg };
    } catch {
      return { valido: false, mensaje: "Error verificando bar/cocina" };
    }
  }

  private async crearTicketsAreas(pedidoId: string): Promise<void> {
    const { data: rows, error: eItems } = await supabase
      .from("pedido_items")
      .select("producto_id, nombre, cantidad, precio_unit, tipo")
      .eq("pedido_id", pedidoId);
    if (eItems) throw eItems;

    const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();
    const cocinaRows = (rows ?? []).filter(r => ["plato", "postre"].includes(norm((r as any).tipo)));
    const barRows = (rows ?? []).filter(r => ["bebida"].includes(norm((r as any).tipo)));

    const { data: pedRow, error: ePed } = await supabase
      .from("pedidos")
      .select("mesa_id")
      .eq("id", pedidoId)
      .maybeSingle();
    if (ePed) throw ePed;

    const mesa_id: number | null = (pedRow as any)?.mesa_id ?? null;

    let mesa_numero: number | null = null;
    if (mesa_id != null) {
      const { data: mesaRow, error: eMesa } = await supabase
        .from("mesas")
        .select("numero")
        .eq("id", mesa_id)
        .maybeSingle();
      if (eMesa) throw eMesa;
      mesa_numero = (mesaRow as any)?.numero ?? null;
    }

    const build = (arr: any[]) => {
      const items = arr.map(r => ({
        producto_id: (r as any).producto_id,
        nombre: (r as any).nombre,
        cantidad: Number((r as any).cantidad ?? 0),
        precio_unit: Number((r as any).precio_unit ?? 0)
      }));
      const cantidad = items.reduce((a, r) => a + (r.cantidad || 0), 0);
      const total = items.reduce((a, r) => a + (r.cantidad || 0) * (r.precio_unit || 0), 0);

      return {
        pedido_id: pedidoId,
        mesa_id,
        mesa_numero,
        estado: "pendiente",
        items,
        cantidad,
        total,
        creado_en: new Date().toISOString()
      };
    };

    if (barRows.length) {
      const { error: eBar } = await supabase
        .from("bar_pedidos")
        .upsert(build(barRows), { onConflict: "pedido_id" })
        .select();
      if (eBar) throw eBar;
    }

    if (cocinaRows.length) {
      const { error: eCoc } = await supabase
        .from("cocina_pedidos")
        .upsert(build(cocinaRows), { onConflict: "pedido_id" })
        .select();
      if (eCoc) throw eCoc;
    }
  }

  private async notificarAreasNuevoPedidoDelivery(p: { id: string }): Promise<void> {
    const pid = String(p?.id ?? "");
    if (!pid) return;
    if (this.sentNuevoPedido.has(pid)) return;
    this.sentNuevoPedido.add(pid);

    const title = "Nuevo Pedido";
    const body = "Nuevo pedido de reparto";
    const data = { tipo: "nuevo_pedido_delivery", pedidoId: pid, mesaId: null };

    const { data: toks } = await supabase
      .from("push_tokens")
      .select("token")
      .in("role", ["bartender", "cocinero"])
      .eq("active", true)
      .eq("revoked", false);

    const self = this.push.getToken?.() || null;
    const list = Array.from(new Set((toks ?? []).map((t: any) => t.token as string))).filter(t => (self ? t !== self : true));
    if (!list.length) return;

    if (typeof (this as any).push.sendToTokens === "function") {
      await Promise.resolve((this as any).push.sendToTokens(list, { title, body, data }));
    } else if (typeof (this as any).push.send === "function") {
      await Promise.resolve((this as any).push.send(list, title, body, data));
    }
  }

  private async buildFacturaDataDelivery(
    pedidoId: string,
    emailCliente?: string | null
  ): Promise<{ data: FacturaData; fileName: string }> {
    let user: any = null;
    if (emailCliente) {
      const { data: u } = await supabase
        .from("usuarios")
        .select("id, apellidos, nombres, numero_documento, numero_cuil")
        .eq("correo_electronico", emailCliente)
        .maybeSingle();
      user = u;
    }

    const { data: ped } = await supabase
      .from("pedidos")
      .select("id, total")
      .eq("id", pedidoId)
      .maybeSingle();

    const { data: rows } = await supabase
      .from("pedido_items")
      .select("id, cantidad, precio_unit, nombre, producto_id")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending: true });

    const { data: descRow } = await supabase
      .from("descuentos")
      .select("porcentaje, aplicado_en")
      .eq("pedido_id", pedidoId)
      .order("aplicado_en", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nombreCompleto = user ? `${user.nombres} ${user.apellidos}`.trim() : "Cliente Anonimo";
    const cuitOdni = user?.numero_documento || user?.numero_cuil || "No especificado";

    const items: ItemFactura[] = (rows ?? []).map((r: any, i: number) => ({
      codigo: String(r?.producto_id ?? r?.id ?? i + 1),
      descripcion: String(r?.nombre ?? "Item"),
      cantidad: Number(r?.cantidad ?? 1),
      precioUnit: Number(r?.precio_unit ?? 0),
      subtotal: Number(r?.cantidad ?? 1) * Number(r?.precio_unit ?? 0),
    }));

    const sumaItems = items.reduce((a, b) => a + (b.subtotal || 0), 0);
    const descuentoPct = Number(descRow?.porcentaje ?? 0);
    const baseConDescuento = +(sumaItems * (1 - descuentoPct / 100)).toFixed(2);
    const totalFinal = Number(ped?.total ?? sumaItems);
    const propinaMonto = +Math.max(0, totalFinal - baseConDescuento).toFixed(2);
    const descuentoMonto = +(sumaItems - baseConDescuento).toFixed(2);
    const propinaPct = baseConDescuento > 0 ? Math.round((propinaMonto / baseConDescuento) * 100) : 0;

    const fecha = new Date().toISOString().slice(0, 10);
    const safeNombre = nombreCompleto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `Factura_${fecha}_${safeNombre}_p${pedidoId}.pdf`;

    const data: FacturaData = {
      fecha: new Date(),
      receptor: { cuitOdni, nombreCompleto },
      items,
      totales: {
        total: totalFinal,
        propinaPct,
        propinaMonto,
        descuentoPct,
        descuentoMonto,
      },
    };

    return { data, fileName };
  }

  private async waitForRender(el: HTMLElement) {
    await new Promise((r) => requestAnimationFrame(r));
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
    await Promise.all(
      imgs.map((i) =>
        i.complete
          ? Promise.resolve()
          : new Promise((res) => {
            i.onload = i.onerror = () => res(null);
          })
      )
    );
  }

  private async emitirFacturaYEnviarDelivery(
    pedidoId: string,
    emailCliente: string
  ): Promise<void> {
    const { data, fileName } = await this.buildFacturaDataDelivery(pedidoId, emailCliente);
    if (!emailCliente) throw new Error("Email del cliente no disponible.");
    this.facturaData = data;
    this.cdr.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    const el = this.facturaCmp.root.nativeElement;
    await this.waitForRender(el);
    const blob = await this.pdf.exportarA4(el, fileName);
    const base64 = await this.pdf.blobToBase64(blob);
    await this.email.enviarFacturaDescarga(emailCliente, {
      receptor: data.receptor,
      items: data.items.map((it) => ({
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnit: it.precioUnit,
        subtotal: it.subtotal,
      })),
      total: data.totales.total,
      filename: fileName,
      pdfBase64: base64,
      propinaPct: data.totales.propinaPct ?? 0,
      propinaMonto: data.totales.propinaMonto ?? 0,
      descuentoPct: data.totales.descuentoPct ?? 0,
      descuentoMonto: data.totales.descuentoMonto ?? 0,
    });
    (await this.toast.create({ message: "Factura enviada correctamente", duration: 1500, position: "top", cssClass: "toast" })).present();
    this.facturaData = this.FACTURA_EMPTY;
  }

  async setEstado(
    pedidoId: string,
    estado: "aceptado" | "rechazado" | "pagado" | "recibido"
  ): Promise<void> {
    try {
      await this.pedidos.actualizarEstado(pedidoId, estado as any);

      const { data: ped } = await supabase
        .from("pedidos")
        .select("tipo, cliente_email, cliente_uid")
        .eq("id", pedidoId)
        .maybeSingle();

      if (estado === "pagado" && ped?.tipo === "delivery" && ped?.cliente_email) {
        const { error: errDel } = await supabase
          .from("pedidos")
          .delete()
          .eq("cliente_email", ped.cliente_email);
        if (errDel) console.warn("[delivery] Limpieza post-pago falló:", errDel.message);
      }

      if (estado === "pagado" && ped?.cliente_uid) {
        const { data: toks } = await supabase
          .from("push_tokens")
          .select("token")
          .eq("usuario_id", ped.cliente_uid)
          .eq("role", "cliente")
          .eq("active", true)
          .eq("revoked", false);
        const list = Array.from(new Set((toks ?? []).map((t: any) => t.token as string))).filter(Boolean);
        if (list.length) {
          await this.push.send(list, "Pago Confirmado", "Tu pago fue validado", {
            tipo: "pedido",
            pedidoId,
            mesaId: null,
            estado,
          });
        }
      }

      const msg =
        estado === "rechazado"
          ? "Pedido rechazado"
          : estado === "aceptado"
            ? "Pedido aceptado"
            : estado === "recibido"
              ? "Pedido entregado"
              : "Estado actualizado";

      (await this.toast.create({ message: msg, duration: 1200, position: "top", cssClass: "toast" })).present();
      await this.cargar();
    } catch (e) {
      console.warn("[delivery] setEstado error:", e);
      (await this.toast.create({ message: "No se pudo actualizar el estado", duration: 1400, position: "top", cssClass: "toast" })).present();
    }
  }

  async validarPago(pedidoId: string): Promise<void> {
    const { data: ped } = await supabase
      .from("pedidos")
      .select("cliente_email, cliente_uid, total, delivery_direccion")
      .eq("id", pedidoId)
      .single();

    this.loading = true;
    try {
      await this.emitirFacturaYEnviarDelivery(pedidoId, ped!.cliente_email);
    } catch (e) {
      (await this.toast.create({ message: "No se pudo enviar la factura", duration: 1500, position: "top", cssClass: "toast" })).present();
    } finally {
      this.loading = false;
    }

    await this.setEstado(pedidoId, "pagado");
    (await this.toast.create({ message: "Pago validado", duration: 1500, position: "top", cssClass: "toast" })).present();
  }

  private async mostrarToast(message: string): Promise<void> {
    const t = await this.toast.create({ message, duration: 1200, cssClass: "toast", position: "top" });
    await t.present();
  }
}