import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Pedidos } from 'src/app/services/pedidos/pedidos';

@Component({
  selector: 'app-pedido',
  templateUrl: './pedido.page.html',
  styleUrls: ['./pedido.page.scss'],
  standalone: false
})
export class PedidoPage implements OnInit {
  pedidoId!: string;
  ped: any;
  items: any[] = [];

  constructor(private ar: ActivatedRoute, private pedidos: Pedidos) { }

  async ngOnInit() {
    this.pedidoId = this.ar.snapshot.paramMap.get("id")!;
    const { ped, items } = await this.pedidos.getPedido(this.pedidoId);
    this.ped = ped;
    this.items = items;
  }
}
