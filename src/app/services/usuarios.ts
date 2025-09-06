import { Injectable } from '@angular/core';
import { supabase } from '../../supabase.client';
import { Usuario } from '../interfaces/usuario';

@Injectable({
  providedIn: 'root'
})
export class Usuarios {
  private table = 'usuarios'

  async list(): Promise<Usuario[]> {
    const { data, error } = await supabase.from(this.table).select('*').order('apellidos', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async getById(id: string): Promise<Usuario | null> {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single()
    if (error && error.code !== 'PGRST116') throw error
    return data ?? null
  }

  async create(payload: Usuario): Promise<Usuario> {
    const { data, error } = await supabase.from(this.table).insert(payload).select('*').single()
    if (error) throw error
    return data as Usuario
  }

  async update(id: string, patch: Partial<Usuario>): Promise<Usuario> {
    const { data, error } = await supabase.from(this.table).update(patch).eq('id', id).select('*').single()
    if (error) throw error
    return data as Usuario
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq('id', id)
    if (error) throw error
  }
}
