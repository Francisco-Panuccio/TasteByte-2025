import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { Splash } from './splash.page';

const routes: Routes = [
  {
    path: '',
    component: Splash
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SplashPageRoutingModule {}
