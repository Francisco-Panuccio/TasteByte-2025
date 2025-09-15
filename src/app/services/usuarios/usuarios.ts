import { Injectable } from '@angular/core';
import { supabase } from '../../../supabase.client';
import { Usuario } from '../../interfaces/usuario';
import { User } from 'src/app/classes/user';

@Injectable({
  providedIn: 'root'
})
export class Usuarios {
  private table = 'usuarios'

  async list(): Promise<Usuario[]> {
    const { data, error } = await supabase.from(this.table).select('*').order('apellidos', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: number): Promise<Usuario | null> {
    const { data, error } = await supabase.from(this.table).select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  }

  async getByEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await supabase.from(this.table).select("*").eq("correo_electronico", email).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async create(payload: Usuario): Promise<Usuario> {
    const { data, error } = await supabase.from(this.table).insert(payload).select("*").single();
    if (error) throw error;
    return data as Usuario;
  }

  async createFromUser(user: User): Promise<Usuario> {
    const row: Usuario = {
      apellidos: user.apellido,
      nombres: user.nombre,
      numero_documento: user.dni ?? null,
      correo_electronico: user.email,
      perfil: user.perfil,
      numero_cuil: user.cuil ?? null,
      foto_url: null,
      dni_qr_payload: null,
      dni_qr_leido_en: null
    } as Usuario

    return await this.create(row)
  }

  async update(id: number, patch: Partial<Usuario>): Promise<Usuario> {
    const { data, error } = await supabase.from(this.table).update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Usuario;
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq("id", id);
    if (error) throw error;
  }
}
