import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ReservasClientePage } from './reservas-cliente.page';

const routes: Routes = [
  {
    path: '',
    component: ReservasClientePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReservasClientePageRoutingModule {}
