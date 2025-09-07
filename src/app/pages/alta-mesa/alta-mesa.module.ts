import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AltaMesaPageRoutingModule } from './alta-mesa-routing.module';

import { AltaMesaPage } from './alta-mesa.page';
import { LoadingPage } from '../loading/loading.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AltaMesaPageRoutingModule,
    LoadingPage,
    FormsModule,
    ReactiveFormsModule,
    FormErrorsPage
  ],
  declarations: [AltaMesaPage]
})
export class AltaMesaPageModule {}
