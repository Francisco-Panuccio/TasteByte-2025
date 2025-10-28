import { inject, Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  Token,
  ActionPerformed,
  PushNotificationSchema,
} from '@capacitor/push-notifications';
import {
  LocalNotificationActionPerformed,
  LocalNotifications,
} from '@capacitor/local-notifications';
import { Subject } from 'rxjs';
import { supabase } from 'src/supabase.client';
import { Pedidos } from 'src/app/services/pedidos/pedidos';

type Role =
  | 'mozo'
  | 'cliente'
  | 'dueño'
  | 'supervisor'
  | 'maitre'
  | 'delivery'
  | 'cocinero'
  | 'bartender';

@Injectable({ providedIn: 'root' })
export class Push {
  private token: string | null = null;
  private initialized = false;
  private mozoHandlersInit = false;
  private mozoRealtimeSub: any = null;
  private lastPedidoIdNotificado: string | null = null;
  private mozoChannel: any = null;

  private readyResolve!: () => void;
  private readyPromise: Promise<void> = new Promise<void>(
    (res) => (this.readyResolve = res)
  );
  ready(): Promise<void> {
    return this.readyPromise;
  }
  private resolveReadyOnce() {
    try {
      this.readyResolve?.();
    } catch {}
  }

  private pushSubject = new Subject<Record<string, any>>();
  readonly onPush$ = this.pushSubject.asObservable();
  private pedidos = inject(Pedidos);

  private normRole(r?: Role | string | null): string | null {
    if (!r) return null;
    return String(r)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  async init(usuarioRowId?: number | null, role?: Role): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      this.resolveReadyOnce();
      return;
    }

    if (this.initialized) {
      if (this.token)
        await this.upsertToken(this.token, usuarioRowId ?? null, role);
      this.resolveReadyOnce();
      return;
    }

    await this.ensureChannels();
    await LocalNotifications.requestPermissions();
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      this.resolveReadyOnce();
      return;
    }
    await PushNotifications.register();

    PushNotifications.addListener('registration', async (t: Token) => {
      this.token = t.value;
      await this.upsertToken(t.value, usuarioRowId ?? null, role);
      this.resolveReadyOnce();
    });
    PushNotifications.addListener('registrationError', () => {
      this.resolveReadyOnce();
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      async (n: PushNotificationSchema) => {
        const data = n.data ?? {};
        this.pushSubject.next(data);
        const title = n.title || (data.title as string) || 'Notificación';
        const body = n.body || (data.body as string) || '';
        const id = Math.floor(Date.now() % 2147483647);
        await LocalNotifications.schedule({
          notifications: [
            {
              id,
              title,
              body,
              channelId: 'orders',
              sound: 'default',
              extra: data,
              smallIcon: 'ic_stat_orders',
              largeIcon: 'ic_launcher',
            },
          ],
        });
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (a: ActionPerformed) => {
        const data = a.notification?.data ?? {};
        this.pushSubject.next({ ...data, _action: 'click' });

        if (data?.tipo === 'factura' && data?.url) {
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: data.url });
            console.log('📂 Abriendo factura desde push:', data.url);
          } catch (err) {
            console.error('❌ Error al abrir factura:', err);
          }
        }
      }
    );

    LocalNotifications.addListener(
      'localNotificationActionPerformed',
      async (a: LocalNotificationActionPerformed) => {
        const data = a.notification?.extra ?? {};
        if (data?.tipo === 'factura' && data?.url) {
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: data.url });
            console.log(
              '📂 Abriendo factura desde notificación local:',
              data.url
            );
          } catch (err) {
            console.error('❌ Error al abrir factura local:', err);
          }
        }
      }
    );

    if (role === 'mozo' && !this.mozoRealtimeSub) {
      console.log('🧠 Subscribiendo a eventos Realtime de pedidos_listos...');
      this.mozoRealtimeSub = this.listenPedidosListosMozo(async (data: any) => {
        const pedidoId = String(data.pedido_id || data.pedidoId || '');
        if (!pedidoId || pedidoId === this.lastPedidoIdNotificado) return;
        this.lastPedidoIdNotificado = pedidoId;

        console.log('📦 Pedido listo recibido (Realtime activo):', data);

        console.log('🔔 Ejecutando sendLocal() para mostrar notificación...');

        await this.sendLocal(
          'Pedido listo para entregar',
          data.mensaje || 'Un pedido está listo para ser entregado'
        );

        if (window.location.href.includes('/pedidos-mozo')) {
          window.dispatchEvent(new CustomEvent('refrescarPedidosMozo'));
        }
      });
    }

    this.initialized = true;
  }

  getToken(): string | null {
    return this.token;
  }

  private async ensureChannels(): Promise<void> {
    try {
      await PushNotifications.createChannel({
        id: 'orders',
        name: 'Pedidos',
        description: 'Notificaciones de pedidos listos',
        importance: 5,
        visibility: 1,
        sound: 'default',
      });
      console.log("📡 Canal 'orders' creado o ya existente.");
    } catch (err) {
      console.warn('⚠️ No se pudo crear canal push:', err);
    }

    try {
      await LocalNotifications.createChannel({
        id: 'orders',
        name: 'Pedidos',
        description: 'Notificaciones de pedidos listos',
        importance: 5,
        sound: 'default',
        visibility: 1,
      });
      console.log("📡 Canal LocalNotifications 'orders' creado.");
    } catch (err) {
      console.warn('⚠️ No se pudo crear canal local:', err);
    }
  }

  private async upsertToken(
    token: string,
    usuarioRowId: number | null,
    role?: Role
  ): Promise<void> {
    const payload: any = {
      token,
      usuario_id: typeof usuarioRowId === 'number' ? usuarioRowId : null,
      plataforma: Capacitor.getPlatform(),
      role: this.normRole(role),
      active: true,
      revoked: false,
    };
    const { error } = await supabase
      .from('push_tokens')
      .upsert(payload, { onConflict: 'token' });
    if (error) console.error('[push][upsertToken]', error, payload);
  }

  async send(
    to: string | string[],
    title: string,
    body: string,
    data?: Record<string, any>,
    actions?: Array<{ id: string; title: string }>
  ): Promise<void> {
    const payload: any = { to, title: title || 'Notificación', body, data };
    if (actions?.length) payload.actions = actions;
    try {
      const { data: resp, error } = await supabase.functions.invoke(
        'send-push',
        { body: payload }
      );
      if (error) {
        console.error('[push][edge][invoke-error]', error);
        return;
      }
      if (!resp?.ok) console.warn('[push][edge][not-ok]', resp);
    } catch (e) {
      console.error('[push][edge][exception]', e);
    }
  }

  async sendToRoles(
    roles: Array<Role | string>,
    title: string,
    body: string,
    data?: Record<string, any>,
    actions?: Array<{ id: string; title: string }>
  ): Promise<void> {
    const normRoles = roles.map((r) => this.normRole(r)!).filter(Boolean);
    const { data: rows, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('role', normRoles as string[])
      .eq('active', true)
      .eq('revoked', false);
    if (error) {
      console.error('[push][tokensByRole]', error);
      return;
    }
    const tokens = (rows ?? [])
      .map((r: any) => r.token as string)
      .filter(Boolean);
    if (!tokens.length) {
      console.warn('[push][tokensByRole] sin tokens');
      return;
    }
    await this.send(tokens, title, body, data, actions);
  }

  async sendToMaitre(
    title: string,
    body: string,
    data?: Record<string, any>,
    actions?: Array<{ id: string; title: string }>
  ) {
    return this.sendToRoles(['maitre'], title, body, data, actions);
  }
  async sendToCocina(title: string, body: string, data?: Record<string, any>) {
    return this.sendToRoles(['cocinero'], title, body, data);
  }
  async sendToBar(title: string, body: string, data?: Record<string, any>) {
    return this.sendToRoles(['bartender'], title, body, data);
  }

  initMozoHandlers(): void {
    if (this.mozoHandlersInit) return;
    this.mozoHandlersInit = true;
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (a: ActionPerformed) => {
        const act = a.actionId;
        const data = (a.notification?.data ?? {}) as any;
        if (data?.tipo === 'pedido' && data?.pedidoId) {
          try {
            if (act === 'ACCEPT')
              await this.pedidos.actualizarEstado(data.pedidoId, 'aceptado');
            if (act === 'REJECT')
              await this.pedidos.actualizarEstado(data.pedidoId, 'rechazado');
          } catch (e) {
            console.error('[push][mozoAction][error]', e);
          }
        }
      }
    );
  }

  async sendLocal(title: string, body: string) {
    try {
      await this.ready();
      console.log('📱 Disparando notificación local:', title, body);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now(),
            title,
            body,
            channelId: 'orders',
            sound: 'default',
            smallIcon: 'ic_stat_orders',
            largeIcon: 'ic_launcher',
          },
        ],
      });
    } catch (err) {
      console.error('❌ Error en sendLocal:', err);
    }
  }

  listenPedidosListosMozo(cb: (data: any) => void) {
    console.log('👂 Escuchando inserts en push_eventos...');

    return supabase
      .channel('push_eventos_global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'push_eventos' },
        (payload: any) => {
          const nuevo: Record<string, any> = payload.new;
          console.log('📦 Realtime global: insert recibido →', nuevo);

          if (nuevo && nuevo['tipo'] === 'pedido_listo') {
            cb(nuevo);
          }
        }
      )
      .subscribe((status: any) => {
        console.log('📡 Estado del canal push_eventos:', status);
      });
  }

  async testNotificacionLocal() {
    console.log('📣 Testeando notificación local...');
    await LocalNotifications.requestPermissions();
    await this.ensureChannels();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title: '🔔 Test Manual',
          body: 'Esto es una notificación de prueba',
          channelId: 'orders',
          sound: 'default',
        },
      ],
    });
  }
}
