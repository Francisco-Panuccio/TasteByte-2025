import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PedidosDeliveryPageRoutingModule } from './pedidos-delivery-routing.module';

import { PedidosDeliveryPage } from './pedidos-delivery.page';
import { LoadingPage } from '../loading/loading.page';
import { FacturaPage } from '../factura/factura.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PedidosDeliveryPageRoutingModule,
    LoadingPage,
    FacturaPage
  ],
  declarations: [PedidosDeliveryPage]
})
export class PedidosDeliveryPageModule {}
