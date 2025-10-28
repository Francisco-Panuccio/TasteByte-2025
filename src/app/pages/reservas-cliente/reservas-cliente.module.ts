import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ReservasClientePageRoutingModule } from './reservas-cliente-routing.module';

import { ReservasClientePage } from './reservas-cliente.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReservasClientePageRoutingModule
  ],
  declarations: [ReservasClientePage]
})
export class ReservasClientePageModule {}
