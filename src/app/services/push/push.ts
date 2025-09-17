import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { supabase } from 'src/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class Push {
  private token: string | null = null;

  async init(userId?: string) {
    if (Capacitor.getPlatform() === 'web') return;

    // Permisos
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') return;

    // Registro
    await PushNotifications.register();

    // Token
    PushNotifications.addListener('registration', async (t: Token) => {
      this.token = t.value;
      await this.upsertToken(t.value, userId);
    });

    // Errores
    PushNotifications.addListener('registrationError', (err: any) => {
      console.error('Push registration error', err);
    });

    // Recibida en foreground
    PushNotifications.addListener('pushNotificationReceived', (n: PushNotificationSchema) => {
      // opcional: toast, vibración, etc.
      console.log('Notif recibida', n);
    });

    // Click
    PushNotifications.addListener('pushNotificationActionPerformed', (a: ActionPerformed) => {
      const data = a.notification?.data;
      // navegar según data
      console.log('Notif click', data);
    });
  }

  getToken() { return this.token; }

  private async upsertToken(token: string, userId?: string) {
    // Guardamos/actualizamos token en Supabase
    const { error } = await supabase
      .from('push_tokens')
      .upsert({
        token,
        usuario_id: userId ?? null,
        plataforma: Capacitor.getPlatform()
      }, { onConflict: 'token' });
    if (error) console.error(error);
  }

  // Enviar por Edge Function (uno o muchos tokens)
  async send(to: string | string[], title: string, body: string, data?: Record<string, any>) {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { to, title, body, data }
    });
    if (error) throw error;
  }
}
