import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EncuestasEsperaPage } from './encuestas-espera.page';

const routes: Routes = [
  {
    path: '',
    component: EncuestasEsperaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EncuestasEsperaPageRoutingModule {}
