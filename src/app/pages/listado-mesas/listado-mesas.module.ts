import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ListadoMesasPageRoutingModule } from './listado-mesas-routing.module';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ListadoMesasPageRoutingModule
  ]
})
export class ListadoMesasPageModule {}
