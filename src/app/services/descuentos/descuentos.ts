import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class Descuentos {
  private storageKey = 'descuento_aplicado';

  constructor(private toast: ToastController) {}

  /** Aplica un descuento al pedido actual del cliente (usa cliente_uid UUID) */
  async aplicarDescuento(
  clienteId: number | null,
  userId: string | null,
  mesaId: number,
  porc: number,
  juego: string   // 👈 nuevo parámetro
) {
  try {
    if (!userId) {
      await this.mostrarToast('⚠ No se puede aplicar descuento sin userId');
      return { ok: false, reason: 'NO_USER' };
    }

    // 1. Revisar si el usuario ya jugó algún juego (cualquiera)
    const { data: intentoPrevio, error: intentoError } = await supabase
      .from('intentos_juegos')
      .select('id')
      .eq('cliente_uid', userId)
      .maybeSingle();

    if (intentoError) {
      await this.mostrarToast(`❌ Error verificando intentos: ${intentoError.message}`);
      return { ok: false, reason: 'DB_ERROR', error: intentoError.message };
    }

    if (intentoPrevio) {
      await this.mostrarToast('⚠ Ya jugaste anteriormente, no podés obtener otro descuento');
      return { ok: false, reason: 'ALREADY_PLAYED' };
    }

    // 2. Buscar pedido activo (con cliente_uid)
    const { data: pedido, error: pedError } = await supabase
      .from('pedidos')
      .select('id, total, estado, mesa_id, cliente_uid')
      .eq('mesa_id', mesaId)
      .eq('cliente_uid', userId)
      .eq('estado', 'aceptado')
      .maybeSingle();

    if (pedError) {
      await this.mostrarToast(`❌ Error consultando pedido: ${pedError.message}`);
      return { ok: false, reason: 'DB_ERROR', error: pedError.message };
    }

    if (!pedido) {
      await this.mostrarToast(`⚠ No se encontró pedido aceptado en mesa ${mesaId} con uid ${userId}`);
      return { ok: false, reason: 'NO_PEDIDO' };
    }

    // 3. Verificar si ya existe descuento en este pedido
    const { data: existente } = await supabase
      .from('descuentos')
      .select('id')
      .eq('pedido_id', pedido.id)
      .maybeSingle();

    if (existente) {
      await this.mostrarToast('⚠ Ya existe un descuento para este pedido');
      return { ok: false, reason: 'DUPLICATE' };
    }

    // 4. Insertar descuento
    const payload: any = {
      pedido_id: pedido.id,
      porcentaje: porc,
      aplicado_en: new Date().toISOString(),
    };
    if (clienteId) payload.cliente_id = clienteId;

    const { error: insError } = await supabase.from('descuentos').insert(payload);

    if (insError) {
      await this.mostrarToast(`❌ Error guardando descuento: ${insError.message}`);
      return { ok: false, reason: 'INSERT_ERROR', error: insError.message };
    }

    // 5. Registrar intento (⚡ acá usamos el juego dinámico)
    const { error: intentoInsError } = await supabase.from('intentos_juegos').insert({
      cliente_uid: userId,
      juego: juego,
      intento_en: new Date().toISOString(),
      obtuvo_descuento: true,
    });

    if (intentoInsError) {
      await this.mostrarToast(`⚠ Error registrando intento: ${intentoInsError.message}`);
    }

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
    await this.mostrarToast(`✅ Descuento del ${porc}% aplicado al pedido ${pedido.id}`);
    return { ok: true };
  } catch (err: any) {
    await this.mostrarToast(`❌ Error aplicarDescuento: ${err.message ?? err}`);
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

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      position: 'top'
    });
    await t.present();
  }
}
