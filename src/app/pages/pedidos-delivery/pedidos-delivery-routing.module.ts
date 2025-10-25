import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PedidosDeliveryPage } from './pedidos-delivery.page';

const routes: Routes = [
  {
    path: '',
    component: PedidosDeliveryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PedidosDeliveryPageRoutingModule {}
