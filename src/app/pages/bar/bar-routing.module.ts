import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { BarPage } from './bar.page';

const routes: Routes = [
  {
    path: '',
    component: BarPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BarPageRoutingModule {}
