// encuesta-nueva.page.ts
import { Component, OnInit, inject } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { ToastController } from "@ionic/angular";
import { Encuestas } from "src/app/services/encuestas/encuestas";

type Calidad = "excelente" | "aceptable" | "regular" | "mala";
type Espera = "bajo" | "razonable" | "excesivo";

@Component({
  selector: "app-encuesta-nueva",
  templateUrl: "./encuesta-nueva.page.html",
  styleUrls: ["./encuesta-nueva.page.scss"],
  standalone: false
})
export class EncuestaNuevaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);
  private encuestas = inject(Encuestas);

  loading = true;
  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;

  calificacionGeneral: number | null = 5;
  calidadComida: Calidad | null = null;
  tiempoEspera: Espera | null = null;
  opinion: string | null = "";

  async ngOnInit() {
    const p = this.route.snapshot.queryParamMap;
    this.anonimoId = p.get("anonimoId") ?? undefined;
    this.usuarioId = p.get("usuarioId") ? Number(p.get("usuarioId")) : null;
    this.clienteId = p.get("clienteId") ? Number(p.get("clienteId")) : null;
    const puede = await this.encuestas.puedeRealizar();
    if (!puede) {
      const t = await this.toast.create({ message: "Aún no puedes realizar la encuesta.", duration: 2000, position: "top" });
      await t.present();
      this.volver();
      return;
    }
    setTimeout(() => (this.loading = false), 2000);
  }

  async enviar() {
    if (this.calificacionGeneral == null || !this.calidadComida || !this.tiempoEspera) return;
    await this.encuestas.enviarRespuesta({
      calificacion_general: this.calificacionGeneral,
      calidad_comida: this.calidadComida,
      tiempo_espera: this.tiempoEspera,
      opinion: this.opinion ?? null
    });
    const t = await this.toast.create({ message: "¡Gracias por tu encuesta!", duration: 2000, position: "top" });
    await t.present();
    this.volver();
  }

  volver() {
    this.router.navigate(["/encuestas"], { queryParams: { anonimoId: this.anonimoId, usuarioId: this.usuarioId, clienteId: this.clienteId } });
  }
}