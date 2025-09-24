import { Component, OnInit } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { NavController } from "@ionic/angular";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { supabase } from "src/supabase.client";

@Component({
  selector: "app-pedido",
  templateUrl: "./pedido.page.html",
  styleUrls: ["./pedido.page.scss"],
  standalone: false
})
export class PedidoPage implements OnInit {
  pedidoId!: string;
  ped: any;
  loading: boolean = true;
  items: any[] = [];

  constructor(private ar: ActivatedRoute, private pedidos: Pedidos, private navCtrl: NavController) { }

  async ngOnInit() {
    this.pedidoId =
      this.ar.snapshot.paramMap.get("id") ??
      this.ar.snapshot.queryParamMap.get("id") ?? "";

    if (!this.pedidoId) {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;

      if (email) {
        const { ped, items } = await this.pedidos.getPedidoActualPorEmail(email);
        this.ped = ped;
        this.items = items;
        setTimeout(() => (this.loading = false), 2000);
        return;
      }

      this.loading = false;
      return;
    }

    const { ped, items } = await this.pedidos.getPedido(this.pedidoId);
    this.ped = ped;
    this.items = items;
    setTimeout(() => (this.loading = false), 2000);
  }

  volver() {
    this.navCtrl.back();
  }
}