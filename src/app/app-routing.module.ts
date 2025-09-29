import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'home',
    loadChildren: () => import('./pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'alta-mesa',
    loadChildren: () => import('./pages/alta-mesa/alta-mesa.module').then(m => m.AltaMesaPageModule)
  },
  {
    path: 'alta-plato',
    loadChildren: () => import('./pages/alta-plato/alta-plato.module').then(m => m.AltaPlatoPageModule)
  },
  {
    path: 'loading',
    loadChildren: () => import('./pages/loading/loading.module').then(m => m.LoadingPageModule)
  },
  {
    path: 'alta-bebida',
    loadChildren: () => import('./pages/alta-bebida/alta-bebida.module').then(m => m.AltaBebidaPageModule)
  },
  {
    path: 'alta-cliente',
    loadChildren: () => import('./pages/alta-cliente/alta-cliente.module').then(m => m.AltaClientePageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'register',

    loadChildren: () => import('./pages/register/register.module').then(m => m.RegisterPageModule)
  },
  {
    path: 'alta-empleado',
    loadChildren: () => import('./pages/alta-empleado/alta-empleado.module').then(m => m.AltaEmpleadoPageModule)
  },
  {
    path: 'encuestas-espera',
    loadChildren: () => import('./pages/encuestas-espera/encuestas-espera.module').then(m => m.EncuestasEsperaPageModule)
  },
  {
    path: 'lista-espera',
    loadChildren: () => import('./pages/lista-espera/lista-espera.module').then(m => m.ListaEsperaPageModule)
  },
  {
    path: 'mesa-ocupada',
    loadChildren: () => import('./pages/mesa-ocupada/mesa-ocupada.module').then(m => m.MesaOcupadaPageModule)
  },
  {
    path: 'listado-clientes',
    loadChildren: () => import('./pages/listado-clientes/listado-clientes.module').then(m => m.ListadoClientesPageModule)
  },
  {
    path: 'pedido/:id',
    loadChildren: () => import('./pages/pedido/pedido.module').then(m => m.PedidoPageModule)
  },
  {
    path: 'pedido',
    loadChildren: () => import('./pages/pedido/pedido.module').then(m => m.PedidoPageModule)
  },
  {
    path: 'pedidos-mozo',
    loadChildren: () => import('./pages/pedidos-mozo/pedidos-mozo.module').then(m => m.PedidosMozoPageModule)
  },
  {
    path: 'listado-mesas',
    loadChildren: () => import('./pages/listado-mesas/listado-mesas.module').then(m => m.ListadoMesasPageModule)
  },
  {
    path: 'anon-register',
    loadChildren: () => import('./pages/anon-register/anon-register.module').then( m => m.AnonRegisterPageModule)
  },
  {
    path: 'cocina',
    loadChildren: () => import('./pages/cocina/cocina.module').then( m => m.CocinaPageModule)
  },
  {
    path: 'bar',
    loadChildren: () => import('./pages/bar/bar.module').then( m => m.BarPageModule)
  },
  {
    path: 'encuestas',
    loadChildren: () => import('./pages/encuestas/encuestas.module').then( m => m.EncuestasPageModule)
  },
  {
    path: 'encuesta-nueva',
    loadChildren: () => import('./pages/encuesta-nueva/encuesta-nueva.module').then( m => m.EncuestaNuevaPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
