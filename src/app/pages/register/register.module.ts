import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { RegisterPageRoutingModule } from './register-routing.module';

import { RegisterPage } from './register.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormErrorsPage,
    IonicModule,
    RegisterPageRoutingModule,
    LoadingPage
  ],
  declarations: [RegisterPage]
})
export class RegisterPageModule {}
