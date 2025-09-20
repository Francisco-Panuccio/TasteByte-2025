import { Injectable } from '@angular/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { supabase } from 'src/supabase.client';

@Injectable({ providedIn: 'root' })
export class Qr {


  async getQrIngreso(): Promise<string> {
    const { data, error } = await supabase
      .from("qr_config")
      .select("contenido")
      .eq("tipo", "ingreso")
      .single();

    if (error) throw error;
    return data.contenido;
  }

  async getQrMesa(mesaId: number): Promise<string> {
    const { data, error } = await supabase
      .from("mesas")
      .select("qr_contenido")
      .eq("id", mesaId)
      .single();

    if (error) throw error;
    return data.qr_contenido;
  }

  async getAllMesasConQr(): Promise<any[]> {
    const { data, error } = await supabase
      .from("mesas")
      .select("id, numero, capacidad, tipo, qr_contenido");

    if (error) throw error;
    return data || [];
  }


  async scanQr(): Promise<string | null> {
    const result = await BarcodeScanner.scan({
      formats: [BarcodeFormat.QrCode]
    });
    if (!result.barcodes?.length) return null;
    return result.barcodes[0].displayValue || null;
  }

  async procesarQrCliente(qr: string, usuarioId?: string, anonimoId?: string) {

  if (qr.startsWith("INGRESO")) {

  const { data: existente } = await supabase
    .from("lista_espera")
    .select("id, estado")
    .eq(usuarioId ? "cliente_id" : "cliente_anonimo_id", usuarioId || anonimoId)
    .maybeSingle();

  return {
    permiso: true,
    yaRegistrado: Boolean(existente)
  };
}

  // QR de mesa en formato mesa:id:numero
  if (qr.startsWith("mesa:")) {
  const partes = qr.split(":");
  if (partes.length < 3) {
    return { error: "QR de mesa inválido." };
  }

  const mesaId = Number(partes[1]);
  const mesaNumero = partes[2];

  const { data: espera } = await supabase
    .from("lista_espera")
    .select("estado, mesa_id")
    .eq(usuarioId ? "cliente_id" : "cliente_anonimo_id", usuarioId || anonimoId)
    .maybeSingle();

  if (!espera) return { error: "Debes registrarte en lista de espera antes de ocupar una mesa." };
  if (espera.estado !== "aprobado") return { error: "El maître debe aprobar tu ingreso antes de ocupar la mesa." };
  if (espera.mesa_id !== mesaId) return { error: "No tenés permiso para ocupar esta mesa. El maître debe asignártela." };

  return { permiso: true, mesaAsignada: mesaId, numero: mesaNumero };
}


  return { error: "QR desconocido" };
}
}
