import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReservasService } from 'src/app/services/reservas/reservas';
import { AlertController, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { supabase } from 'src/supabase.client';

@Component({
  selector: 'app-reservas-cliente',
  standalone: false,
  templateUrl: './reservas-cliente.page.html',
  styleUrls: ['./reservas-cliente.page.scss'],
})
export class ReservasClientePage implements OnInit {
  fechaSeleccionada: string = '';
  horaSeleccionada: string = '';
  invitados: number = 2;
  reservas: any[] = [];
  loading = false;
  nombreCliente: string = '';
  clienteFoto: string = '';
  usuarioId: number | null = null;
  clienteId: number | null = null;
  userId!: string | null;

  private rtChannel?: ReturnType<typeof supabase.channel>;

  constructor(
    private reservasSvc: ReservasService,
    private toast: ToastController,
    private alertCtrl: AlertController,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  async ngOnInit() {
    await this.cargarReservas();
    this.configurarRealtime();

    this.route.queryParams.subscribe((params) => {
      this.userId = params['userId'] ?? null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      (this.clienteFoto = params['clienteFoto']),
        (this.nombreCliente = params['nombreCliente']);
    });
  }

  ngOnDestroy(): void {
    try {
      if (this.rtChannel) supabase.removeChannel(this.rtChannel);
    } catch { }
  }

  private async configurarRealtime() {
    const { data: au } = await supabase.auth.getUser();
    const email = au?.user?.email;
    if (!email) return;

    this.rtChannel = supabase
      .channel('reservas-cliente')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservas',
          filter: `usuario_correo=eq.${email}`,
        },
        async (payload) => {
          console.log('[Realtime Cliente] cambio detectado:', payload);

          if (payload.eventType === 'DELETE') {
            const idEliminado = payload.old?.['id'];
            if (idEliminado) {
              this.reservas = this.reservas.filter((r) => r.id !== idEliminado);
            } else {
              await this.cargarReservas();
            }
          } else {
            await this.cargarReservas();
          }
        }
      )
      .subscribe();
  }

  async cargarReservas() {
    this.loading = true;
    try {
      this.reservas = await this.reservasSvc.listarMisReservas();
    } catch (e: any) {
      this.mostrarToast(e.message || 'Error al cargar reservas');
    } finally {
      setTimeout(() => (this.loading = false), 2000);
    }
  }

  async confirmarReserva() {
    if (!this.fechaSeleccionada) {
      return this.mostrarToast('Selecciona fecha y hora.');
    }

    const fechaHora = new Date(this.fechaSeleccionada);
    if (isNaN(fechaHora.getTime())) {
      return this.mostrarToast('La fecha seleccionada no es válida.');
    }

    const fechaStr = fechaHora.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const horaStr = fechaHora.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const alert = await this.alertCtrl.create({
      header: 'Confirmar Reserva',
      message: `
      <p>📅 <strong>${fechaStr}</strong></p>
      <p>🕒 <strong>${horaStr}</strong></p>
      <p>👥 Invitados: <strong>${this.invitados}</strong></p>
      <p style="margin-top:10px;">¿Desea crear esta reserva?</p>
    `,
      cssClass: 'alert-confirm',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'btn-cancelar',
        },
        {
          text: 'Confirmar',
          cssClass: 'btn-confirmar',
          handler: () => this.crearReserva(),
        },
      ],
    });

    await alert.present();
  }

  async crearReserva() {
    try {
      if (!this.fechaSeleccionada) {
        return this.mostrarToast('Seleccione fecha y hora.');
      }

      const fechaHora = new Date(this.fechaSeleccionada);

      if (isNaN(fechaHora.getTime())) {
        return this.mostrarToast('La fecha u hora seleccionada no es válida.');
      }

      const iso = fechaHora.toISOString();

      await this.reservasSvc.crearReserva({
        fecha_hora: iso,
        invitados: this.invitados,
      });

      await this.mostrarToast('Reserva creada correctamente');
      this.fechaSeleccionada = '';
      this.horaSeleccionada = '';
      this.invitados = 2;
      await this.cargarReservas();
    } catch (e: any) {
      this.mostrarToast(e.message || 'No se pudo crear la reserva');
    }
  }

  async mostrarToast(msg: string) {
    const t = await this.toast.create({
      message: msg,
      duration: 1500,
      position: 'top',
      cssClass: 'toast',
    });
    await t.present();
  }

  volver() {
    this.router.navigate(['/encuestas-espera'], {
      queryParams: {
        clienteId: this.clienteId ?? undefined,
        usuarioId: this.usuarioId ?? undefined,
        userId: this.userId ?? undefined,
      },
    });
  }
}