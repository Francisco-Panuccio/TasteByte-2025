import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then( m => m.HomePageModule)
  },
  {
    path: 'alta-mesa',
    loadChildren: () => import('./pages/alta-mesa/alta-mesa.module').then( m => m.AltaMesaPageModule)
  },
  {
    path: 'alta-plato',
    loadChildren: () => import('./pages/alta-plato/alta-plato.module').then( m => m.AltaPlatoPageModule)
  },
  {
    path: 'loading',
    loadChildren: () => import('./pages/loading/loading.module').then( m => m.LoadingPageModule)
  },
  {
    path: 'alta-bebida',
    loadChildren: () => import('./pages/alta-bebida/alta-bebida.module').then( m => m.AltaBebidaPageModule)
  },
  {
    path: 'alta-cliente',
    loadChildren: () => import('./pages/alta-cliente/alta-cliente.module').then( m => m.AltaClientePageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'register',
    loadChildren: () => import('./pages/register/register.module').then( m => m.RegisterPageModule)
  },
  {
    path: 'alta-empleado',
    loadChildren: () => import('./pages/alta-empleado/alta-empleado.module').then( m => m.AltaEmpleadoPageModule)
  },  {
    path: 'encuestas-espera',
    loadChildren: () => import('./pages/encuestas-espera/encuestas-espera.module').then( m => m.EncuestasEsperaPageModule)
  },
  {
    path: 'lista-espera',
    loadChildren: () => import('./pages/lista-espera/lista-espera.module').then( m => m.ListaEsperaPageModule)
  },
  {
    path: 'listado-mesas',
    loadChildren: () => import('./pages/listado-mesas/listado-mesas.module').then( m => m.ListadoMesasPageModule)
  }



];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
