import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ToastController, AlertController } from "@ionic/angular";
import { supabase } from "src/supabase.client";

@Component({
  selector: "app-bar",
  templateUrl: "./bar.page.html",
  styleUrls: ["./bar.page.scss"],
  standalone: false
})
export class BarPage implements OnInit, OnDestroy {
  private toast = inject(ToastController);
  private alertCtrl = inject(AlertController);

  pedidos: Array<{
    id: string;
    pedido_id: string;
    mesa_id: number;
    mesa_numero: number;
    creado_en: string;
    estado: "pendiente" | "terminado";
    items: any[];
    total: number;
    cantidad: number;
  }> = [];

  private channel?: ReturnType<typeof supabase.channel>;
  loading: boolean = true;

  async ngOnInit() {
    await this.cargar();

    this.channel = supabase
      .channel("bar_pedidos_changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "bar_pedidos"
      }, () => {
        this.cargar();
      })
      .subscribe();

    setTimeout(() => (this.loading = false), 500);
  }

  ngOnDestroy() {
    try {
      this.channel && supabase.removeChannel(this.channel);
    } catch { }
  }

  async cargar() {
    try {
      const { data, error } = await supabase
        .from("bar_pedidos")
        .select("*")
        .eq("estado", "pendiente")
        .order("creado_en", { ascending: false });

      if (error) throw error;

      this.pedidos = (data ?? []) as any[];

    } catch (error) {
      console.error('Error cargando pedidos:', error);
      this.mostrarError('Error al cargar los pedidos');
    }
  }

  async terminar(id: string) {
    try {
      const pedido = this.pedidos.find(p => p.id === id);

      const alert = await this.alertCtrl.create({
        header: 'Confirmar',
        message: `¿Marcar como terminado el pedido de la Mesa ${pedido?.mesa_numero}?`,
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel'
          },
          {
            text: 'Terminar',
            handler: async () => {
              await this.finalizarPedido(id);
            }
          }
        ]
      });

      await alert.present();

    } catch (error) {
      console.error('Error al terminar pedido:', error);
      this.mostrarError('Error al terminar el pedido');
    }
  }

  private async finalizarPedido(id: string) {
    const { error } = await supabase
      .from("bar_pedidos")
      .update({
        estado: "terminado",
        terminado_en: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;

    this.cargar();
    this.mostrarExito('Pedido marcado como terminado');
  }

  // Método para formatear solo la hora
  formatearHora(fecha: string): string {
    return new Date(fecha).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private async mostrarError(mensaje: string) {
    const toast = await this.toast.create({
      message: mensaje,
      duration: 3000,
      color: 'danger',
      position: 'top'
    });
    toast.present();
  }

  private async mostrarExito(mensaje: string) {
    const toast = await this.toast.create({
      message: mensaje,
      duration: 2000,
      cssClass: 'toast',
      position: 'top'
    });
    toast.present();
  }
}