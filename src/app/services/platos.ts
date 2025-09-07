import { Injectable } from '@angular/core';
import { supabase } from '../../supabase.client';
import { Plato } from '../interfaces/plato';

const BUCKET = 'platos';

@Injectable({
  providedIn: 'root'
})
export class Platos {
  private table = 'platos'

  async list(): Promise<Plato[]> {
    const { data, error } = await supabase.from(this.table).select('*').order('nombre', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async getById(id: number): Promise<Plato | null> {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single()
    if (error && error.code !== 'PGRST116') throw error
    return data ?? null
  }

  async existsByNombre(nombre: string): Promise<boolean> {
    const { data, error } = await supabase.from(this.table).select('id').ilike('nombre', nombre).limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async create(payload: Plato): Promise<Plato> {
    const { data, error } = await supabase.from(this.table).insert(payload).select('*').single()
    if (error) throw error
    return data as Plato
  }

  async update(id: number, patch: Partial<Plato>): Promise<Plato> {
    const { data, error } = await supabase.from(this.table).update(patch).eq('id', id).select('*').single()
    if (error) throw error
    return data as Plato
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq('id', id)
    if (error) throw error
  }

  async uploadPhotoBlob(fileName: string, blob: Blob): Promise<string> {
    const { error: upErr } = await supabase.storage.from('platos').upload(fileName, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true
    });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('platos').getPublicUrl(fileName);
    return data.publicUrl;
  }
}