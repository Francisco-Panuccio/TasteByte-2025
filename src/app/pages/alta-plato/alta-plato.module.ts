import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AltaPlatoPageRoutingModule } from './alta-plato-routing.module';

import { AltaPlatoPage } from './alta-plato.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';
import { LoadingPage } from "../loading/loading.page";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AltaPlatoPageRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    FormErrorsPage,
    LoadingPage
],
  declarations: [AltaPlatoPage]
})
export class AltaPlatoPageModule {}
