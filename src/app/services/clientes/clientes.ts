import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { Usuario } from 'src/app/interfaces/usuario';
import { ClienteRegistrado } from 'src/app/interfaces/cliente';

@Injectable({
  providedIn: 'root'
})
export class Clientes {
  private table = 'clientes';

  //  Traer todos los clientes con datos de usuario
  async listTodos(): Promise<(ClienteRegistrado & { usuario: Usuario })[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select(`*, usuarios(*)`)
      .order('id', { ascending: true });

    if (error) throw error;
    return data as any[];
  }

  //  Traer solo clientes pendientes
  async listPendientes(): Promise<(ClienteRegistrado & { usuario: Usuario })[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select(`*, usuarios(*)`)
      .eq('estado', 'pendiente')
      .order('id', { ascending: true });

    if (error) throw error;
      return data.map(item => ({
      ...item,
      usuario: item.usuarios // Renombra 'usuarios' a 'usuario'
      })) as (ClienteRegistrado & { usuario: Usuario })[];
  }

  //  Aprobar cliente
  async aprobar(usuarioId: string): Promise<ClienteRegistrado> {
    const { data, error } = await supabase
      .from(this.table)
      .update({ estado: 'activo' })
      .eq('usuario_id', usuarioId)
      .select('*')
      .single();

    if (error) throw error;
    return data as ClienteRegistrado;
  }

  //  Rechazar cliente
  async rechazar(usuarioId: string): Promise<ClienteRegistrado> {
    const { data, error } = await supabase
      .from(this.table)
      .update({ estado: 'rechazado' })
      .eq('usuario_id', usuarioId)
      .select('*')
      .single();

    if (error) throw error;
    return data as ClienteRegistrado;
  }

}
