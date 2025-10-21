import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PedidosMozoPageRoutingModule } from './pedidos-mozo-routing.module';

import { PedidosMozoPage } from './pedidos-mozo.page';
import { LoadingPage } from '../loading/loading.page';
import { FacturaPage } from '../factura/factura.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PedidosMozoPageRoutingModule,
    LoadingPage,
    FacturaPage
  ],
  declarations: [PedidosMozoPage]
})
export class PedidosMozoPageModule {}
