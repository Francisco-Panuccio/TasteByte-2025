import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';

type EstadoAsignacion =
  | 'pendiente'
  | 'asignada'
  | 'sentado'
  | 'liberada'
  | 'cancelada';
interface AsignacionMesaRow {
  mesa_id: number;
  estado: EstadoAsignacion;
}

@Component({
  selector: 'app-encuestas-espera',
  templateUrl: './encuestas-espera.page.html',
  styleUrls: ['./encuestas-espera.page.scss'],
  standalone: false,
})
export class EncuestasEsperaPage implements OnInit, OnDestroy {
  private qr = inject(Qr);
  private push = inject(Push);
  private subscription: any;
  private pedidoSub: any;

  nombreCliente: string | undefined;
  usuarioId: number | null = null;
  anonimoId: string | undefined;
  clienteId: number | null = null;
  userUid: string | undefined;
  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;
  loading = true;
  tienePermiso = false;
  yaRegistrado = false;
  mostrarJuegosPedido = false;
  mostrarCuenta = false;

  mesaAsignadaId: number | null = null;
  estadoPedido: string | null = null;
  pedidoId: string | null = null;

  tieneMesa = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController
  ) { }

  async ngOnInit() {
    this.route.queryParams.subscribe(async (params) => {
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'];
      this.tienePermiso = params['tienePermiso'];
      this.userUid = params['userId'];
      this.mostrarCuenta = params['mostrarCuenta'];

      if (!this.clienteId && !this.anonimoId && !this.usuarioId) {
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (!this.usuarioId && this.clienteId) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('usuario_id')
          .eq('id', this.clienteId)
          .maybeSingle();
        this.usuarioId =
          typeof cli?.usuario_id === 'number' ? cli?.usuario_id : null;
      }

      if (this.usuarioId) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombres, apellidos')
          .eq('id', this.usuarioId)
          .maybeSingle();
        this.nombreCliente = usuario
          ? `${usuario.nombres} ${usuario.apellidos}`
          : 'Cliente';
        await this.push.init(this.usuarioId, 'cliente' as any);
        await this.push.ready();
      } else if (this.anonimoId) {
        const { data: anonimo } = await supabase
          .from('clientes_anonimos')
          .select('nombre')
          .eq('id', this.anonimoId)
          .maybeSingle();
        this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
        await this.push.init(null, 'cliente' as any);
        await this.push.ready();
      }

      const tk = this.push.getToken?.();
      const { data: au } = await supabase.auth.getUser();
      let upsertUserId: string | null = au?.user?.id ?? null;
      if (!upsertUserId && this.anonimoId) upsertUserId = `anon-${this.anonimoId}`;
      if (tk && upsertUserId) {
        await supabase.from('push_tokens').upsert(
          { token: tk, usuario_id: upsertUserId, role: 'cliente', active: true, revoked: false },
          { onConflict: 'token' }
        );
      }

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
          async (payload: {
            new?: Partial<AsignacionMesaRow>;
            old?: Partial<AsignacionMesaRow>;
            eventType?: string;
          }) => {
            if (
              payload.eventType === 'INSERT' ||
              payload.eventType === 'UPDATE'
            ) {
              if (payload.new && typeof payload.new.mesa_id === 'number') {
                this.mesaAsignadaId = payload.new.mesa_id;
                this.yaRegistrado = true;
                this.tieneMesa = true;
              }
            } else if (payload.eventType === 'DELETE') {
              await this.limpiarIntentosJuegos();
              this.resetVista();
            }
          }
        )
        .subscribe();

      setTimeout(() => (this.loading = false), 2000);
    });
  }

  ngOnDestroy() {
    if (this.subscription) supabase.removeChannel(this.subscription);
    if (this.pedidoSub) supabase.removeChannel(this.pedidoSub);
  }

  async escanearQr() {
    const qr = await this.qr.scanQr();
    if (!qr) return;
    const res = await this.qr.procesarQrCliente(
      qr,
      this.clienteId ?? undefined,
      this.anonimoId ?? undefined
    );
    if (res.error) {
      this.mostrarToast(res.error, 'danger');
      return;
    }
    if (res.permiso && qr.startsWith('INGRESO')) {
      this.tienePermiso = true;
      this.yaRegistrado = !!res.yaRegistrado;
      this.qrValido = true;
      this.mostrarToast('Bienvenido!');

      if (this.mesaAsignadaId) {
        const { data: pedido } = await supabase
          .from('pedidos')
          .select('id, estado')
          .eq('mesa_id', this.mesaAsignadaId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pedido) {
          this.estadoPedido = pedido.estado;
          this.pedidoId = pedido.id;

          this.actualizarFlags();
          this.suscribirPedido(this.pedidoId);
        }
      }
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
    const { data: asignacion, error: errAsignacion } = await q.maybeSingle();
    if (
      !errAsignacion &&
      asignacion &&
      typeof asignacion.mesa_id === 'number'
    ) {
      this.mesaAsignadaId = asignacion.mesa_id;
      this.yaRegistrado = true;
      this.tieneMesa = true;
      return;
    }

    let qLista = supabase
      .from('lista_espera')
      .select('id, estado')
      .in('estado', ['pendiente', 'aprobado']);
    if (this.clienteId) qLista = qLista.eq('cliente_id', this.clienteId);
    if (this.anonimoId)
      qLista = qLista.eq('cliente_anonimo_id', this.anonimoId);
    const { data: espera, error: errLista } = await qLista.maybeSingle();
    if (!errLista && espera) this.yaRegistrado = true;
  }

  async escanearQrMesa() {
    const qr = await this.qr.scanQr();
    if (!qr) return;

    const res = await this.qr.procesarQrCliente(
      qr,
      this.clienteId ?? undefined,
      this.anonimoId ?? undefined
    );

    if (res.error) {
      this.mostrarToast(res.error, 'danger');
      return;
    }

    if (res.mesaAsignada) {
      const { data } = await supabase
        .from("pedidos")
        .select("id, estado")
        .eq("mesa_id", res.mesaAsignada)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const qp: any = { mesaId: res.mesaAsignada, numero: res.numero };
      if (this.anonimoId) qp.anonimoId = this.anonimoId;
      if (this.usuarioId) qp.usuarioId = this.usuarioId;
      if (this.clienteId) qp.clienteId = this.clienteId;

      if (data) {
        this.estadoPedido = data.estado;
        this.pedidoId = data.id;

        if (this.estadoPedido === "rechazado") {
          await this.router.navigate(["/mesa-ocupada"], { queryParams: qp });
          return;
        }

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);
        return;
      }

      await this.router.navigate(["/mesa-ocupada"], { queryParams: qp });
      return;
    }
  }

  private suscribirPedido(pedidoId: string | null) {
    if (!pedidoId) return;

    if (this.pedidoSub) supabase.removeChannel(this.pedidoSub);

    this.pedidoSub = supabase
      .channel(`pedido_${pedidoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pedidos',
          filter: `id=eq.${pedidoId}`,
        },
        (payload) => {
          const nuevoEstado = (payload.new as any)['estado'];
          if (nuevoEstado) {
            this.estadoPedido = nuevoEstado;
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'pedidos',
          filter: `id=eq.${pedidoId}`,
        },
        async () => {
          console.log('🗑️ Pedido eliminado → reset vista cliente');
          await this.limpiarIntentosJuegos();
          this.resetVista();
        }
      )
      .subscribe();
  }

  async registrarseListaEspera() {
    if (this.yaRegistrado) return;
    const payload: any = { estado: 'pendiente' };
    const tk = this.push.getToken();
    if (tk) payload.push_token = tk;
    if (this.clienteId) payload.cliente_id = this.clienteId;
    else if (this.anonimoId) payload.cliente_anonimo_id = this.anonimoId;
    else {
      this.mostrarToast('Error: no se detectó cliente', 'danger');
      return;
    }
    const { error } = await supabase.from('lista_espera').insert(payload);
    if (error) {
      this.mostrarToast('Error al registrarse en la lista de espera', 'danger');
      return;
    }
    this.yaRegistrado = true;
    this.mostrarToast(
      'Te uniste a la lista de espera. Esperá a que el maître te asigne una mesa.'
    );
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase
      .from('respuestas_encuestas')
      .insert({
        usuario_id: this.usuarioId,
        encuesta_id: encuestaId,
        respondido_en: new Date().toISOString(),
      });
    this.mostrarToast('Gracias por participar en la encuesta!');
  }

  private actualizarFlags() {
    if (this.estadoPedido === 'aceptado') {
      this.mostrarJuegosPedido = true;
      this.mostrarCuenta = false;
    } else if (this.estadoPedido === 'terminado') {
      this.mostrarCuenta = true;
      this.mostrarJuegosPedido = false;
    } else if (this.estadoPedido === 'impagado') {
      this.mostrarCuenta = false;
      this.mostrarJuegosPedido = false;
    } else if (this.estadoPedido === 'pagado') {
      this.limpiarIntentosJuegos();
      this.resetVista();
    } else {
      this.mostrarJuegosPedido = false;
      this.mostrarCuenta = false;
    }
  }

  private resetVista() {
    this.mesaAsignadaId = null;
    this.estadoPedido = null;
    this.pedidoId = null;
    this.yaRegistrado = false;
    this.tieneMesa = false;
    this.mostrarCuenta = false;
    this.mostrarJuegosPedido = false;
    this.qrValido = true;
    this.tienePermiso = true;
  }

  private async limpiarIntentosJuegos() {
    if (!this.userUid) {
      const { data: au } = await supabase.auth.getUser();
      this.userUid = au?.user?.id || undefined;
    }

    try {
      if (this.userUid) {
        await supabase
          .from('intentos_juegos')
          .delete()
          .eq('cliente_uid', this.userUid);
        console.log('🧹 Intentos de juegos eliminados (cliente_Uid).');
      } else if (this.clienteId) {
        await supabase
          .from('intentos_juegos')
          .delete()
          .eq('cliente_id', this.clienteId);
        console.log('🧹 Intentos de juegos eliminados (cliente_id).');
      }
    } catch (err) {
      console.error('❌ Error al limpiar intentos_juegos:', err);
    }
  }

  async pedirCuenta(): Promise<void> {
    try {
      const { data: mesaRow } = await supabase
        .from("mesas")
        .select("numero")
        .eq("id", this.mesaAsignadaId)
        .maybeSingle();
      const mesaNumero = mesaRow?.numero ?? this.mesaAsignadaId;
      const title = "Cuenta solicitada";
      const body = `Cliente Mesa (${mesaNumero}) solicita la cuenta`;
      await this.push.sendToRoles(["mozo"], title, body, {
        mesaId: this.mesaAsignadaId,
        mesaNumero
      });
      this.mostrarToast("Aviso enviado al mozo.");
    } catch { }
  }

  async salir() {
    try {
      await supabase.auth.signOut();
    } catch { }
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      cssClass: 'toast2',
      position: 'top',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await t.present();
  }
}
