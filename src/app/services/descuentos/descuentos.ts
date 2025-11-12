import { Injectable } from "@angular/core";
import { supabase } from "src/supabase.client";
import { ToastController } from "@ionic/angular";

@Injectable({ providedIn: "root" })
export class Descuentos {
  private storageKey = "descuento_aplicado";

  constructor(private toast: ToastController) { }

  async aplicarDescuento(
    clienteId: number | null,
    userId: string | null,
    mesaId: number | null | undefined,
    porc: number,
    juego: string
  ) {
    try {
      if (!userId) {
        await this.mostrarToast("No se puede aplicar descuento sin userId");
        return { ok: false, reason: "NO_USER" };
      }

      const { data: intentoPrevio, error: intentoError } = await supabase
        .from("intentos_juegos")
        .select("id")
        .eq("cliente_uid", userId)
        .maybeSingle();
      if (intentoError) {
        await this.mostrarToast(`Error verificando intentos: ${intentoError.message}`);
        return { ok: false, reason: "DB_ERROR", error: intentoError.message };
      }
      if (intentoPrevio) {
        await this.mostrarToast("Ha jugado anteriormente, no puede obtener otro descuento");
        return { ok: false, reason: "ALREADY_PLAYED" };
      }

      const isDelivery = mesaId == null || mesaId <= 0 || Number.isNaN(mesaId as any);

      const estadosValidos = ["aceptado", "recibido", "terminado", "impagado"];
      let pedidoId: string | null = null;

      if (!isDelivery) {
        const { data, error } = await supabase
          .from("pedidos")
          .select("id")
          .eq("mesa_id", mesaId!)
          .eq("cliente_uid", userId)
          .in("estado", estadosValidos)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          await this.mostrarToast(`Error consultando pedido: ${error.message}`);
          return { ok: false, reason: "DB_ERROR", error: error.message };
        }
        pedidoId = data?.id ?? null;
      } else {
        const { data: au } = await supabase.auth.getUser();
        const email = au?.user?.email ?? null;

        let q = supabase
          .from("pedidos")
          .select("id")
          .eq("tipo", "delivery")
          .in("estado", estadosValidos)
          .order("created_at", { ascending: false })
          .limit(1) as any;

        if (userId && email) {
          q = q.or(`cliente_uid.eq.${userId},cliente_email.eq.${email}`);
        } else if (userId) {
          q = q.eq("cliente_uid", userId);
        } else if (email) {
          q = q.eq("cliente_email", email);
        } else {
          await this.mostrarToast("No se puede identificar al cliente para el reparto");
          return { ok: false, reason: "NO_IDENT" };
        }

        const { data, error } = await q;
        if (error) {
          await this.mostrarToast(`Error consultando pedido: ${error.message}`);
          return { ok: false, reason: "DB_ERROR", error: error.message };
        }
        pedidoId = (data?.[0]?.id as string) ?? null;
      }

      if (!pedidoId) {
        const destino = isDelivery ? "Delivery" : `Mesa ${mesaId}`;
        await this.mostrarToast(`No se encontró pedido válido (${destino})`);
        return { ok: false, reason: "NO_PEDIDO" };
      }

      const { data: existente } = await supabase
        .from("descuentos")
        .select("id")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (existente) {
        await this.mostrarToast("Ya existe un descuento para este pedido");
        return { ok: false, reason: "DUPLICATE" };
      }

      const payload: any = {
        pedido_id: pedidoId,
        porcentaje: porc,
        aplicado_en: new Date().toISOString()
      };
      if (clienteId) payload.cliente_id = clienteId;

      const { error: insError } = await supabase.from("descuentos").insert(payload);
      if (insError) {
        await this.mostrarToast(`Error guardando descuento: ${insError.message}`);
        return { ok: false, reason: "INSERT_ERROR", error: insError.message };
      }

      const { error: intentoInsError } = await supabase.from("intentos_juegos").insert({
        cliente_uid: userId,
        juego,
        intento_en: new Date().toISOString(),
        obtuvo_descuento: true
      });
      if (intentoInsError) {
        await this.mostrarToast(`Error registrando intento: ${intentoInsError.message}`);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(payload));
      const destinoOk = isDelivery ? "delivery" : `Mesa ${mesaId}`;
      await this.mostrarToast(`Descuento del ${porc}% aplicado al pedido (${destinoOk})`);
      return { ok: true };
    } catch (err: any) {
      await this.mostrarToast(`Error aplicarDescuento: ${err.message ?? err}`);
      return { ok: false, reason: "EXCEPTION", error: err };
    }
  }

  async registrarIntento(userId: string, juego: string, obtuvoDescuento: boolean) {
    await supabase.from("intentos_juegos").insert({
      cliente_uid: userId,
      juego,
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
      position: "top"
    });
    await t.present();
  }
}