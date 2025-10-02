import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { Usuario } from 'src/app/interfaces/usuario';
import { ClienteRegistrado } from 'src/app/interfaces/cliente';

@Injectable({ providedIn: 'root' })
export class Clientes {
  private table = 'clientes';

  async listTodos(): Promise<(ClienteRegistrado & { usuario: Usuario })[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*, usuarios(*)')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((item: any) => ({ ...item, usuario: item.usuarios }));
  }

  async listPendientes(): Promise<(ClienteRegistrado & { usuario: Usuario })[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*, usuarios!inner(*)')
      .eq('estado', 'pendiente')
      .eq('tipo', 'cliente_registrado')
      .eq('usuarios.perfil', 'cliente_registrado')
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((item: any) => ({ ...item, usuario: item.usuarios }));
  }

  async aprobar(usuarioId: string): Promise<ClienteRegistrado> {
    const { data, error } = await supabase
      .from(this.table)
      .update({ estado: 'activo' })
      .eq('usuario_id', usuarioId)
      .eq('tipo', 'cliente_registrado')
      .select('*')
      .single();
    if (error) throw error;
    return data as ClienteRegistrado;
  }

  async rechazar(usuarioId: string): Promise<ClienteRegistrado> {
    const { data, error } = await supabase
      .from(this.table)
      .update({ estado: 'rechazado' })
      .eq('usuario_id', usuarioId)
      .eq('tipo', 'cliente_registrado')
      .select('*')
      .single();
    if (error) throw error;
    return data as ClienteRegistrado;
  }
}