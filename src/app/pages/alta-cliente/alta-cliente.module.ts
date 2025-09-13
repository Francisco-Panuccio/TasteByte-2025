import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AltaClientePageRoutingModule } from './alta-cliente-routing.module';

import { AltaClientePage } from './alta-cliente.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';
import { LoadingPage } from '../loading/loading.page';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FormErrorsPage,
    ReactiveFormsModule,
    AltaClientePageRoutingModule,
    LoadingPage
  ],
  declarations: [AltaClientePage]
})
export class AltaClientePageModule {}
