import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { EncuestasEsperaPageRoutingModule } from './encuestas-espera-routing.module';
import { EncuestasEsperaPage } from './encuestas-espera.page';
import { QRCodeComponent } from 'angularx-qrcode';
import { LoadingPage } from '../loading/loading.page';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EncuestasEsperaPageRoutingModule,
    LoadingPage,
    QRCodeComponent
  ],


  declarations: [EncuestasEsperaPage]

})
export class EncuestasEsperaPageModule {}
