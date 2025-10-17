import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  NgZone,
  ViewChild,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { IonContent, IonModal, ToastController } from '@ionic/angular';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';
import { Chat } from 'src/app/services/chat/chat';
import { ChatMessage } from 'src/app/interfaces/chat-message';
import { Pedidos } from 'src/app/services/pedidos/pedidos';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { ClienteSessionService } from 'src/app/services/clienteSessionService/cliente-session-service'; // ✅ agregado

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
  private zone = inject(NgZone);
  private chatSvc = inject(Chat);
  private pedidos = inject(Pedidos);
  private toast = inject(ToastController);
  private subscription: any;
  private pedidoSub: any;
  private listaEsperaSub: any;

  chatOpen = false;
  chatReady = false;
  chatId?: string;
  myUserId?: string;
  messages: {
    id: string;
    from: 'yo' | 'mozo';
    role: 'mozo' | 'cliente';
    text: string;
    time: string;
  }[] = [];
  newMsg = '';
  @ViewChild('chatContent') chatContent?: IonContent;
  @ViewChild('chatModal', { read: IonModal }) chatModal?: IonModal;
  private seenIds = new Set<string>();

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
  id: any;
  email = '';
  clienteFoto = '';
  tieneMesa = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private usuarios: Usuarios,
    private session: ClienteSessionService
  ) {}

  async ngOnInit() {
    if (this.session.mesaAsignadaId && this.session.tienePermiso) {
      this.mesaAsignadaId = this.session.mesaAsignadaId;
      this.pedidoId = this.session.pedidoId;
      this.estadoPedido = this.session.estadoPedido;
      this.tienePermiso = true;
      this.yaRegistrado = true;
      this.qrValido = true;
      this.tieneMesa = true;

      this.actualizarFlags();
      await this.ensureChatAndSubscribe();
      this.loading = false;
      return;
    }

    if (this.session.tienePermiso) {
      this.tienePermiso = this.session.tienePermiso;
      this.qrValido = this.session.qrValido;
      this.yaRegistrado = this.session.yaRegistrado;
      this.anonimoId = this.session.anonimoId ?? undefined;
      this.usuarioId = this.session.usuarioId
        ? Number(this.session.usuarioId)
        : null;
      this.clienteId = this.session.clienteId
        ? Number(this.session.clienteId)
        : null;
      this.userUid = this.session.userUid ?? undefined;
    }

    this.route.queryParams.subscribe(async (params) => {
      this.clienteId = params['clienteId']
        ? Number(params['clienteId'])
        : this.clienteId;
      this.usuarioId = params['usuarioId']
        ? Number(params['usuarioId'])
        : this.usuarioId;
      this.anonimoId = params['anonimoId'] ?? this.anonimoId;
      this.tienePermiso = params['tienePermiso'] ?? this.tienePermiso;
      this.userUid = params['userId'] ?? this.userUid;
      this.mostrarCuenta = params['mostrarCuenta'] ?? this.mostrarCuenta;

      if (!this.clienteId && !this.anonimoId && !this.usuarioId) {
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      const { data: au } = await supabase.auth.getUser();

      if (this.anonimoId) {
        this.myUserId = `anon-${this.anonimoId}`;

        const { data: anon } = await supabase
          .from('clientes_anonimos')
          .select('nombre, foto_url')
          .eq('id', this.anonimoId)
          .maybeSingle();

        this.nombreCliente = anon?.nombre || 'Cliente Anónimo';
        this.clienteFoto = anon?.foto_url || '';
        this.email = '☠︎ anonimo ☠︎';
        this.usuarioId = null;
      } else {
        this.myUserId = au.user?.id ?? undefined;

        const usuarioDB = await this.usuarios.getByEmail(au.user!.email!);
        this.id = usuarioDB!.id;
        this.email = `${usuarioDB!.correo_electronico}`.trim();

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombres, apellidos, foto_url')
          .eq('id', this.id)
          .maybeSingle();

        this.nombreCliente = usuario
          ? `${usuario.nombres} ${usuario.apellidos}`
          : 'Cliente';
        this.clienteFoto = usuario?.foto_url ?? '';
        this.usuarioId = this.id;
      }

      if (this.usuarioId === null) {
        this.usuarioId = this.id;
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
          .select('nombres, apellidos, foto_url')
          .eq('id', this.id)
          .maybeSingle();
        this.nombreCliente = usuario
          ? `${usuario.nombres} ${usuario.apellidos}`
          : 'Cliente';
        this.clienteFoto = usuario?.foto_url ?? '';
      } else if (this.anonimoId) {
        const { data: anonimo } = await supabase
          .from('clientes_anonimos')
          .select('nombre')
          .eq('id', this.anonimoId)
          .maybeSingle();
        this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
      }

      await this.push.init(this.usuarioId ?? null, 'cliente');
      await this.push.ready();

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
          async (payload: any) => {
            if (
              payload.eventType === 'INSERT' ||
              payload.eventType === 'UPDATE'
            ) {
              if (payload.new && typeof payload.new.mesa_id === 'number') {
                this.mesaAsignadaId = payload.new.mesa_id;
                this.yaRegistrado = true;
                this.tieneMesa = true;
                this.zone.run(() => {
                  this.mostrarToast(
                    `Ya puede tomar asiento en la mesa #${this.mesaAsignadaId}.`,
                    'Mesa Asginada'
                  );
                });

                this.session.mesaAsignadaId = this.mesaAsignadaId;
                this.session.yaRegistrado = true;
                this.session.tienePermiso = true;

                await this.ensureChatAndSubscribe();
              }
            } else if (payload.eventType === 'DELETE') {
              await this.limpiarIntentosJuegos();
              this.resetVista();
            }
          }
        )
        .subscribe();

      this.listaEsperaSub = supabase
        .channel('lista_espera_sub')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lista_espera' },
          async (payload: any) => {
            const row = (payload.new as any) ?? (payload.old as any);
            if (!row) return;

            const esEsteCliente =
              row.cliente_anonimo_id === this.anonimoId ||
              row.cliente_id === this.clienteId;
            if (!esEsteCliente) return;

            if (payload.eventType === 'DELETE') {
              this.zone.run(() => {
                this.yaRegistrado = false;
                this.mostrarToast('Fuiste removido de la lista de espera.');
                this.toast
                  .getTop()
                  .then((t) => t?.onDidDismiss().then(() => location.reload()));
              });
            }

            if (payload.eventType === 'UPDATE') {
              const nuevoEstado = row.estado;
              if (nuevoEstado && nuevoEstado !== 'pendiente') {
                this.zone.run(() => {
                  this.yaRegistrado = false;
                  this.mostrarToast(`Tu estado cambió a "${nuevoEstado}".`);
                });
              }
            }
          }
        )
        .subscribe();

      setTimeout(() => (this.loading = false), 2000);

      await this.ensureChatAndSubscribe();
    });
  }

  ngOnDestroy() {
    if (this.subscription) supabase.removeChannel(this.subscription);
    if (this.pedidoSub) supabase.removeChannel(this.pedidoSub);
    if (this.listaEsperaSub) supabase.removeChannel(this.listaEsperaSub);
    try {
      this.chatSvc.unsubscribe?.();
    } catch {}
  }

  async escanearQr() {
    try {
      const qr = await this.qr.scanQr();
      if (!qr) return;

      const res = await this.qr.procesarQrCliente(
        qr,
        this.clienteId ?? undefined,
        this.anonimoId ?? undefined
      );

      if (res.error) {
        this.mostrarToast(res.error);
        return;
      }

      if (qr.startsWith('INGRESO')) {
        if (!this.tienePermiso) {
          this.tienePermiso = true;
          this.qrValido = true;
          this.session.tienePermiso = true;
          this.session.qrValido = true;

          if (this.mesaAsignadaId) {
            this.session.mesaAsignadaId = this.mesaAsignadaId;
          }

          this.mostrarToast(
            '✔️ Ingreso validado. Ya tenes acceso a algunas funciones.'
          );
        } else {
          this.mostrarToast('Ya habías escaneado el QR de ingreso.');
        }
        return;
      }

      if (res.mesaAsignada) {
        const mesaId = res.mesaAsignada;
        const mesaNumero = res.numero;

        const { data: pedido } = await supabase
          .from('pedidos')
          .select('id, estado')
          .eq('mesa_id', mesaId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pedido) {
          this.estadoPedido = pedido.estado;
          this.pedidoId = pedido.id;
          this.mesaAsignadaId = mesaId;
          this.actualizarFlags();
          this.suscribirPedido(this.pedidoId);
          this.mostrarToast(`Mesa ${mesaNumero} vinculada correctamente.`);
        } else {
          const qp: any = {
            mesaId,
            numero: mesaNumero,
          };

          if (this.anonimoId) qp.anonimoId = this.anonimoId;
          if (this.usuarioId) qp.usuarioId = this.usuarioId;
          if (this.clienteId) qp.clienteId = this.clienteId;

          await this.router.navigate(['/mesa-ocupada'], { queryParams: qp });
          return;
        }

        return;
      }

      this.mostrarToast('QR no reconocido o no autorizado.');
    } catch (e: any) {
      console.error('[escanearQr] Error:', e);
      this.mostrarToast('Error al procesar el QR.');
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
      this.tienePermiso = true;

      this.session.tienePermiso = true;
      this.session.qrValido = true;
      this.session.mesaAsignadaId = this.mesaAsignadaId;
      this.session.yaRegistrado = true;

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

        this.session.pedidoId = this.pedidoId;
        this.session.estadoPedido = this.estadoPedido;

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);
      }

      await this.ensureChatAndSubscribe();
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
    if (!errLista && espera) {
      this.yaRegistrado = true;
      this.session.yaRegistrado = true;
    }
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
      this.mostrarToast(res.error);
      return;
    }

    if (res.mesaAsignada) {
      const { data } = await supabase
        .from('pedidos')
        .select('id, estado')
        .eq('mesa_id', res.mesaAsignada)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const qp: any = { mesaId: res.mesaAsignada, numero: res.numero };
      if (this.anonimoId) qp.anonimoId = this.anonimoId;
      if (this.usuarioId) qp.usuarioId = this.usuarioId;
      if (this.clienteId) qp.clienteId = this.clienteId;

      if (data) {
        this.estadoPedido = data.estado;
        this.pedidoId = data.id;
        this.session.pedidoId = this.pedidoId;
        this.session.estadoPedido = this.estadoPedido;

        if (this.estadoPedido === 'rechazado') {
          await this.router.navigate(['/mesa-ocupada'], { queryParams: qp });
          return;
        }

        if (this.estadoPedido === 'aceptado') {
          await this.checkEstadoTrasScan(
            res.mesaAsignada,
            this.userUid ?? null,
            null
          );
        }

        if (this.estadoPedido === 'recibido') {
          (
            await this.toast.create({
              message: 'Pedido Entregado',
              duration: 1500,
              position: 'top',
              cssClass: 'toast',
            })
          ).present();
        }

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);
        return;
      }

      await this.router.navigate(['/mesa-ocupada'], { queryParams: qp });
      return;
    }
  }

  async checkEstadoTrasScan(
    mesaId: number,
    clienteUid: string | null,
    clienteEmail: string | null
  ): Promise<void> {
    const pedidoId = await this.pedidos.getPedidoAceptadoActual(
      mesaId,
      clienteUid,
      clienteEmail
    );
    if (!pedidoId) return;
    const estados = await this.pedidos.getEstadosAreas(pedidoId);
    const msg = this.pedidos.resolverMensajeAreas(estados);
    if (!msg) return;
    const t = await this.toast.create({
      message: msg,
      duration: 1500,
      position: 'top',
      cssClass: 'toast',
    });
    await t.present();
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
            this.session.estadoPedido = nuevoEstado;
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
      this.mostrarToast('Error: no se detectó cliente');
      return;
    }

    const { data, error } = await supabase
      .from('lista_espera')
      .insert(payload)
      .select()
      .single();
    if (error) {
      this.mostrarToast('Error al registrarse en la lista de espera');
      return;
    }

    try {
      await this.push.sendToRoles(
        ['maitre'],
        'Nuevo cliente en lista de espera',
        'Se ha agregado un nuevo cliente a la lista de espera.',
        {
          tipo: 'lista_espera',
          screen: 'lista-espera',
          lista_espera_id: data.id,
        }
      );
    } catch (e) {
      console.error('[push][lista_espera][sendToRoles]', e);
    }

    this.yaRegistrado = true;
    this.mostrarToast('Te registraste correctamente en la lista de espera');
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase.from('respuestas_encuestas').insert({
      usuario_id: this.usuarioId,
      encuesta_id: encuestaId,
      respondido_en: new Date().toISOString(),
    });
    this.mostrarToast('Gracias por participar en la encuesta!');
  }

  private actualizarFlags() {
    const pedidoConfirmado =
      this.estadoPedido === 'aceptado' || this.estadoPedido === 'recibido';

    this.mostrarJuegosPedido = pedidoConfirmado;
    this.mostrarCuenta = this.estadoPedido === 'terminado';

    if (this.estadoPedido === 'impagado' || this.estadoPedido === 'cancelado') {
      this.mostrarCuenta = false;
      this.mostrarJuegosPedido = false;
    }

    if (this.estadoPedido === 'pagado') {
      this.limpiarIntentosJuegos();
      this.resetVista();
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
      if (this.userUid)
        await supabase
          .from('intentos_juegos')
          .delete()
          .eq('cliente_uid', this.userUid);
      else if (this.clienteId)
        await supabase
          .from('intentos_juegos')
          .delete()
          .eq('cliente_id', this.clienteId);
    } catch {}
  }

  async pedirCuenta(): Promise<void> {
    try {
      await this.push.ready();
      const { data: mesaRow } = await supabase
        .from('mesas')
        .select('numero')
        .eq('id', this.mesaAsignadaId)
        .maybeSingle();
      const mesaNumero = mesaRow?.numero ?? this.mesaAsignadaId;
      const title = 'Cuenta Solicitada';
      const body = `Cliente Mesa (${mesaNumero}) solicita la cuenta`;
      await this.push.sendToRoles(['mozo'], title, body, {
        tipo: 'pedir_cuenta',
        mesaId: this.mesaAsignadaId,
        mesaNumero,
      });
      this.mostrarToast('Aviso enviado al mozo.');
    } catch (e: any) {
      this.mostrarToast(e?.message ?? 'No se pudo notificar al mozo');
    }
  }

  async salir() {
    try {
      await supabase.auth.signOut();
    } catch {}
    this.session.limpiar();
    this.router.navigate(['/login'], { replaceUrl: true });
  }

  private async mostrarToast(mensaje: string, header?: string) {
    const t = await this.toast.create({
      header,
      message: mensaje,
      duration: 1500,
      cssClass: 'toast',
      position: 'top',
    });
    await t.present();
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private async ensureChatAndSubscribe(): Promise<void> {
    if (!this.mesaAsignadaId) return;
    if (!this.myUserId) {
      const { data: au } = await supabase.auth.getUser();
      this.myUserId = this.anonimoId
        ? `anon-${this.anonimoId}`
        : au.user?.id ?? undefined;
    }

    const chat = await this.chatSvc.getOrCreateForMesa(
      this.mesaAsignadaId,
      'cliente',
      this.anonimoId
    );

    this.chatId = chat.id;

    await this.chatSvc.bindMyPushToken(this.chatId, this.anonimoId);

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.seenIds.clear();
    this.messages = msgs.map((m: any) => {
      this.seenIds.add(m.id);
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === 'yo' ? 'cliente' : 'mozo';
      return { ...vm, role };
    });

    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      if (this.seenIds.has(m.id)) return;

      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      if (vm.from === 'yo') {
        this.seenIds.add(m.id);
        return;
      }

      const role: 'mozo' | 'cliente' = 'mozo';
      this.zone.run(() => {
        this.messages.push({ ...vm, role });
        this.seenIds.add(m.id);
      });

      if (!this.chatOpen) {
        (
          await this.toast.create({
            message: `Mozo: ${vm.text}`,
            duration: 3000,
            position: 'top',
            cssClass: 'toast',
            buttons: [{ text: 'Abrir', handler: () => this.openChat() }],
          })
        ).present();
      } else {
        this.scrollToBottom();
      }
    });
  }

  async openChat() {
    if (!this.chatId && this.mesaAsignadaId) {
      const chat = await this.chatSvc.getOrCreateForMesa(
        this.mesaAsignadaId,
        'cliente',
        this.anonimoId
      );

      this.chatId = chat.id;
      await this.chatSvc.bindMyPushToken(this.chatId, this.anonimoId);
    }

    this.chatOpen = true;
    this.chatReady = true;
    this.scrollToBottomAfterRender();
  }

  async closeChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatReady = false;
  }

  async sendMessage() {
    if (!this.chatReady || !this.chatId) return;
    const txt = this.newMsg.trim();
    if (!txt) return;

    const tempId = 'temp-' + Date.now();
    const now = new Date();

    this.messages.push({
      id: tempId,
      from: 'yo',
      role: 'cliente',
      text: txt,
      time: this.hhmm(now),
    });
    this.scrollToBottomAfterRender();
    this.newMsg = '';

    const saved = await this.chatSvc.sendMessage(
      this.chatId,
      txt,
      this.anonimoId
    );
    const vm = this.chatSvc.toViewMessage(saved, this.myUserId!);
    const role: 'mozo' | 'cliente' = 'cliente';

    const idx = this.messages.findIndex((m) => m.id === tempId);
    if (idx >= 0) {
      this.messages[idx] = {
        id: vm.id,
        from: vm.from,
        role,
        text: vm.text,
        time: vm.time,
      };
    } else if (!this.seenIds.has(saved.id)) {
      this.messages.push({
        id: vm.id,
        from: vm.from,
        role,
        text: vm.text,
        time: vm.time,
      });
    }

    this.seenIds.add(saved.id);
  }

  trackMsg = (_: number, m: { id: string }) => m.id;
  private scrollToBottom(ms: number = 200) {
    try {
      this.chatContent?.scrollToBottom(ms);
    } catch {}
  }
  private scrollToBottomAfterRender() {
    requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0));
  }
}
