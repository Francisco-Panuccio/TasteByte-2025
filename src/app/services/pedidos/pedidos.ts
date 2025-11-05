import { Injectable } from "@angular/core";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Pedido } from "src/app/interfaces/pedido";
import { PedidoItem } from "src/app/interfaces/pedido-item";
import { supabase } from "src/supabase.client";

type ExtraDelivery = { delivery?: boolean; address?: string; lat?: number; lng?: number };

@Injectable({ providedIn: "root" })
export class Pedidos {
  async crearPedido(
    mesaId: number | null,
    clienteUid: string,
    clienteEmail: string | null,
    items: PedidoItem[],
    total: number,
    etaMin: number,
    extra?: { delivery?: boolean; address?: string; lat?: number; lng?: number }
  ): Promise<string> {
    const { data: ped, error } = await supabase
      .from("pedidos")
      .insert({
        mesa_id: mesaId,
        cliente_uid: clienteUid || null,
        cliente_email: clienteEmail,
        total,
        eta_minutos: etaMin,
        estado: "pendiente",
        tipo: extra?.delivery ? "delivery" : "mesa",
        delivery_direccion: extra?.address ?? null,
        delivery_lat: extra?.lat ?? null,
        delivery_lng: extra?.lng ?? null
      })
      .select("id")
      .single();
    if (error) throw error;

    const pedidoId = ped.id as string;

    const rows = items.map(i => ({
      pedido_id: pedidoId,
      producto_id: i.productoId,
      tipo: i.tipo,
      nombre: i.nombre,
      precio_unit: i.precioUnit,
      cantidad: i.cantidad,
      duracion_min: i.duracionMin
    }));
    const { error: e2 } = await supabase.from("pedido_items").insert(rows);
    if (e2) throw e2;

    return pedidoId;
  }

  async reemplazarItems(
    pedidoId: string,
    items: PedidoItem[],
    total: number,
    etaMin: number,
    nuevoEstado: Pedido["estado"] = "pendiente",
    extra?: ExtraDelivery
  ): Promise<void> {
    const { error: ei } = await supabase.from("pedido_items").delete().eq("pedido_id", pedidoId);
    if (ei) throw ei;

    const rows = items.map(i => ({
      pedido_id: pedidoId,
      producto_id: i.productoId,
      tipo: i.tipo,
      nombre: i.nombre,
      precio_unit: i.precioUnit,
      cantidad: i.cantidad,
      duracion_min: i.duracionMin
    }));
    const { error: e2 } = await supabase.from("pedido_items").insert(rows);
    if (e2) throw e2;

    const patch: any = { total, eta_minutos: etaMin, estado: nuevoEstado };
    if (extra?.delivery !== undefined) {
      patch.tipo = extra.delivery ? "delivery" : "mesa";
      if (extra.delivery) {
        patch.mesa_id = null;
        patch.delivery_direccion = extra.address ?? null;
        patch.delivery_lat = extra.lat ?? null;
        patch.delivery_lng = extra.lng ?? null;
      } else {
        patch.delivery_direccion = null;
        patch.delivery_lat = null;
        patch.delivery_lng = null;
      }
    }

    const { error: e3 } = await supabase.from("pedidos").update(patch).eq("id", pedidoId);
    if (e3) throw e3;
  }

  async actualizarEstado(pedidoId: string, estado: Pedido["estado"]): Promise<void> {
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", pedidoId);
    if (error) throw error;
  }

  async eliminarPedido(pedidoId: string): Promise<void> {
    const { error: ei } = await supabase.from("pedido_items").delete().eq("pedido_id", pedidoId);
    if (ei) throw ei;
    const { error: ep } = await supabase.from("pedidos").delete().eq("id", pedidoId);
    if (ep) throw ep;
  }

  onEstadoPedido(pedidoId: string, cb: (estado: Pedido["estado"]) => void): () => void {
    const ch: RealtimeChannel = supabase
      .channel(`pedido:${pedidoId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${pedidoId}` },
        payload => cb((payload.new as any).estado as Pedido["estado"])
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }

  async getPedido(id: string): Promise<{ ped: any; items: any[] }> {
    const { data: ped, error } = await supabase
      .from("pedidos")
      .select(`
        id, estado, total, eta_minutos, created_at, tipo,
        mesa_id,
        delivery_direccion, delivery_lat, delivery_lng,
        mesa:mesas(numero)
      `)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!ped) return { ped: null, items: [] };

    const { data: items, error: e2 } = await supabase
      .from("pedido_items")
      .select("*")
      .eq("pedido_id", id);
    if (e2) throw e2;

    return { ped, items: items ?? [] };
  }

  async getPedidoActivo(
    opts: { mesaId?: number | null; delivery?: boolean; clienteUid?: string; clienteEmail?: string },
    includeRejected: boolean = false
  ): Promise<any | null> {
    const estados: Pedido["estado"][] = includeRejected
      ? ["pendiente", "aceptado", "terminado", "rechazado", "recibido"]
      : ["pendiente", "aceptado", "terminado", "recibido"];

    let q: any = supabase
      .from("pedidos")
      .select("id, mesa_id, estado, created_at, tipo")
      .in("estado", estados)
      .order("created_at", { ascending: false })
      .limit(1);

    if (opts.delivery) {
      q = q.eq("tipo", "delivery").is("mesa_id", null);
    } else if (opts.mesaId != null) {
      q = q.eq("mesa_id", opts.mesaId).eq("tipo", "mesa");
    }

    const uidOk = typeof opts.clienteUid === "string" && opts.clienteUid.trim() !== "";
    if (opts.clienteEmail) q = q.eq("cliente_email", opts.clienteEmail);
    else if (uidOk) q = q.eq("cliente_uid", opts.clienteUid as string);

    const { data, error } = await q;
    if (error) throw error;
    return (data && data[0]) || null;
  }

  async getUltimoRechazado(
    opts: { mesaId?: number | null; delivery?: boolean; clienteUid?: string; clienteEmail?: string }
  ): Promise<string | null> {
    let q: any = supabase
      .from("pedidos")
      .select("id, created_at, tipo")
      .eq("estado", "rechazado")
      .order("created_at", { ascending: false })
      .limit(1);

    if (opts.delivery) {
      q = q.eq("tipo", "delivery").is("mesa_id", null);
    } else if (opts.mesaId != null) {
      q = q.eq("mesa_id", opts.mesaId).eq("tipo", "mesa");
    }

    const uidOk = typeof opts.clienteUid === "string" && opts.clienteUid.trim() !== "";
    if (opts.clienteEmail) q = q.eq("cliente_email", opts.clienteEmail);
    else if (uidOk) q = q.eq("cliente_uid", opts.clienteUid as string);

    const { data, error } = await q;
    if (error) throw error;
    return (data && data[0]?.id) || null;
  }

  async getPedidoAceptadoActual(mesaId: number, _clienteUid: string | null, _clienteEmail: string | null): Promise<string | null> {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id")
      .eq("mesa_id", mesaId)
      .eq("tipo", "mesa")
      .eq("estado", "aceptado")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  }

  async getEstadosAreas(pedidoId: string): Promise<{ bar: string | null; cocina: string | null }> {
    const [barRes, cocRes] = await Promise.all([
      supabase.from("bar_pedidos").select("estado").eq("pedido_id", pedidoId).order("creado_en", { ascending: false }).limit(1),
      supabase.from("cocina_pedidos").select("estado").eq("pedido_id", pedidoId).order("creado_en", { ascending: false }).limit(1)
    ]);
    if (barRes.error) throw barRes.error;
    if (cocRes.error) throw cocRes.error;
    return {
      bar: barRes.data?.[0]?.estado ?? null,
      cocina: cocRes.data?.[0]?.estado ?? null
    };
  }

  resolverMensajeAreas(estados: { bar: string | null; cocina: string | null }): string | null {
    const barPend = estados.bar === "pendiente";
    const cocPend = estados.cocina === "pendiente";
    const barTerm = estados.bar === "terminado";
    const cocTerm = estados.cocina === "terminado";

    if (barPend && cocPend) return "Pedido en preparación en cocina y bar";
    if (barPend && !cocPend) return "Pedido en preparación en bar";
    if (cocPend && !barPend) return "Pedido en preparación en cocina";
    if (barTerm && cocTerm) return "Pedido en manos del mozo";
    return null;
  }

  async getPedidoActualPorEmail(email: string): Promise<{ ped: any; items: any[] }> {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id, total, estado, mesa_id, cliente_uid, cliente_email, tipo")
      .eq("cliente_email", email)
      .in("estado", ["pendiente", "aceptado", "terminado", "recibido"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;

    const id = data?.[0]?.id as string | undefined;
    if (!id) return { ped: null, items: [] };

    return this.getPedido(id);
  }

  async listar(estado?: Pedido["estado"] | "impagado") {
    let q: any = supabase
      .from("pedidos")
      .select(`
      id, tipo, mesa_id,
      delivery_direccion, delivery_lat, delivery_lng,
      total, eta_minutos, estado, created_at
    `)
      .order("created_at", { ascending: false });

    if (estado === "impagado") {
      q = q.eq("estado", "impagado");
    } else if (estado) {
      q = q.eq("estado", estado);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  subscribeCambios(cb: () => void): { unsubscribe: () => void } {
    const ch = supabase
      .channel("pedidos_mozo_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos", filter: "tipo=eq.mesa" }, () => cb())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: "tipo=eq.mesa" }, () => cb())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pedidos", filter: "tipo=eq.mesa" }, () => cb())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, () => cb())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, () => cb())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pedidos", filter: "tipo=eq.delivery" }, () => cb())
      .subscribe();

    return { unsubscribe: () => supabase.removeChannel(ch) };
  }
}