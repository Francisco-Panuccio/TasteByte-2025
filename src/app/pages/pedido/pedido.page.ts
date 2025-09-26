import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
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

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;

  constructor(private ar: ActivatedRoute, private pedidos: Pedidos, private router: Router) { }

  async ngOnInit() {
    this.pedidoId = this.ar.snapshot.paramMap.get("id") ?? this.ar.snapshot.queryParamMap.get("id") ?? "";
    const p = this.ar.snapshot.queryParamMap;
    this.anonimoId = p.get("anonimoId") ?? undefined;
    this.usuarioId = p.get("usuarioId") ? Number(p.get("usuarioId")) : null;
    this.clienteId = p.get("clienteId") ? Number(p.get("clienteId")) : null;

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
    const queryParams: any = {};
    if (this.anonimoId) queryParams.anonimoId = this.anonimoId;
    if (this.usuarioId !== null) queryParams.usuarioId = this.usuarioId;
    if (this.clienteId !== null) queryParams.clienteId = this.clienteId;
    this.router.navigate(["/encuestas-espera"], { queryParams });
  }
}
