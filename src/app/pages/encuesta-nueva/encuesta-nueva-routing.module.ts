import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { EncuestaNuevaPage } from './encuesta-nueva.page';

const routes: Routes = [
  {
    path: '',
    component: EncuestaNuevaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EncuestaNuevaPageRoutingModule {}
