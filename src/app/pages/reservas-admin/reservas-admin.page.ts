import { Component, OnInit, inject } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';
import { Email } from 'src/app/services/email/email';
import {
  ModalController,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { ListadoMesasPage } from '../listado-mesas/listado-mesas.page';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reservas-admin',
  templateUrl: './reservas-admin.page.html',
  styleUrls: ['./reservas-admin.page.scss'],
  standalone: false,
})
export class ReservasAdminPage implements OnInit {
  reservas: any[] = [];
  loading = true;
  private rtChannel?: ReturnType<typeof supabase.channel>;

  private push = inject(Push);
  private email = inject(Email);
  private toast = inject(ToastController);
  private alert = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private router = inject(Router);

  async ngOnInit() {
    await this.cargarReservas();
    this.configurarRealtime();
  }

  ngOnDestroy(): void {
    try {
      if (this.rtChannel) supabase.removeChannel(this.rtChannel);
    } catch {}
  }

  private configurarRealtime() {
    this.rtChannel = supabase
      .channel('reservas-admin')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservas',
        },
        async (payload) => {
          console.log('[Realtime Admin] cambio detectado:', payload);
          await this.cargarReservas();
        }
      )
      .subscribe();
  }

  async cargarReservas() {
    this.loading = true;
    const { data, error } = await supabase
      .from('reservas')
      .select(
        `
        id,
        fecha_hora,
        invitados,
        estado,
        motivo_rechazo,
        mesa_id,
        usuarios (id, correo_electronico, nombres, apellidos)
      `
      )
      .order('fecha_hora', { ascending: true });

    if (error) console.error('Error cargando reservas:', error);
    this.reservas = data ?? [];
    setTimeout(() => (this.loading = false), 2000);
  }

  getFechaLocal(f: string) {
    return new Date(f).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  async confirmar(r: any) {
    try {
      const { id, usuarios } = r;
      const emailUsuario = usuarios?.correo_electronico;

      const modal = await this.modalCtrl.create({
        component: ListadoMesasPage,
        cssClass: 'modal-mesas',
      });
      await modal.present();

      const { data: mesaSeleccionada } = await modal.onDidDismiss();
      if (!mesaSeleccionada) return;

      const { data: user, error: errUser } = await supabase
        .from('usuarios')
        .select('id')
        .eq('correo_electronico', emailUsuario)
        .maybeSingle();

      if (errUser || !user?.id) {
        console.error(
          '❌ No se encontró el usuario en tabla usuarios',
          errUser
        );
        (
          await this.toast.create({
            message: 'No se encontró el usuario registrado.',
            duration: 1500,
            position: 'top',
            cssClass: 'toast',
          })
        ).present();
        return;
      }

      const { data: cliente, error: errCliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('usuario_id', user.id)
        .maybeSingle();

      if (errCliente || !cliente?.id) {
        console.error(
          '❌ No se encontró el cliente asociado al usuario',
          errCliente
        );
        (
          await this.toast.create({
            message: 'No se encontró el cliente asociado a este usuario.',
            duration: 1500,
            position: 'top',
            cssClass: 'toast',
          })
        ).present();
        return;
      }

      const clienteId = cliente.id;

      const { error: errRes } = await supabase
        .from('reservas')
        .update({
          estado: 'confirmada',
          motivo_rechazo: null,
          mesa_id: mesaSeleccionada.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (errRes) {
        console.error('Error al actualizar reserva:', errRes);
        return;
      }

      await this.push.sendToRoles(
        ['cliente'],
        'Reserva confirmada',
        `Tu reserva para el ${this.getFechaLocal(
          r.fecha_hora
        )} fue confirmada.`,
        {
          tipo: 'reserva_confirmada',
          reservaId: id,
          mesaId: mesaSeleccionada.id,
        }
      );

      if (emailUsuario) {
        const nombre = `${usuarios.nombres ?? ''} ${
          usuarios.apellidos ?? ''
        }`.trim();
        await this.email.enviarEmailPersonalizado(
          'ReservaConfirmada',
          emailUsuario,
          'Reserva Confirmada - TasteByte',
          `
        <p>Hola <b>${nombre || 'Cliente'}</b>.</p>
        <p>Su reserva para el <b>${this.getFechaLocal(
          r.fecha_hora
        )}</b> fue <b>confirmada</b>.</p>
        <p>Se le asignó la mesa N° <b>${mesaSeleccionada.numero}</b>.</p>
        <p>¡Lo Esperamos! 🍽️</p>
        `,
          'Reserva Confirmada'
        );
      }

      (
        await this.toast.create({
          message: `Reserva confirmada y asignada a mesa ${mesaSeleccionada.numero}.`,
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();

      await this.cargarReservas();
    } catch (err) {
      console.error('Error en confirmar():', err);
      (
        await this.toast.create({
          message: 'Ocurrió un error al confirmar la reserva.',
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
    }
  }

  async rechazar(r: any) {
    const prompt = await this.alert.create({
      cssClass: "alert-reservas",
      header: 'Motivo del Rechazo',
      inputs: [
        {
          type: 'textarea',
          name: 'motivo',
          placeholder: 'Escriba el motivo...',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Rechazar',
          role: 'confirm',
          handler: async (data) => {
            const motivo = (data.motivo || '').trim();
            if (!motivo) return;

            const email = r.usuarios?.correo_electronico;
            const nombre = `${r.usuarios?.nombres ?? ''} ${
              r.usuarios?.apellidos ?? ''
            }`.trim();
            const fechaLocal = this.getFechaLocal(r.fecha_hora);

            if (email) {
              await this.email.enviarEmailPersonalizado(
                'ReservaRechazada',
                email,
                'Reserva Rechazada - TasteByte',
                `
          <p>Hola <b>${nombre || 'Cliente'}</b>.</p>
          <p>Lamentamos informarle que su reserva para el <b>${fechaLocal}</b> fue <b>rechazada</b>.</p>
          <p><b>Motivo:</b> ${motivo}</p>
          <p>Puede intentar en otro horario o comunicarse con nosotros.</p>
        `,
                'Reserva Rechazada'
              );
            }

            await this.push.sendToRoles(
              ['cliente'],
              'Reserva rechazada',
              `Su reserva fue rechazada: ${motivo}`,
              { tipo: 'reserva_rechazada', reservaId: r.id }
            );

            const { error } = await supabase
              .from('reservas')
              .delete()
              .eq('id', r.id);
            if (error) {
              console.error('Error al eliminar reserva:', error);
              (
                await this.toast.create({
                  message: 'Error al eliminar la reserva.',
                  duration: 1500,
                  position: 'top',
                  cssClass: 'toast',
                })
              ).present();
              return;
            }

            (
              await this.toast.create({
                message: 'Reserva rechazada y eliminada correctamente.',
                duration: 1500,
                position: 'top',
                cssClass: 'toast',
              })
            ).present();

            await this.cargarReservas();
          },
        },
      ],
    });

    await prompt.present();
  }

  volver() {
    this.router.navigate(['/home'], {
      replaceUrl: true,
    });
  }
}
