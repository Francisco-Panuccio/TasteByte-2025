import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MesaOcupadaPageRoutingModule } from './mesa-ocupada-routing.module';

import { MesaOcupadaPage } from './mesa-ocupada.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MesaOcupadaPageRoutingModule,
    LoadingPage
  ],
  declarations: [MesaOcupadaPage]
})
export class MesaOcupadaPageModule {}
