import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class Email {
  private readonly fnUrl = "https://uvjesmdiovtkdgxobvhs.supabase.co/functions/v1/send-email";

  private async call(body: Record<string, unknown>): Promise<void> {
    const r = await fetch(this.fnUrl, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body)
    });
    const text = await r.text();
    if (!r.ok) {
      throw new Error(`[${r.status}] ${text}`);
    }
  }

  async enviar(kind: string, to: string, data: Record<string, unknown>): Promise<void> {
    await this.call({ route: "send-template", to, kind, data });
  }

  enviarEmailPersonalizado(kind: string, to: string, subject: string, mensajeHtml: string, title = "Mensaje"): Promise<void> {
    return this.enviar(kind, to, { subject, mensajeHtml, title });
  }
}