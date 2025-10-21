import { Injectable } from '@angular/core';
import html2pdf from "html2pdf.js";

@Injectable({ providedIn: 'root' })
export class Pdf {
  async exportarA4(element: HTMLElement, filename: string): Promise<Blob> {
    const opt = {
      margin: 10,
      pagebreak: { mode: ['css', 'legacy'] },
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    } as const;

    const worker = html2pdf().set(opt).from(element).toPdf();
    const pdf: any = await worker.get('pdf');
    const total = pdf.internal.getNumberOfPages();
    const last = pdf.internal.pages?.[total];

    if (!last || (typeof last === 'string' && last.trim().length <= 1)) {
      pdf.deletePage(total);
    }

    const blob: Blob = await worker.output("blob");
    return blob;
  }

  async blobToBase64(b: Blob): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error);
      fr.onload = () => res((fr.result as string).split(",")[1] || "");
      fr.readAsDataURL(b);
    });
  }
}