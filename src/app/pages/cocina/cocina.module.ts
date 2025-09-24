import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CocinaPageRoutingModule } from './cocina-routing.module';

import { CocinaPage } from './cocina.page';
import { LoadingPage } from '../loading/loading.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CocinaPageRoutingModule,
    LoadingPage
  ],
  declarations: [CocinaPage]
})
export class CocinaPageModule {}
