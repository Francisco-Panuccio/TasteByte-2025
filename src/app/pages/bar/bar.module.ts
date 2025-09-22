import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { BarPageRoutingModule } from './bar-routing.module';

import { BarPage } from './bar.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    BarPageRoutingModule
  ],
  declarations: [BarPage]
})
export class BarPageModule {}
