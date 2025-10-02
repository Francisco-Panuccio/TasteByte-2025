import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { JuegosPage } from './juegos.page';

const routes: Routes = [
  {
    path: '',
    component: JuegosPage
  },  {
    path: 'juego10',
    loadChildren: () => import('./juego10/juego10.module').then( m => m.Juego10PageModule)
  },
  {
    path: 'juego15',
    loadChildren: () => import('./juego15/juego15.module').then( m => m.Juego15PageModule)
  },
  {
    path: 'juego20',
    loadChildren: () => import('./juego20/juego20.module').then( m => m.Juego20PageModule)
  }

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class JuegosPageRoutingModule {}
