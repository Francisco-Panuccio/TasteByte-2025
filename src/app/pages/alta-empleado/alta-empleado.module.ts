import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AltaEmpleadoPageRoutingModule } from './alta-empleado-routing.module';

import { AltaEmpleadoPage } from './alta-empleado.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AltaEmpleadoPageRoutingModule,
    ReactiveFormsModule,
    LoadingPage
  ],
  declarations: [AltaEmpleadoPage]
})
export class AltaEmpleadoPageModule {}
