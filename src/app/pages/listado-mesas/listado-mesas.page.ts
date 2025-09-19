import { Component, OnInit } from '@angular/core';
import { supabase } from 'src/supabase.client';

@Component({
  selector: 'app-listado-mesas',
  templateUrl: './listado-mesas.page.html',
  styleUrls: ['./listado-mesas.page.scss'],
  standalone: false,
})
export class ListadoMesasPage implements OnInit {
  mesas: any[] = [];
  loading = true;

  async ngOnInit() {
    this.loading = true;
    const { data, error } = await supabase
      .from("mesas")
      .select("id, numero, capacidad, tipo, qr_contenido");

    if (error) {
      console.error("Error cargando mesas", error);
      this.mesas = [];
    } else {
      this.mesas = data || [];
    }

    setTimeout(() => this.loading = false, 2000);
  }
}
