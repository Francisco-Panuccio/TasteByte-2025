import { Injectable } from '@angular/core';
import { supabase } from '../../../supabase.client';
import { Usuario } from '../../interfaces/usuario';
import { User } from 'src/app/classes/user';

@Injectable({
  providedIn: 'root'
})
export class Usuarios {
  private table = "usuarios";

  async list(): Promise<Usuario[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .order('apellidos', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getByAuthUser(): Promise<Usuario | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;

    const email = data.user?.email;
    if (!email) return null;

    return this.getByEmail(email);
  }

  async getById(id: number): Promise<Usuario | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("id", id)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  }

  async getByEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select("*")
      .eq("correo_electronico", email)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const { count, error } = await supabase
      .from(this.table)
      .select("id", { count: "exact", head: true })
      .eq("correo_electronico", email);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async existsByDni(dni: number): Promise<boolean> {
    const { count, error } = await supabase
      .from(this.table)
      .select("id", { count: "exact", head: true })
      .eq("numero_documento", dni);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async existsByCuil(cuil: number): Promise<boolean> {
    const { count, error } = await supabase
      .from(this.table)
      .select("id", { count: "exact", head: true })
      .eq("numero_cuil", cuil);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

 async createFromUser(user: User, fotoUrl: string | null = null): Promise<Usuario> {
  const row: Usuario = {
    apellidos: user.apellido,
    nombres: user.nombre,
    numero_documento: user.dni ?? null,
    correo_electronico: user.email,
    perfil: user.perfil,
    numero_cuil: user.cuil ?? null,
    foto_url: fotoUrl,          
    dni_qr_payload: null,
    dni_qr_leido_en: null
  } as Usuario;

  const { data, error } = await supabase
    .from(this.table)
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  const { error: errCliente } = await supabase.from("clientes").insert({
    usuario_id: data.id,
    tipo: "cliente_registrado",   // 🔹 ENUM correcto
    estado: "activo"
  });


  if (errCliente) throw errCliente;

  return data as Usuario;
}


  async update(id: number, patch: Partial<Usuario>): Promise<Usuario> {
    const { data, error } = await supabase
      .from(this.table)
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Usuario;
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq("id", id);
    if (error) throw error;
  }
}
