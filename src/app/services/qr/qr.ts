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

  
  async procesarQrCliente(qr: string, clienteId?: number, anonimoId?: string) {

  if (qr.startsWith("INGRESO")) {
    const { data: existente } = await supabase
      .from("lista_espera")
      .select("id, estado")
      .eq(clienteId ? "cliente_id" : "cliente_anonimo_id", clienteId ?? anonimoId)
      .maybeSingle();

    return {
      permiso: true,
      yaRegistrado: Boolean(existente)
    };
  }

  if (qr.startsWith("mesa:")) {
    const partes = qr.split(":");
    if (partes.length < 3) {
      return { error: "QR de Mesa inválido." };
    }

    const mesaId = Number(partes[1]);
    const mesaNumero = partes[2];

    const { data: espera } = await supabase
      .from("lista_espera")
      .select("estado, mesa_id")
      .eq(clienteId ? "cliente_id" : "cliente_anonimo_id", clienteId ?? anonimoId)
      .maybeSingle();

    if (espera) {
      if (espera.estado === "pendiente")
        return { error: "El maître debe aprobar su ingreso antes de ocupar la mesa." };
      if (espera.estado === "aprobado" && espera.mesa_id === mesaId)
        return { permiso: true, mesaAsignada: mesaId, numero: mesaNumero };
      if (espera.estado === "aprobado" && espera.mesa_id !== mesaId)
        return { error: "No tiene permiso para ocupar esta mesa. El maître debe asignársela." };
    }

    const { data: asignacion } = await supabase
      .from("asignaciones_mesa")
      .select("mesa_id, estado")
      .eq(clienteId ? "cliente_id" : "cliente_anonimo_id", clienteId ?? anonimoId)
      .eq("estado", "asignada")
      .maybeSingle();

    if (asignacion) {
      if (asignacion.mesa_id === mesaId) {
        return { permiso: true, mesaAsignada: mesaId, numero: mesaNumero };
      } else {
        return { error: "No tiene permiso para ocupar esta mesa. El maître le asignó otra." };
      }
    }

    // 3️⃣ Si no figura en ningún lado, no puede ingresar
    return { error: "Debe registrarse en lista de espera antes de ocupar una mesa." };
  }

  return { error: "QR desconocido" };
}

}
