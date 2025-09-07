import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FormErrorsPageRoutingModule } from './form-errors-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FormErrorsPageRoutingModule
  ],
})
export class FormErrorsPageModule {}
