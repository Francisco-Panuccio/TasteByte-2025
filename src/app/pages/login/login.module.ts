import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginPageRoutingModule } from './login-routing.module';

import { LoginPage } from './login.page';
import { FormErrorsPage } from '../form-errors/form-errors.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FormErrorsPage,
    ReactiveFormsModule,
    LoginPageRoutingModule,
    LoadingPage
  ],
  declarations: [LoginPage]
})
export class LoginPageModule {}
