import { Component, OnInit } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { QRCodeComponent } from 'angularx-qrcode';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-listado-mesas',
  templateUrl: './listado-mesas.page.html',
  styleUrls: ['./listado-mesas.page.scss'],
  standalone: true,
  imports: [QRCodeComponent, IonicModule, CommonModule]
})
export class ListadoMesasPage implements OnInit {
  mesas: any[] = [];
  cargando = true;

  async ngOnInit() {
    this.cargando = true;
    const { data, error } = await supabase
      .from("mesas")
      .select("id, numero, capacidad, tipo, qr_contenido");

    if (error) {
      console.error("Error cargando mesas", error);
      this.mesas = [];
    } else {
      this.mesas = data || [];
    }

    this.cargando = false;
  }
}
