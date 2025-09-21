import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AnonRegisterPage } from './anon-register.page';

const routes: Routes = [
  {
    path: '',
    component: AnonRegisterPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnonRegisterPageRoutingModule {}
