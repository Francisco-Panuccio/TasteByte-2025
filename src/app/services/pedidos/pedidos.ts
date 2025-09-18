import { Injectable } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Pedido } from 'src/app/interfaces/pedido';
import { PedidoItem } from 'src/app/interfaces/pedido-item';
import { supabase } from 'src/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class Pedidos {
  private ch?: RealtimeChannel;

  async crearPedido(
    mesaId: number,
    clienteUid: string,
    items: PedidoItem[],
    total: number,
    etaMin: number
  ): Promise<string> {
    const { data: ped, error } = await supabase
      .from("pedidos")
      .insert({
        mesa_id: mesaId,
        cliente_uid: clienteUid,
        total,
        eta_minutos: etaMin,
        estado: "pendiente"
      })
      .select("id")
      .single();

    if (error) throw error;
    const pedidoId = ped.id as string;

    const rows = items.map((i) => ({
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

  async actualizarEstado(pedidoId: string, estado: Pedido["estado"]): Promise<void> {
    const { error } = await supabase.from("pedidos").update({ estado }).eq("id", pedidoId);
    if (error) throw error;
  }

  onEstadoPedido(pedidoId: string, cb: (estado: Pedido["estado"]) => void): void {
    this.ch?.unsubscribe();
    this.ch = supabase
      .channel("pedidos_estado_" + pedidoId)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: "id=eq." + pedidoId },
        (payload) => cb((payload.new as any).estado as Pedido["estado"])
      )
      .subscribe();
  }

  async getPedido(pedidoId: string): Promise<{ ped: any; items: any[] }> {
    const { data: ped, error } = await supabase.from("pedidos").select("*").eq("id", pedidoId).single();
    if (error) throw error;
    const { data: items, error: e2 } = await supabase.from("pedido_items").select("*").eq("pedido_id", pedidoId);
    if (e2) throw e2;
    return { ped, items: items ?? [] };
  }

  async listar(estado?: Pedido["estado"]) {
    const base = supabase.from("pedidos").select(
      "id, mesa_id, total, eta_minutos, estado, created_at, mesa:mesas!pedidos_mesa_id_fkey (numero)"
    ).order("created_at", { ascending: false });

    const { data, error } = estado ? await base.eq("estado", estado) : await base;
    if (error) throw error;
    return data;
  }

  subscribeCambios(cb: (p: any) => void) {
    return supabase
      .channel("pedidos_all")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" },
        (payload) => cb(payload.new))
      .subscribe();
  }
}
