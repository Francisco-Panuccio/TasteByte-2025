import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ToastController, AlertController } from "@ionic/angular";
import { supabase } from "src/supabase.client";
import { Push } from "src/app/services/push/push";

@Component({
  selector: "app-cocina",
  templateUrl: "./cocina.page.html",
  styleUrls: ["./cocina.page.scss"],
  standalone: false
})
export class CocinaPage implements OnInit, OnDestroy {
  private toast = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private push = inject(Push);

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
      .channel("cocina_pedidos_changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "cocina_pedidos"
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
        .from("cocina_pedidos")
        .select("*")
        .eq("estado", "pendiente")
        .order("creado_en", { ascending: false });

      if (error) throw error;

      this.pedidos = (data ?? []) as any[];

    } catch (error) {
      this.mostrarToast('Error al cargar los pedidos');
    }
  }

  async terminar(id: string) {
    try {
      const pedido = this.pedidos.find(p => p.id === id);

      const alert = await this.alertCtrl.create({
        cssClass: "alert-cocina",
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
      this.mostrarToast('Error al terminar el pedido');
    }
  }

  private async finalizarPedido(id: string) {
    try {
      const pedido = this.pedidos.find(p => p.id === id);
      if (!pedido) {
        this.mostrarToast('No se encontró el pedido.');
        return;
      }

      const { error: updateError } = await supabase
        .from("cocina_pedidos")
        .update({
          estado: "terminado",
          terminado_en: new Date().toISOString()
        })
        .eq("id", id);

      if (updateError) throw updateError;

      console.log("🍽️ Pedido de COCINA marcado como terminado.");

      const { data: completo, error: checkError } = await supabase.rpc(
        "check_pedido_completo",
        { p_pedido_id: pedido.pedido_id }
      );

      if (checkError) {
        console.error("❌ Error al verificar si el pedido está completo:", checkError);
      } else if (completo === true) {
        console.log("✅ Pedido completamente listo (todos los sectores terminaron).");

        const { error: insertError } = await supabase
          .from("push_eventos")
          .insert({
            tipo: "pedido_listo",
            pedido_id: pedido.pedido_id,
            mesa_id: pedido.mesa_id,
            mensaje: `El pedido de la mesa ${pedido.mesa_numero} está listo ✅`
          });

        if (insertError) {
          console.error("❌ Error insertando push_eventos:", insertError);
        } else {
          console.log("✅ Evento push_eventos insertado correctamente.");
        }

        try {
          await this.push.sendToRoles(
            ['mozo'],
            'Pedido completo ✅',
            `El pedido de la mesa ${pedido.mesa_numero} está listo para entregar.`,
            {
              tipo: 'pedido_listo',
              pedidoId: pedido.pedido_id,
              mesaId: pedido.mesa_id
            }
          );
          console.log("📤 Push enviada al mozo (pedido completo).");
        } catch (pushError) {
          console.error("❌ Error enviando push al mozo:", pushError);
        }
      } else {
        console.log("⏳ Pedido aún no completo: falta otro sector (Cocina o Bar).");
      }

      this.cargar();
      this.mostrarToast('Pedido marcado como terminado');

    } catch (error) {
      console.error(error);
      this.mostrarToast('Error al marcar el pedido como terminado');
    }
  }

  formatearHora(fecha: string): string {
    return new Date(fecha).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private async mostrarToast(mensaje: string) {
    const toast = await this.toast.create({
      message: mensaje,
      duration: 1500,
      cssClass: 'toast',
      position: 'top'
    });
    toast.present();
  }
}
