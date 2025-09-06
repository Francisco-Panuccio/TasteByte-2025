import { Injectable } from '@angular/core';
import { supabase } from '../../supabase.client';
import { Mesa } from '../interfaces/mesa';

@Injectable({
  providedIn: 'root'
})
export class Mesas {
  private table = 'mesas'

  async list(): Promise<Mesa[]> {
    const { data, error } = await supabase.from(this.table).select('*').order('numero', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async getById(id: number): Promise<Mesa | null> {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single()
    if (error && error.code !== 'PGRST116') throw error
    return data ?? null
  }

  async create(payload: Mesa): Promise<Mesa> {
    const { data, error } = await supabase.from(this.table).insert(payload).select('*').single()
    if (error) throw error
    return data as Mesa
  }

  async update(id: number, patch: Partial<Mesa>): Promise<Mesa> {
    const { data, error } = await supabase.from(this.table).update(patch).eq('id', id).select('*').single()
    if (error) throw error
    return data as Mesa
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq('id', id)
    if (error) throw error
  }
}
