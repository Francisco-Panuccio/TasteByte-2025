import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { EncuestasEsperaPageRoutingModule } from './encuestas-espera-routing.module';
import { LoadingPage } from '../loading/loading.page';
import { EncuestasEsperaPage } from './encuestas-espera.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EncuestasEsperaPageRoutingModule,
    LoadingPage
  ],
  declarations: [EncuestasEsperaPage]
})
export class EncuestasEsperaPageModule {}
