import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class Descuentos {
  private storageKey = 'descuento_aplicado';

  constructor(private toast: ToastController) { }

  async aplicarDescuento(
    clienteId: number | null,
    userId: string | null,
    mesaId: number,
    porc: number,
    juego: string
  ) {
    try {
      if (!userId) {
        await this.mostrarToast('No se puede aplicar descuento sin userId');
        return { ok: false, reason: 'NO_USER' };
      }

      const { data: intentoPrevio, error: intentoError } = await supabase
        .from('intentos_juegos')
        .select('id')
        .eq('cliente_uid', userId)
        .maybeSingle();

      if (intentoError) {
        await this.mostrarToast(`Error verificando intentos: ${intentoError.message}`);
        return { ok: false, reason: 'DB_ERROR', error: intentoError.message };
      }

      if (intentoPrevio) {
        await this.mostrarToast('Ha jugado anteriormente, no puede obtener otro descuento');
        return { ok: false, reason: 'ALREADY_PLAYED' };
      }

      const { data: pedido, error: pedError } = await supabase
        .from('pedidos')
        .select('id, total, estado, mesa_id, cliente_uid')
        .eq('mesa_id', mesaId)
        .eq('cliente_uid', userId)
        .in('estado', ['aceptado', 'recibido'])
        .maybeSingle();

      if (pedError) {
        await this.mostrarToast(`Error consultando pedido: ${pedError.message}`);
        return { ok: false, reason: 'DB_ERROR', error: pedError.message };
      }

      if (!pedido) {
        await this.mostrarToast(`No se encontró pedido aceptado en Mesa ${mesaId}`);
        return { ok: false, reason: 'NO_PEDIDO' };
      }

      const { data: existente } = await supabase
        .from('descuentos')
        .select('id')
        .eq('pedido_id', pedido.id)
        .maybeSingle();

      if (existente) {
        await this.mostrarToast('Ya existe un descuento para este pedido');
        return { ok: false, reason: 'DUPLICATE' };
      }

      const payload: any = {
        pedido_id: pedido.id,
        porcentaje: porc,
        aplicado_en: new Date().toISOString(),
      };
      if (clienteId) payload.cliente_id = clienteId;

      const { error: insError } = await supabase.from('descuentos').insert(payload);

      if (insError) {
        await this.mostrarToast(`Error guardando descuento: ${insError.message}`);
        return { ok: false, reason: 'INSERT_ERROR', error: insError.message };
      }

      const { error: intentoInsError } = await supabase.from('intentos_juegos').insert({
        cliente_uid: userId,
        juego: juego,
        intento_en: new Date().toISOString(),
        obtuvo_descuento: true,
      });

      if (intentoInsError) {
        await this.mostrarToast(`Error registrando intento: ${intentoInsError.message}`);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(payload));
      await this.mostrarToast(`✅ Descuento del ${porc}% aplicado al pedido de la Mesa ${mesaId}`);
      return { ok: true };
    } catch (err: any) {
      await this.mostrarToast(`Error aplicarDescuento: ${err.message ?? err}`);
      return { ok: false, reason: 'EXCEPTION', error: err };
    }
  }

  async registrarIntento(userId: string, juego: string, obtuvoDescuento: boolean) {
    await supabase.from('intentos_juegos').insert({
      cliente_uid: userId,
      juego: juego,
      intento_en: new Date().toISOString(),
      obtuvo_descuento: obtuvoDescuento
    });
  }
  
  getDescuentoPendiente(): { porcentaje: number } | null {
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : null;
  }

  limpiarDescuento() {
    localStorage.removeItem(this.storageKey);
  }

  private async mostrarToast(mensaje: string) {
    const t = await this.toast.create({
      message: mensaje,
      duration: 1500,
      cssClass: "toast",
      position: 'top'
    });
    await t.present();
  }
}
