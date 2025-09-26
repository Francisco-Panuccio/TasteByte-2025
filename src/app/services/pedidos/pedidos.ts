import { Injectable } from "@angular/core";
import { RealtimeChannel } from "@supabase/supabase-js";
import { Pedido } from "src/app/interfaces/pedido";
import { PedidoItem } from "src/app/interfaces/pedido-item";
import { supabase } from "src/supabase.client";

@Injectable({ providedIn: "root" })
export class Pedidos {
  async crearPedido(
    mesaId: number,
    clienteUid: string,
    clienteEmail: string | null,
    items: PedidoItem[],
    total: number,
    etaMin: number
  ): Promise<string> {
    const { data: ped, error } = await supabase
      .from("pedidos")
      .insert({
        mesa_id: mesaId,
        cliente_uid: clienteUid,
        cliente_email: clienteEmail,
        total,
        eta_minutos: etaMin,
        estado: "pendiente"
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
    nuevoEstado: Pedido["estado"] = "pendiente"
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

    const { error: e3 } = await supabase
      .from("pedidos")
      .update({ total, eta_minutos: etaMin, estado: nuevoEstado })
      .eq("id", pedidoId);
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
      .select("*, mesa:mesas!pedidos_mesa_id_fkey (numero)")
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
    opts: { mesaId?: number; clienteUid?: string; clienteEmail?: string },
    includeRejected: boolean = false
  ): Promise<any | null> {
    const estados: Pedido["estado"][] = includeRejected
      ? ["pendiente", "aceptado", "terminado", "rechazado"]
      : ["pendiente", "aceptado", "terminado"];

    let q = supabase
      .from("pedidos")
      .select("id, mesa_id, estado, created_at")
      .in("estado", estados)
      .order("created_at", { ascending: false })
      .limit(1);

    if (opts.mesaId != null) q = q.eq("mesa_id", opts.mesaId);
    if (opts.clienteEmail) q = q.eq("cliente_email", opts.clienteEmail);
    if (opts.clienteUid) q = q.eq("cliente_uid", opts.clienteUid);

    const { data, error } = await q;
    if (error) throw error;
    return (data && data[0]) || null;
  }

  async getPedidoActualPorEmail(email: string): Promise<{ ped: any; items: any[] }> {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id")
      .eq("cliente_email", email)
      .in("estado", ["pendiente", "aceptado", "terminado"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;

    const id = data?.[0]?.id as string | undefined;
    if (!id) return { ped: null, items: [] };
    return this.getPedido(id);
  }

  async listar(estado?: Pedido["estado"]) {
    const base = supabase
      .from("pedidos")
      .select("id, mesa_id, total, eta_minutos, estado, created_at, mesa:mesas!pedidos_mesa_id_fkey (numero)")
      .order("created_at", { ascending: false });

    const { data, error } = estado ? await base.eq("estado", estado) : await base;
    if (error) throw error;
    return data;
  }

  subscribeCambios(cb: (p: any) => void): RealtimeChannel {
    return supabase
      .channel("pedidos_all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos" }, payload => cb(payload.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos" }, payload => cb(payload.new))
      .subscribe();
  }
}