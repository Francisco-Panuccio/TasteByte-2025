import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ListadoDeliveryPage } from './listado-delivery.page';

const routes: Routes = [
  {
    path: '',
    component: ListadoDeliveryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ListadoDeliveryPageRoutingModule {}
