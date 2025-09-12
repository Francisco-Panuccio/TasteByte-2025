import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AltaBebidaPageRoutingModule } from './alta-bebida-routing.module';

import { AltaBebidaPage } from './alta-bebida.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AltaBebidaPageRoutingModule,
    ReactiveFormsModule,
    FormErrorsPage,
    LoadingPage
  ],
  declarations: [AltaBebidaPage]
})
export class AltaBebidaPageModule {}
