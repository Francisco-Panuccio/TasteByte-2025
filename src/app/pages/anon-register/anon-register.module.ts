import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AnonRegisterPageRoutingModule } from './anon-register-routing.module';

import { AnonRegisterPage } from './anon-register.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AnonRegisterPageRoutingModule
  ],
  declarations: [AnonRegisterPage]
})
export class AnonRegisterPageModule {}
