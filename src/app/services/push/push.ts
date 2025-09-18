import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Subject } from 'rxjs';
import { supabase } from 'src/supabase.client';
import { Pedidos } from '../pedidos/pedidos';

@Injectable({
  providedIn: 'root'
})
export class Push {
  private token: string | null = null;
  private pushSubject = new Subject<Record<string, any>>();
  readonly onPush$ = this.pushSubject.asObservable();
  private pedidos = inject(Pedidos);

  async init(userId?: string, role?: "mozo" | "cliente") {
    if (Capacitor.getPlatform() === 'web') return;

    // Permisos
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') return;

    // Registro
    await PushNotifications.register();

    // Token
    PushNotifications.addListener("registration", async (t: Token) => {
      this.token = t.value;
      await this.upsertToken(t.value, userId, role);
    });

    // Errores
    PushNotifications.addListener('registrationError', (err: any) => {
      console.error('Push registration error', err);
    });

    // Recibida en foreground
    PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
      this.pushSubject.next(n.data ?? {});
      console.log("[push][foreground]", n.data ?? {});
    });

    // Click
    PushNotifications.addListener("pushNotificationActionPerformed", (a: ActionPerformed) => {
      const data = a.notification?.data ?? {};
      this.pushSubject.next({ ...data, _action: "click" });
      console.log("[push][action]", data);
    });
  }

  getToken() { return this.token; }

  private async upsertToken(token: string, userId?: string, role?: "mozo" | "cliente") {
    const payload: any = {
      token,
      usuario_id: userId ?? null,
      plataforma: Capacitor.getPlatform()
    };
    if (role) payload.role = role;

    const { error } = await supabase
      .from("push_tokens")
      .upsert(payload, { onConflict: "token" });
    if (error) console.error("[push][upsertToken]", error);
  }

  async send(to: string | string[], title: string, body: string, data?: Record<string, any>) {
    const { error } = await supabase.functions.invoke("send-push", {
      body: { to, title, body, data }
    });
    if (error) throw error;
  }

  initMozoHandlers() {
    PushNotifications.addListener("pushNotificationActionPerformed", async (a: ActionPerformed) => {
      const act = a.actionId;
      const data = a.notification?.data as any;
      if (data?.tipo === "pedido" && data?.pedidoId) {
        if (act === "ACCEPT") {
          await this.pedidos.actualizarEstado(data.pedidoId, "aceptado");
          await this.pedidos.actualizarEstado(data.pedidoId, "derivado");
        }
        if (act === "REJECT") {
          await this.pedidos.actualizarEstado(data.pedidoId, "rechazado");
        }
      }
    });
  }
}