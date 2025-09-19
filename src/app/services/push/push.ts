import { inject, Injectable } from "@angular/core";
import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  Token,
  ActionPerformed,
  PushNotificationSchema
} from "@capacitor/push-notifications";
import { Subject } from "rxjs";
import { supabase } from "src/supabase.client";
import { Pedidos } from "src/app/services/pedidos/pedidos";

type Role = "mozo" | "cliente";

@Injectable({ providedIn: "root" })
export class Push {
  private token: string | null = null;
  private initialized = false;
  private mozoHandlersInit = false;

  private readyResolve!: () => void;
  private readyPromise: Promise<void> = new Promise<void>(res => (this.readyResolve = res));
  ready(): Promise<void> { return this.readyPromise; }
  private resolveReadyOnce() { try { this.readyResolve?.(); } catch {} }

  private pushSubject = new Subject<Record<string, any>>();
  readonly onPush$ = this.pushSubject.asObservable();
  private pedidos = inject(Pedidos);

  async init(userId?: string, role?: Role): Promise<void> {
    if (Capacitor.getPlatform() === "web") { this.resolveReadyOnce(); return; }

    if (this.initialized) {
      if (this.token) await this.upsertToken(this.token, userId, role);
      this.resolveReadyOnce();
      return;
    }

    await this.ensureChannel();

    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== "granted") { this.resolveReadyOnce(); return; }

    await PushNotifications.register();

    PushNotifications.addListener("registration", async (t: Token) => {
      this.token = t.value;
      await this.upsertToken(t.value, userId, role);
      this.resolveReadyOnce();
    });

    PushNotifications.addListener("registrationError", () => {
      this.resolveReadyOnce();
    });

    PushNotifications.addListener("pushNotificationReceived", (n: PushNotificationSchema) => {
      this.pushSubject.next(n.data ?? {});
    });

    PushNotifications.addListener("pushNotificationActionPerformed", (a: ActionPerformed) => {
      const data = a.notification?.data ?? {};
      this.pushSubject.next({ ...data, _action: "click" });
    });

    this.initialized = true;
  }

  getToken(): string | null {
    return this.token;
  }

  private async ensureChannel(): Promise<void> {
    try {
      await PushNotifications.createChannel({
        id: "orders",
        name: "Pedidos",
        description: "Alertas de nuevos pedidos",
        importance: 5,
        visibility: 1,
        sound: "default"
      });
    } catch {}
  }

  private async upsertToken(token: string, userId?: string, role?: Role): Promise<void> {
    const payload: any = {
      token,
      usuario_id: userId ?? null,
      plataforma: Capacitor.getPlatform(),
      role: role ?? null,
      active: true,
      revoked: false
    };
    const { error } = await supabase.from("push_tokens").upsert(payload, { onConflict: "token" });
    if (error) console.error("[push][upsertToken]", error);
  }

  async send(
    to: string | string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    actions?: Array<{ id: string; title: string }>
  ): Promise<void> {
    const payload: any = { to, title, body, data };
    if (actions?.length) payload.actions = actions;
    try {
      const { data: resp, error } = await supabase.functions.invoke("send-push", { body: payload });
      if (error) { console.error("[push][edge][invoke-error]", error); return; }
      if (!resp?.ok) console.warn("[push][edge][not-ok]", resp);
    } catch (e) {
      console.error("[push][edge][exception]", e);
    }
  }

  async sendToTopic(
    topic: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    actions?: Array<{ id: string; title: string }>
  ): Promise<void> {
    const payload: any = { topic, title, body, data };
    if (actions?.length) payload.actions = actions;
    try {
      const { data: resp, error } = await supabase.functions.invoke("send-push", { body: payload });
      if (error) { console.error("[push][edge][invoke-error]", error); return; }
      if (!resp?.ok) console.warn("[push][edge][not-ok]", resp);
    } catch (e) {
      console.error("[push][edge][exception]", e);
    }
  }

  initMozoHandlers(): void {
    if (this.mozoHandlersInit) return;
    this.mozoHandlersInit = true;

    PushNotifications.addListener("pushNotificationActionPerformed", async (a: ActionPerformed) => {
      const act = a.actionId;
      const data = (a.notification?.data ?? {}) as any;
      if (data?.tipo === "pedido" && data?.pedidoId) {
        try {
          if (act === "ACCEPT") await this.pedidos.actualizarEstado(data.pedidoId, "aceptado");
          if (act === "REJECT") await this.pedidos.actualizarEstado(data.pedidoId, "rechazado");
        } catch (e) {
          console.error("[push][mozoAction][error]", e);
        }
      }
    });
  }
}
