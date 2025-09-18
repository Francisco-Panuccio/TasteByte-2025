import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MesaOcupadaPage } from './mesa-ocupada.page';

const routes: Routes = [
  {
    path: '',
    component: MesaOcupadaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MesaOcupadaPageRoutingModule {}
