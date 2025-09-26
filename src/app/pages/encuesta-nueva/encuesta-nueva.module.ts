import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { EncuestaNuevaPageRoutingModule } from './encuesta-nueva-routing.module';

import { EncuestaNuevaPage } from './encuesta-nueva.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EncuestaNuevaPageRoutingModule,
    LoadingPage
  ],
  declarations: [EncuestaNuevaPage]
})
export class EncuestaNuevaPageModule {}
