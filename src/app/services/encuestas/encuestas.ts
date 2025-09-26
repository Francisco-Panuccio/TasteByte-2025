import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';

type Calidad = "excelente" | "aceptable" | "regular" | "mala";
type Espera = "bajo" | "razonable" | "excesivo";

@Injectable({
  providedIn: 'root'
})
export class Encuestas {
  async puedeRealizar(): Promise<boolean> {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id ?? null;
    const email = au.user?.email ?? null;
    let qPed = supabase.from("pedidos").select("id, estado, created_at").eq("estado", "terminado").order("created_at", { ascending: false }).limit(1);
    const ors: string[] = [];
    if (uid) ors.push(`cliente_uid.eq.${uid}`);
    if (email) ors.push(`cliente_email.eq.${email}`);
    if (ors.length) qPed = qPed.or(ors.join(","));
    const { data: ped } = await qPed.maybeSingle();
    if (!ped) return false;
    let qResp = supabase.from("encuestas_respuestas").select("creado_en").order("creado_en", { ascending: false }).limit(1);
    const orsR: string[] = [];
    if (uid) orsR.push(`cliente_uid.eq.${uid}`);
    if (email) orsR.push(`cliente_email.eq.${email}`);
    if (orsR.length) qResp = qResp.or(orsR.join(","));
    const { data: respUlt } = await qResp.maybeSingle();
    return !respUlt || new Date(respUlt.creado_en).getTime() < new Date(ped.created_at).getTime();
  }

  async enviarRespuesta(input: { calificacion_general: number; calidad_comida: Calidad; tiempo_espera: Espera; opinion?: string | null }): Promise<void> {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id ?? null;
    const email = au.user?.email ?? null;
    await supabase.from("encuestas_respuestas").insert({
      cliente_uid: uid,
      cliente_email: email,
      calificacion_general: input.calificacion_general,
      calidad_comida: input.calidad_comida,
      tiempo_espera: input.tiempo_espera,
      opinion: input.opinion ?? null,
      creado_en: new Date().toISOString()
    });
  }
}
