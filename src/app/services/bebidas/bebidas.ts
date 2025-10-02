import { Injectable } from "@angular/core";
import { supabase } from "../../../supabase.client";
import { Bebida } from "../../interfaces/bebida";

const BUCKET = "bebidas";

@Injectable({ providedIn: "root" })
export class Bebidas {
  private table = "bebidas";

  async list(): Promise<Bebida[]> {
    const { data, error } = await supabase.from(this.table).select("*").order("nombre", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: number): Promise<Bebida | null> {
    const { data, error } = await supabase.from(this.table).select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  }

  async existsByNombre(nombre: string): Promise<boolean> {
    const { data, error } = await supabase.from(this.table).select("id").ilike("nombre", nombre.trim()).limit(1);
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async create(payload: Bebida): Promise<Bebida> {
    const { data, error } = await supabase.from(this.table).insert(payload).select("*").single();
    if (error) throw error;
    return data as Bebida;
  }

  async update(id: number, patch: Partial<Bebida>): Promise<Bebida> {
    const { data, error } = await supabase.from(this.table).update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data as Bebida;
  }

  async remove(id: number): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq("id", id);
    if (error) throw error;
  }

  async uploadPhotoBlob(fileName: string, blob: Blob): Promise<string> {
    const filePath = `bebidas/${Date.now()}_${fileName}`;
    const { error } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
      contentType: blob.type,
      upsert: true
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  }
}