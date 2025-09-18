import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PedidosMozoPage } from './pedidos-mozo.page';

const routes: Routes = [
  {
    path: '',
    component: PedidosMozoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PedidosMozoPageRoutingModule {}
