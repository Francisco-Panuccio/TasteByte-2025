import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AltaPlatoPage } from './alta-plato.page';

const routes: Routes = [
  {
    path: '',
    component: AltaPlatoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AltaPlatoPageRoutingModule {}
