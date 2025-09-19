import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ListadoMesasPageRoutingModule } from './listado-mesas-routing.module';
import { LoadingPage } from '../loading/loading.page';
import { QRCodeComponent } from 'angularx-qrcode';
import { ListadoMesasPage } from './listado-mesas.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ListadoMesasPageRoutingModule,
    LoadingPage,
    QRCodeComponent
  ],
    declarations: [ListadoMesasPage]
})
export class ListadoMesasPageModule {}
