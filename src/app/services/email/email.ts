import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class Email {
  async notifyRegistroPendiente(to: string, nombres: string): Promise<void> {
    const { error } = await supabase.functions.invoke("send-email", {
      body: {
        to,
        subject: "Registro Recibido",
        template: "registro_pendiente",
        vars: { nombres }
      }
    })
    if (error) throw error
  }
}
