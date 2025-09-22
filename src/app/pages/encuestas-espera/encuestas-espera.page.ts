import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';

// Tipos
type EstadoAsignacion = 'pendiente' | 'asignada' | 'sentado' | 'liberada' | 'cancelada';
interface AsignacionMesaRow {
  mesa_id: number;
  estado: EstadoAsignacion;
}

@Component({
  selector: 'app-encuestas-espera',
  templateUrl: './encuestas-espera.page.html',
  styleUrls: ['./encuestas-espera.page.scss'],
  standalone: false
})
export class EncuestasEsperaPage implements OnInit, OnDestroy {
  nombreCliente: string | undefined;

  usuarioId: number | null = null;     // 🔹 ahora es number (usuarios.id)
  anonimoId: string | undefined;       // 🔹 sigue siendo string
  clienteId: number | null = null;     // 🔹 sigue siendo number (clientes.id)

  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;
  loading = true;
  tienePermiso = false;
  yaRegistrado = false;

  mesaAsignadaId: number | null = null;
  private subscription: any;

  private qr = inject(Qr);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'];

      if (!this.clienteId && !this.anonimoId) {
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (this.usuarioId) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombres, apellidos')
          .eq('id', this.usuarioId)
          .single();
        this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : 'Cliente';
      } else if (this.anonimoId) {
        const { data: anonimo } = await supabase
          .from('clientes_anonimos')
          .select('nombre')
          .eq('id', this.anonimoId)
          .single();
        this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
      }

      const { data: encuestas } = await supabase.from('encuestas').select('*');
      this.encuestas = encuestas || [];

      await this.cargarMesaAsignada();

      this.subscription = supabase
        .channel('asignaciones_mesa_sub')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'asignaciones_mesa',
            filter: this.clienteId
              ? `cliente_id=eq.${this.clienteId}`
              : `cliente_anonimo_id=eq.${this.anonimoId}`,
          },
          async (payload: { new?: Partial<AsignacionMesaRow> }) => {
            const mesa = payload?.new?.mesa_id;
            if (typeof mesa === 'number') {
              this.mesaAsignadaId = mesa;
              this.mostrarToast(`¡Te asignaron la mesa #${mesa}!`, 'success');
            }
          }
        )
        .subscribe();

      this.loading = false;
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      supabase.removeChannel(this.subscription);
    }
  }

  private async cargarMesaAsignada() {
    let q = supabase
      .from('asignaciones_mesa')
      .select('mesa_id, estado')
      .in('estado', ['pendiente', 'asignada', 'sentado'] as EstadoAsignacion[])
      .order('asignada_en', { ascending: false })
      .limit(1);

    if (this.clienteId) q = q.eq('cliente_id', this.clienteId);
    if (this.anonimoId) q = q.eq('cliente_anonimo_id', this.anonimoId);

    const { data, error } = await q.maybeSingle();
    const fila = data as AsignacionMesaRow | null;

    if (!error && fila && typeof fila.mesa_id === 'number') {
      this.mesaAsignadaId = fila.mesa_id;
    }
  }

  async registrarseListaEspera() {
    if (this.yaRegistrado) return;

    let payload: any = { estado: 'pendiente' };

    if (this.clienteId) {
      payload.cliente_id = this.clienteId; // int
    } else if (this.anonimoId) {
      payload.cliente_anonimo_id = this.anonimoId; // uuid string
    } else {
      this.mostrarToast('Error: no se detectó cliente', 'danger');
      return;
    }

    const { error } = await supabase.from('lista_espera').insert(payload);
    if (error) {
      console.error(error);
      this.mostrarToast('Error al registrarse en la lista de espera', 'danger');
      return;
    }

    this.yaRegistrado = true;
    this.mostrarToast('Te uniste a la lista de espera. Esperá a que el maître te asigne una mesa.', 'success');
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase.from('respuestas_encuestas').insert({
      usuario_id: this.usuarioId, // int
      encuesta_id: encuestaId,
      respondido_en: new Date().toISOString(),
    });
    this.mostrarToast('Gracias por participar en la encuesta!', 'success');
  }

  async escanearQrMesa() {
    const qr = await this.qr.scanQr();
    if (!qr) return;

    const res = await this.qr.procesarQrCliente(
      qr,
      this.clienteId ?? undefined,   // ✅ ahora number
      this.anonimoId ?? undefined    // ✅ sigue string
    );


    if (res.error) {
      this.mostrarToast(res.error, 'danger');
      return;
    }

    if (res.mesaAsignada) {
      this.router.navigate(['/mesa-ocupada'], {
        queryParams: {
          mesaId: res.mesaAsignada,
          numero: res.numero,
          anonimoId: this.anonimoId,
          usuarioId: this.usuarioId, // ahora number
          clienteId: this.clienteId  // pasamos clienteId también
        },
      });
    }
  }

  salir() {
    this.router.navigate(['/login']);
  }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      position: 'bottom',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await t.present();
  }
}
