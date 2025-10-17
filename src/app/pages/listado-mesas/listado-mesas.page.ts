import { Component, inject, OnInit } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { ModalController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-listado-mesas',
  templateUrl: './listado-mesas.page.html',
  styleUrls: ['./listado-mesas.page.scss'],
  standalone: false
})
export class ListadoMesasPage implements OnInit {
  mesas: any[] = [];
  loading = true;
  private toast = inject(ToastController);

  constructor(private modalCtrl: ModalController) { }

  async ngOnInit() {
    this.loading = true;

    const { data: mesas, error } = await supabase
      .from("mesas")
      .select("id, numero, capacidad, tipo, qr_contenido");

    if (error) {
      console.error("Error cargando mesas", error);
      this.mesas = [];
      return;
    }

    const { data: ocupadas, error: errOcupadas } = await supabase
      .from("lista_espera")
      .select("mesa_id")
      .not("estado", "eq", "finalizado");

    if (errOcupadas) {
      console.error("Error cargando mesas ocupadas", errOcupadas);
      this.mesas = mesas || [];
      return;
    }

    const mesasOcupadasIds = (ocupadas || []).map(o => o.mesa_id).filter((id: number) => !!id);
    this.mesas = (mesas || []).filter(m => !mesasOcupadasIds.includes(m.id));
    setTimeout(() => (this.loading = false), 2000);
  }

  private async mostrarToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 1500,
      cssClass: "toast",
      position: "top"
    });
    await t.present();
  }

  async seleccionarMesa(mesa: any) { 
    await this.mostrarToast("Mesa Asignada");
    this.modalCtrl.dismiss(mesa); 
  }

  cerrar() { this.modalCtrl.dismiss(null); }
}
