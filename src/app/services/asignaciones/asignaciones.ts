import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';

type EstadoAsignacion = 'pendiente' | 'asignada' | 'sentado' | 'liberada' | 'cancelada';

@Injectable({ providedIn: 'root' })
export class AsignacionesMesaService {
  private table = 'asignaciones_mesa';

  // Maitre asigna
  async asignarMesa(params: { mesaId: number; clienteId?: number; clienteAnonimoId?: string; estado?: EstadoAsignacion }) {
    const payload: any = {
      mesa_id: params.mesaId,
      estado: params.estado ?? 'asignada'
    };
    if (params.clienteId) payload.cliente_id = params.clienteId;
    if (params.clienteAnonimoId) payload.cliente_anonimo_id = params.clienteAnonimoId;

    const { data, error } = await supabase.from(this.table).insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  // Obtener la asignación activa de este cliente
  async getActivaPorCliente(params: { clienteId?: number; clienteAnonimoId?: string }) {
    let q = supabase
      .from(this.table)
      .select('id, mesa_id, estado')
      .in('estado', ['pendiente', 'asignada', 'sentado'])
      .order('asignada_en', { ascending: false })
      .limit(1);

    if (params.clienteId) q = q.eq('cliente_id', params.clienteId);
    if (params.clienteAnonimoId) q = q.eq('cliente_anonimo_id', params.clienteAnonimoId);

    const { data, error } = await q.maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data; // puede ser null
  }

  // Realtime: avisar cuando cambie mi asignación
  subscribeMiAsignacion(params: { clienteId?: number; clienteAnonimoId?: string }, cb: (payload: any) => void) {
    const filter = params.clienteId
      ? `cliente_id=eq.${params.clienteId}`
      : `cliente_anonimo_id=eq.${params.clienteAnonimoId}`;

    const channel = supabase
      .channel('asignaciones_mesa_' + (params.clienteId ?? params.clienteAnonimoId))
      .on('postgres_changes', { event: '*', schema: 'public', table: this.table, filter }, cb)
      .subscribe();

    return channel;
  }

  // Validar acceso al QR (mesa)
  async puedeAcceder(mesaId: number, params: { clienteId?: number; clienteAnonimoId?: string }) {
    let q = supabase
      .from(this.table)
      .select('id')
      .eq('mesa_id', mesaId)
      .in('estado', ['pendiente', 'asignada', 'sentado'])
      .limit(1);

    if (params.clienteId) q = q.eq('cliente_id', params.clienteId);
    if (params.clienteAnonimoId) q = q.eq('cliente_anonimo_id', params.clienteAnonimoId);

    const { data, error } = await q;
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }
}
