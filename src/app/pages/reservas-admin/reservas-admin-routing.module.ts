import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ReservasAdminPage } from './reservas-admin.page';

const routes: Routes = [
  {
    path: '',
    component: ReservasAdminPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReservasAdminPageRoutingModule {}
