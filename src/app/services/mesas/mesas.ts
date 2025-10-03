import { Injectable } from '@angular/core';
import { supabase } from '../../../supabase.client';
import { Mesa } from '../../interfaces/mesa';

@Injectable({
  providedIn: 'root'
})
export class Mesas {
  private table = 'mesas';

  async list(): Promise<Mesa[]> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .order('numero', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: number): Promise<Mesa | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ?? null;
  }

  async getByNumeroDeMesa(numero: number): Promise<Mesa | null> {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('numero', numero)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ?? null;
  }

  async existsByNumero(numero: number): Promise<boolean> {
    const { data, error } = await supabase
      .from(this.table)
      .select('id')
      .eq('numero', numero)
      .limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async create(payload: Mesa): Promise<Mesa> {
    const { data, error } = await supabase
      .from(this.table)
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return data as Mesa;
  }

  async update(id: number, patch: Partial<Mesa>): Promise<Mesa> {
    const { data, error } = await supabase
      .from(this.table)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as Mesa;
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq('id', id);
    if (error) throw error;
  }

  async uploadPhotoBlob(fileName: string, blob: Blob): Promise<string> {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) throw new Error('Sin sesión');
    const path = `${u.user.id}/${fileName}`;
    const { error: upErr } = await supabase.storage
      .from('mesas')
      .upload(path, blob, {
        contentType: blob.type || 'image/jpeg',
        upsert: true
      });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('mesas').getPublicUrl(path);
    return data.publicUrl;
  }

  async setQr(id: number, numero: number): Promise<boolean> {
    const contenido = `mesa:${id}:${numero}`;
    const { data, error } = await supabase
      .from(this.table)
      .update({
        qr_contenido: contenido,
        qr_generado_en: new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;
    return !!data;
  }

 async liberarMesa(mesaId: number): Promise<void> {
  console.log("🔓 Liberando mesa:", mesaId);

  const { error: errAsig } = await supabase
    .from("asignaciones_mesa")
    .delete()
    .eq("mesa_id", mesaId);
  if (errAsig) throw errAsig;

  const { error: errLista } = await supabase
    .from("lista_espera")
    .delete()
    .eq("mesa_id", mesaId);
  if (errLista) throw errLista;

  const { error: errPedidos } = await supabase
    .from("pedidos")
    .delete()
    .eq("mesa_id", mesaId);
  if (errPedidos) throw errPedidos;

  console.log("✅ Mesa liberada correctamente:", mesaId);
}






}
