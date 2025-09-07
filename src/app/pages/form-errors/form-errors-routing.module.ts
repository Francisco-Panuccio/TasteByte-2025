import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FormErrorsPage } from './form-errors.page';

const routes: Routes = [
  {
    path: '',
    component: FormErrorsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FormErrorsPageRoutingModule {}
