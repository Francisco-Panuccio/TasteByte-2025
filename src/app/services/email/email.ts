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

  async enviarFacturaAdjunta(
    to: string,
    payload: {
      receptor: { nombreCompleto: string; cuitOdni: string; };
      items: Array<{ descripcion: string; cantidad: number; precioUnit: number; subtotal: number; }>;
      total: number;
      filename: string;
      pdfBase64: string;
      subject?: string;
      title?: string;
      kind?: string;
    }
  ): Promise<void> {
    const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const filas = payload.items.map(it => `
      <tr>
        <td style="padding:6px;border-bottom:1px solid #ddd;">${it.descripcion}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${fmt.format(it.cantidad)}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${fmt.format(it.precioUnit)}</td>
        <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${fmt.format(it.subtotal)}</td>
      </tr>
    `).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;">
        <p>Hola ${payload.receptor.nombreCompleto},</p>
        <p>Adjuntamos su factura en el siguiente PDF.</p>
        <h3 style="margin-top:18px;">Resumen</h3>
        <p><b>CUIT/DNI:</b> ${payload.receptor.cuitOdni}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px;border-bottom:2px solid #000;">Producto/Servicio</th>
              <th style="text-align:right;padding:6px;border-bottom:2px solid #000;">Cantidad</th>
              <th style="text-align:right;padding:6px;border-bottom:2px solid #000;">Precio Unit.</th>
              <th style="text-align:right;padding:6px;border-bottom:2px solid #000;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        <p style="text-align:right;margin-top:10px;font-size:16px;"><b>Total: $ ${fmt.format(payload.total)}</b></p>
      </div>
    `;

    const clean = payload.pdfBase64.replace(/^data:application\/pdf;base64,?/i, "");
    const data: Record<string, unknown> = {
      subject: payload.subject ?? `Factura para ${payload.receptor.nombreCompleto}`,
      title: payload.title ?? "Factura",
      mensajeHtml: html,
      attachments: [
        { filename: payload.filename, content: clean, contentType: "application/pdf" }
      ]
    };

    return this.enviar(payload.kind ?? "Factura", to, data);
  }

  enviarFacturaDescarga(to: string, payload: Parameters<Email["enviarFacturaAdjunta"]>[1]) {
    return this.enviarFacturaAdjunta(to, payload);
  }
}