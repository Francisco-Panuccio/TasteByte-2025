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

  try {

    const { data: mesas, error: errMesas } = await supabase
      .from("mesas")
      .select("id, numero, capacidad, tipo, qr_contenido")
      .order("numero", { ascending: true });

    if (errMesas || !mesas) {
      console.error("Error cargando mesas:", errMesas);
      this.mesas = [];
      this.loading = false;
      return;
    }

    const { data: asignadas, error: errAsignadas } = await supabase
      .from("asignaciones_mesa")
      .select("mesa_id, estado")
      .in("estado", ["pendiente", "asignada", "sentado"]);

    const mesasAsignadasIds = (asignadas || [])
      .map((a) => a.mesa_id)
      .filter((id: number) => !!id);

    const { data: lista, error: errLista } = await supabase
      .from("lista_espera")
      .select("mesa_id")
      .not("estado", "in", ["finalizado", "cancelado"]);

    const mesasListaIds = (lista || [])
      .map((l) => l.mesa_id)
      .filter((id: number) => !!id);

    const { data: reservas, error: errReservas } = await supabase
      .from("reservas")
      .select("mesa_id, fecha_hora")
      .eq("estado", "confirmada")
      .not("mesa_id", "is", null);

    if (errReservas) console.error("Error cargando reservas confirmadas:", errReservas);

    const ahora = new Date();
    const limite = new Date(ahora.getTime() + 45 * 60 * 1000);

    const mesasReservadasIds = (reservas ?? [])
      .filter((r) => {
        const fecha = new Date(r.fecha_hora);
        return fecha >= ahora && fecha <= limite;
      })
      .map((r) => r.mesa_id);

    const mesasBloqueadas = [
      ...new Set([
        ...mesasAsignadasIds,
        ...mesasListaIds,
        ...mesasReservadasIds,
      ]),
    ];

    this.mesas = (mesas || []).filter((m) => !mesasBloqueadas.includes(m.id));

  } catch (err) {
    console.error("Error general al cargar mesas:", err);
    this.mesas = [];
  } finally {
    setTimeout(() => (this.loading = false), 2000);
  }
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
