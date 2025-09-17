import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Bebida } from 'src/app/interfaces/bebida';
import { Mesa } from 'src/app/interfaces/mesa';
import { Plato } from 'src/app/interfaces/plato';
import { Bebidas } from 'src/app/services/bebidas/bebidas';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Platos } from 'src/app/services/platos/platos';

type Tab = "platos" | "bebidas" | "postres";

@Component({
  selector: 'app-mesa-ocupada',
  templateUrl: './mesa-ocupada.page.html',
  styleUrls: ['./mesa-ocupada.page.scss'],
  standalone: false
})
export class MesaOcupadaPage implements OnInit {
  private mesasSrv = inject(Mesas);
  private platosSrv = inject(Platos);
  private bebidasSrv = inject(Bebidas);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastController);

  error?: string;
  tab: Tab = "platos";
  mesaId?: number;
  mesa?: Mesa | null;
  platos: Plato[] = [];
  bebidas: Bebida[] = [];
  mesaAsignada: boolean = false;
  loading: boolean = true;

  constructor() { }

  async ngOnInit() {
    try {
      const qp = this.route.snapshot.queryParamMap.get("tableId");
      const pp = this.route.snapshot.paramMap.get("id");
      this.mesaId = qp ? Number(qp) : (pp ? Number(pp) : undefined);
      if (!this.mesaId || Number.isNaN(this.mesaId)) throw new Error("Mesa Inválida");

      this.mesa = await this.mesasSrv.getById(this.mesaId);
      if (!this.mesa) throw new Error("Mesa no encontrada");

      this.mesaAsignada = this.estaAsignada(this.mesa);

      [this.platos, this.bebidas] = await Promise.all([
        this.platosSrv.list(),
        this.bebidasSrv.list()
      ]);
    } catch (e: any) {
      this.error = e?.message || "Error cargando mesa";
      (await this.toast.create({ message: this.error, duration: 1500 })).present();
    } finally {
      setTimeout(() => this.loading = false, 2000);
    }
  }

  private estaAsignada(m: Mesa): boolean {
    const anyTrue =
      ((m as any).ocupada === true) ||
      ((m as any).asignada === true) ||
      ((m as any).activa === true) ||
      (typeof (m as any).estado === "string" && ["ocupada", "asignada", "activa"].includes((m as any).estado)) ||
      !!(m as any).cliente_id || !!(m as any).user_id;

    return !!anyTrue;
  }

  async abrirChat() {
    if (!this.mesaAsignada) {
      (await this.toast.create({ message: "Debés tener una mesa asignada", duration: 1200 })).present();
      return;
    }
    this.router.navigate(["/chat", this.mesaId]);
  }
}
