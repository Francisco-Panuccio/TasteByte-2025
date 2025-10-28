import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ReservasAdminPageRoutingModule } from './reservas-admin-routing.module';

import { ReservasAdminPage } from './reservas-admin.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReservasAdminPageRoutingModule
  ],
  declarations: [ReservasAdminPage]
})
export class ReservasAdminPageModule {}
