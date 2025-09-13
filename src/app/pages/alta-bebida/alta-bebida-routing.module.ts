import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AltaBebidaPage } from './alta-bebida.page';

const routes: Routes = [
  {
    path: '',
    component: AltaBebidaPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AltaBebidaPageRoutingModule {}
