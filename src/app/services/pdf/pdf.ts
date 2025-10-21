import { Injectable } from "@angular/core";
import html2pdf from "html2pdf.js";

@Injectable({ providedIn: "root" })
export class Pdf {
  async exportarA4(element: HTMLElement, filename: string): Promise<Blob> {
    const opt = {
      margin: 10,
      pagebreak: { mode: ["css"] },
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    } as const;

    const worker = html2pdf().set(opt).from(element).toPdf();
    const pdf: any = await worker.get("pdf");
    const total: number = pdf.internal.getNumberOfPages();

    const isBlankPage = (p: number): boolean => {
      const ops = pdf.internal?.pages?.[p];
      if (!Array.isArray(ops)) return false;
      const meaningful = ops.reduce((n: number, op: any) => {
        if (typeof op !== "string") return n;
        const s = op.replace(/\s+/g, "");
        if (!s) return n;
        if (s === "q" || s === "Q" || s === "BT" || s === "ET") return n;
        return n + 1;
      }, 0);
      return meaningful <= 2;
    };

    if (total >= 1 && isBlankPage(total)) {
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