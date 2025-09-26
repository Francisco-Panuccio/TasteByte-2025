import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { EncuestasPageRoutingModule } from './encuestas-routing.module';
import { EncuestasPage } from './encuestas.page';
import { LoadingPage } from "../loading/loading.page";
import { NgApexchartsModule } from "ng-apexcharts";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EncuestasPageRoutingModule,
    LoadingPage,
    NgApexchartsModule
],
  declarations: [EncuestasPage]
})
export class EncuestasPageModule {}
