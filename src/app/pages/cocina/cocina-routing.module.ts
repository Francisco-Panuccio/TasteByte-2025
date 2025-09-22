import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CocinaPage } from './cocina.page';

const routes: Routes = [
  {
    path: '',
    component: CocinaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CocinaPageRoutingModule {}
