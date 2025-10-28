import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ListadoDeliveryPageRoutingModule } from './listado-delivery-routing.module';

import { ListadoDeliveryPage } from './listado-delivery.page';
import { LoadingPage } from '../loading/loading.page';
import { FacturaPage } from '../factura/factura.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ListadoDeliveryPageRoutingModule,
    LoadingPage
  ],
  declarations: [ListadoDeliveryPage]
})
export class ListadoDeliveryPageModule {}
