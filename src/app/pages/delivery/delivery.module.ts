import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DeliveryPageRoutingModule } from './delivery-routing.module';

import { DeliveryPage } from './delivery.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DeliveryPageRoutingModule,
    LoadingPage
  ],
  declarations: [DeliveryPage]
})
export class DeliveryPageModule {}
