import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonModal, ToastController } from '@ionic/angular';
import { Chat } from 'src/app/services/chat/chat';
import { ChatMessage } from 'src/app/interfaces/chat-message';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Pedidos } from 'src/app/services/pedidos/pedidos';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';
import { FacturaData, FacturaPage, ItemFactura } from '../factura/factura.page';
import { Email } from 'src/app/services/email/email';
import { Pdf } from 'src/app/services/pdf/pdf';

type Filtro =
  | 'pendiente'
  | 'aceptado'
  | 'rechazado'
  | 'recibido'
  | 'terminado'
  | 'impagado';

const FACTURA_EMPTY: FacturaData = {
  receptor: { cuitOdni: "", nombreCompleto: "" },
  items: [],
  totales: { total: 0 }
};

@Component({
  selector: 'app-pedidos-mozo',
  templateUrl: './pedidos-mozo.page.html',
  styleUrls: ['./pedidos-mozo.page.scss'],
  standalone: false,
})
export class PedidosMozoPage implements OnInit, AfterViewInit {
  private pedidosSrv = inject(Pedidos);
  private chatSvc = inject(Chat);
  private toast = inject(ToastController);
  private mesasSrv = inject(Mesas);
  private push = inject(Push);
  private pdf = inject(Pdf);
  private email = inject(Email);
  private cdr = inject(ChangeDetectorRef);

  filtro: Filtro = 'pendiente';
  loading = true;
  busy = false;

  pedidos: any[] = [];
  sub?: any;

  chatOpen = false;
  @ViewChild('chatModal', { read: IonModal }) chatModal?: IonModal;
  @ViewChild('chatContent') chatContent?: IonContent;

  @ViewChild('facturaCmp', { static: true }) facturaCmp!: FacturaPage;
  facturaData: FacturaData = FACTURA_EMPTY;

  messages: any[] = [];
  newMsg = '';
  chatId?: string;
  myUserId?: string;
  myName = 'Mozo';
  mesasNum = new Map<number, number>();
  mesaChatId?: number;

  inboxOpen = false;
  @ViewChild('inboxModal', { read: IonModal }) inboxModal?: IonModal;
  inbox: Array<{
    chatId: string;
    mesaId: number;
    mesaNumero?: number;
    lastText: string;
    time: string;
  }> = [];

  private sentNuevoPedido = new Set<string>();
  private sentPedidoCompleto = new Set<string>();

  async ngOnInit() {
    window.addEventListener("refrescarPedidosMozo", () => this.cargar());

    await this.ensureMozo();

    this.myUserId = await this.chatSvc.getMyUserId();
    this.setFiltro('pendiente', true);

    this.sub = this.pedidosSrv.subscribeCambios(() => this.cargar());

    supabase
      .channel('bar_pedidos_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bar_pedidos' },
        (payload) => {
          console.log('📡 Cambio detectado en BAR:', payload);
          this.cargar();
        }
      )
      .subscribe();

    supabase
      .channel('cocina_pedidos_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cocina_pedidos' },
        (payload) => {
          console.log('📡 Cambio detectado en COCINA:', payload);
          this.cargar();
        }
      )
      .subscribe();

    supabase
      .channel('mozo_chat_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const raw = payload.new as {
            id: string;
            chat_id: string;
            user_id: string;
            body: string;
            created_at: string;
          } | null;

          if (!raw) return;

          const msg: ChatMessage = {
            id: raw.id,
            chat_id: raw.chat_id,
            user_id: raw.user_id,
            body: raw.body,
            created_at: raw.created_at,
          };

          if (this.chatOpen && msg.chat_id === this.chatId) {
            const yaExiste = this.messages.some((m) => m.id === msg.id);
            if (yaExiste) return;

            const vm = this.chatSvc.toViewMessage(msg, this.myUserId!);
            this.messages.push({
              ...vm,
              role: vm.from === "yo" ? "mozo" : "cliente",
            });
            this.scrollToBottomAfterRender();
          }


          if (this.inboxOpen) {
            await this.cargarInbox();
          }
        }
      )
      .subscribe();

    const tk = this.push.getToken?.();
    const { data: au } = await supabase.auth.getUser();
    if (tk && au?.user?.id) {
      await supabase
        .from('push_tokens')
        .update({
          usuario_id: au.user.id,
          role: 'mozo',
          active: true,
          revoked: false,
        })
        .eq('token', tk);
    }
  }



  async ngAfterViewInit() {
    try {
      await this.emitirFacturaYEnviar("fd2f5a55-b2d7-45e9-b399-1a2f1b885cc5", "franciscopanuccio@hotmail.com");
    } catch (e) {
      console.log(e);
      (await this.toast.create({
        message: "No se pudo enviar la factura",
        duration: 1500,
        position: "top",
        cssClass: "toast"
      })).present();
    }
  }



  ngOnDestroy() {
    this.sub?.unsubscribe?.();
    this.chatSvc.unsubscribe();
  }

  private async ensureMozo() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Auth requerida');
  }

  setFiltro(v: Filtro, force = false): void {
    if (this.busy) return;
    const changed = v !== this.filtro;
    this.filtro = v;
    if (changed || force) this.cargar();
  }

  async cargar() {
    this.loading = true;
    try {
      this.pedidos = await this.pedidosSrv.listar(this.filtro as any);
      const ids = Array.from(
        new Set(this.pedidos.map((p) => p.mesa_id))
      ).filter(Boolean) as number[];
      const mesas = await Promise.all(ids.map((id) => this.mesasSrv.getById(id)));
      mesas.forEach((m) => {
        if (m) {
          this.mesasNum.set(m.id!, m.numero!);
        }
      });

      if (this.filtro === 'aceptado') {
        const pids = this.pedidos.map((p) => p.id).filter(Boolean) as string[];
        if (!pids.length) return;

        const [{ data: bRows }, { data: cRows }] = await Promise.all([
          supabase
            .from('bar_pedidos')
            .select('pedido_id, estado, creado_en')
            .in('pedido_id', pids)
            .order('creado_en', { ascending: false }),
          supabase
            .from('cocina_pedidos')
            .select('pedido_id, estado, creado_en')
            .in('pedido_id', pids)
            .order('creado_en', { ascending: false }),
        ]);

        const mapBar = new Map<string, string>();
        for (const r of bRows ?? []) {
          const id = String((r as any).pedido_id);
          if (!mapBar.has(id)) mapBar.set(id, (r as any).estado as string);
        }

        const mapCocina = new Map<string, string>();
        for (const r of cRows ?? []) {
          const id = String((r as any).pedido_id);
          if (!mapCocina.has(id))
            mapCocina.set(id, (r as any).estado as string);
        }

        this.pedidos = this.pedidos.map((p) => ({
          ...p,
          estadoBar: mapBar.get(String(p.id)) ?? null,
          estadoCocina: mapCocina.get(String(p.id)) ?? null,
        }));

        await this.verificarPedidosCompletos();
      }
    } finally {
      this.loading = false;
    }
  }

  async setEstado(
    pedidoId: string,
    estado: 'aceptado' | 'rechazado' | 'pagado' | 'recibido'
  ) {
    if (this.busy) return;

    if (estado === 'recibido') {
      const validacion = await this.validarEstadoAreas(pedidoId);
      if (!validacion.valido) {
        const toast = await this.toast.create({
          message: validacion.mensaje,
          duration: 2000,
          position: 'top',
          cssClass: 'toast',
        });
        toast.present();
        return;
      }
    }

    this.busy = true;
    try {
      await this.pedidosSrv.actualizarEstado(pedidoId, estado as any);

      try {
        const { data: ped } = await supabase
          .from('pedidos')
          .select('mesa_id')
          .eq('id', pedidoId)
          .single();
        const mesaId = ped?.mesa_id as number | undefined;

        if (mesaId != null) {
          let tokens: string[] = [];
          const { data: chatRow } = await supabase
            .from('chats')
            .select('id')
            .eq('mesa_id', mesaId)
            .maybeSingle();
          if (chatRow?.id) {
            const { data: part } = await supabase
              .from('chat_participants')
              .select('user_id,push_token')
              .eq('chat_id', chatRow.id)
              .eq('role', 'cliente')
              .maybeSingle();
            if (part?.push_token) {
              tokens = [part.push_token as string];
            } else if (part?.user_id) {
              const { data: toks } = await supabase
                .from('push_tokens')
                .select('token')
                .eq('usuario_id', part.user_id as string)
                .eq('role', 'cliente')
                .eq('active', true)
                .eq('revoked', false);
              tokens = (toks ?? []).map((t: any) => t.token as string);
            }
          }

          if (estado === 'pagado') {
            await this.mesasSrv.liberarMesa(mesaId);
          }

          if (tokens.length) {
            const { data: valids } = await supabase
              .from('push_tokens')
              .select('token')
              .in('token', tokens)
              .eq('role', 'cliente')
              .eq('active', true)
              .eq('revoked', false);
            const safe = Array.from(
              new Set((valids ?? []).map((t: any) => t.token as string))
            );
            if (safe.length) {
              const mesaNumero = this.mesasNum.get(mesaId) ?? mesaId;
              let title = '';
              let body = '';
              if (estado === 'pagado') {
                title = 'Pago confirmado';
                body = `Mesa ${mesaNumero}: tu pago fue validado ✅`;
              } else if (estado === 'recibido') {
                title = 'Pedido Recibido';
                body = `Mesa ${mesaNumero}: tu pedido fue entregado`;
              } else {
                title =
                  estado === 'aceptado'
                    ? 'Pedido aceptado'
                    : 'Pedido rechazado';
                body =
                  estado === 'aceptado'
                    ? `Mesa ${mesaNumero}: tu pedido fue aceptado`
                    : `Mesa ${mesaNumero}: tu pedido fue rechazado. Podés modificarlo y reenviarlo`;
              }
              await this.push.send(safe, title, body, {
                tipo: 'pedido',
                pedidoId,
                mesaId,
                estado,
              });
            }
          }

          if (estado === 'aceptado') {
            const mesaNumero = this.mesasNum.get(mesaId);
            await this.notificarAreasNuevoPedido({
              id: pedidoId,
              mesa_id: mesaId,
              mesa_numero: mesaNumero,
            });
          }
        }
      } catch (e) { }

      const msg =
        estado === 'pagado'
          ? 'Pago validado'
          : estado === 'rechazado'
            ? 'Pedido rechazado'
            : estado === 'aceptado'
              ? 'Pedido aceptado'
              : estado === 'recibido'
                ? 'Pedido entregado'
                : 'Estado actualizado';

      (
        await this.toast.create({
          message: msg,
          duration: 1200,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
      await this.cargar();
    } finally {
      this.busy = false;
    }
  }

  canEliminar(p: any): boolean {
    return p.estado === 'aceptado' || p.estado === 'rechazado';
  }

  async eliminar(p: any) {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.pedidosSrv.eliminarPedido(p.id);
      this.pedidos = this.pedidos.filter((x) => x.id !== p.id);
      (
        await this.toast.create({
          message: 'Pedido eliminado',
          duration: 1200,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
      await this.cargar();
    } catch {
      (
        await this.toast.create({
          message: 'No se pudo eliminar',
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
    } finally {
      this.busy = false;
    }
  }

  async abrirChat(mesaId: number) {
    if (this.busy) return;

    this.mesaChatId = mesaId;

    if (!this.mesasNum.has(mesaId)) {
      const m = await this.mesasSrv.getById(mesaId);
      if (m) this.mesasNum.set(m.id!, m.numero!);
    }

    const chat = await this.chatSvc.getOrCreateForMesa(mesaId, "mozo");
    this.chatId = chat.id;

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    const seen = new Set<string>();
    this.messages = msgs.map((m) => {
      seen.add(m.id);
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      return { ...vm, role: vm.from === "yo" ? "mozo" : "cliente" };
    });
    this.scrollToBottomAfterRender();

    this.chatOpen = true;

    this.chatSvc.unsubscribe();

    // Suscripción realtime con filtro anti-duplicados
    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      // ⚙️ Evitar duplicados ya cargados
      if (seen.has(m.id)) return;
      seen.add(m.id);

      // Evitar duplicados visuales (por si el evento se repite)
      const yaExiste = this.messages.some((msg) => msg.id === m.id);
      if (yaExiste) return;

      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);

      // Insertar el mensaje en la lista visible
      this.messages.push({
        ...vm,
        role: vm.from === "yo" ? "mozo" : "cliente",
      });

      this.scrollToBottomAfterRender();
    });
  }

  private scrollToBottom(ms: number = 200) {
    try {
      this.chatContent?.scrollToBottom(ms);
    } catch { }
  }

  private scrollToBottomAfterRender() {
    requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0));
  }

  async cerrarChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatSvc.unsubscribe();

    await this.cargarInbox();
    this.inboxOpen = true;

    const modal = this.inboxModal;
    if (modal) {
      await modal.present();
    }
  }


  async enviar() {
    const t = this.newMsg.trim();
    if (!t || !this.chatId || !this.mesaChatId || this.busy) return;
    await this.chatSvc.sendMessage(this.chatId, t);
    this.newMsg = '';
  }

  async abrirInbox() {
    if (this.busy) return;
    await this.cargarInbox();
    this.inboxOpen = true;
  }

  async cerrarInbox() {
    await this.inboxModal?.dismiss();
    this.inboxOpen = false;
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private async cargarInbox() {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('chat_id, body, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    const dedup = new Map<
      string,
      { chatId: string; lastText: string; time: string }
    >();
    for (const m of msgs ?? []) {
      const id = (m as any).chat_id as string;
      if (!dedup.has(id)) {
        const dt = new Date((m as any).created_at as string);
        dedup.set(id, {
          chatId: id,
          lastText: (m as any).body as string,
          time: this.hhmm(dt),
        });
      }
    }
    const chatIds = Array.from(dedup.keys());
    if (!chatIds.length) {
      this.inbox = [];
      return;
    }
    const { data: chats } = await supabase
      .from('chats')
      .select('id, mesa_id')
      .in('id', chatIds);
    const byId = new Map<string, number>();
    (chats ?? []).forEach((c: any) =>
      byId.set(c.id as string, c.mesa_id as number)
    );
    const mesaIds = Array.from(
      new Set((chats ?? []).map((c: any) => c.mesa_id as number))
    );
    const mesas = await Promise.all(
      mesaIds.map((id) => this.mesasSrv.getById(id))
    );
    mesas.forEach((m) => {
      if (m) this.mesasNum.set(m.id!, m.numero!);
    });
    this.inbox = Array.from(dedup.values()).map((v) => {
      const mesaId = byId.get(v.chatId)!;
      return {
        chatId: v.chatId,
        mesaId,
        mesaNumero: this.mesasNum.get(mesaId),
        lastText: v.lastText,
        time: v.time,
      };
    });
  }

  async abrirDesdeInbox(item: { chatId: string; mesaId: number }) {
    await this.cerrarInbox();
    await this.abrirChat(item.mesaId);
  }

  async validarPago(pedidoId: string): Promise<void> {
    const { data: ped } = await supabase
      .from('pedidos')
      .select('mesa_id, cliente_email')
      .eq('id', pedidoId)
      .single();

    const mesaId = ped?.mesa_id as number;
    const mesaNumero = this.mesasNum.get(mesaId) ?? mesaId;

    await this.setEstado(pedidoId, 'pagado');

    try {
      await this.emitirFacturaYEnviar(pedidoId, ped?.cliente_email);
    } catch (e) {
      (await this.toast.create({
        message: "No se pudo enviar la factura",
        duration: 1500,
        position: "top",
        cssClass: "toast"
      })).present();
    }

    await this.push.sendToRoles(
      ['dueño', 'supervisor'],
      'Pago validado',
      `Pago Mesa (${mesaNumero}) Validado`,
      { tipo: 'pago_validado', pedidoId, mesaId, mesaNumero }
    );
  }

  private async notificarAreasNuevoPedido(p: any) {
    const pid = String(p?.id ?? '');
    if (!pid || this.sentNuevoPedido.has(pid)) return;
    this.sentNuevoPedido.add(pid);
    const mesaNumero = p?.mesa?.numero ?? p?.mesa_numero ?? p?.mesa_id ?? 'NN';
    const title = 'Nuevo pedido';
    const body = `Nuevo pedido mesa ${mesaNumero}`;
    const data = {
      tipo: 'nuevo_pedido',
      pedidoId: p?.id ?? null,
      mesaId: p?.mesa_id ?? p?.mesa?.id ?? null,
    };
    const { data: toks } = await supabase
      .from('push_tokens')
      .select('token')
      .in('role', ['bartender', 'cocinero'])
      .eq('active', true)
      .eq('revoked', false);
    const self = this.push.getToken?.() || null;
    const list = Array.from(
      new Set((toks ?? []).map((t: any) => t.token as string))
    ).filter((t) => (self ? t !== self : true));
    if (!list.length) return;
    if (typeof (this as any).push.sendToTokens === 'function') {
      await (this as any).push.sendToTokens(list, { title, body, data });
    } else if (typeof (this as any).push.send === 'function') {
      await (this as any).push.send(list, title, body, data);
    }
  }

  private async verificarPedidosCompletos() {
    const list = this.pedidos || [];
    for (const p of list) {
      const id = String(p?.id ?? '');
      if (!id || this.sentPedidoCompleto.has(id)) continue;
      const hasBar = p?.estadoBar != null && String(p.estadoBar).length > 0;
      const hasCocina = p?.estadoCocina != null && String(p.estadoCocina).length > 0;
      const doneBar = p?.estadoBar === 'terminado';
      const doneCocina = p?.estadoCocina === 'terminado';
      const ready =
        (hasBar && hasCocina && doneBar && doneCocina) ||
        (hasBar && !hasCocina && doneBar) ||
        (!hasBar && hasCocina && doneCocina);
      if (!ready) continue;
      this.sentPedidoCompleto.add(id);
    }
  }

  private async buildFacturaData(pedidoId: string, emailCliente: string): Promise<{
    data: FacturaData;
    fileName: string;
  }> {
    const { data: user } = await supabase
      .from("usuarios")
      .select("id, apellidos, nombres, numero_documento, numero_cuil")
      .eq("correo_electronico", emailCliente)
      .maybeSingle();

    const { data: ped } = await supabase
      .from("pedidos")
      .select("id, total")
      .eq("id", pedidoId)
      .maybeSingle();

    const { data: rows } = await supabase
      .from("pedido_items")
      .select("id, cantidad, precio_unit, nombre, producto_id")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending: true });

    let nombreCompleto = (user?.nombres + " " + user?.apellidos) || "";
    let cuitOdni = "";
    if (user !== null && user.numero_documento !== null) {
      cuitOdni = user.numero_documento;
    } else if (user !== null && user.numero_cuil !== null) {
      cuitOdni = user.numero_cuil;
    } else {
      cuitOdni = "";
    }

    const items: ItemFactura[] = (rows ?? []).map((r: any, i: number) => ({
      codigo: String(r?.producto_id ?? r?.id ?? i + 1),
      descripcion: String(r?.nombre ?? "Item"),
      cantidad: Number(r?.cantidad ?? 1),
      precioUnit: Number(r?.precio_unit ?? 0),
      subtotal: Number(r?.subtotal ?? (Number(r?.cantidad ?? 1) * Number(r?.precio_unit ?? 0)))
    }));

    const total = Number(ped?.total ?? items.reduce((a, b) => a + (b.subtotal || 0), 0));

    const fecha = new Date().toISOString().slice(0, 10);
    const fileName = `Factura_${fecha}_${nombreCompleto}_p${pedidoId}.pdf`;

    const data: FacturaData = {
      receptor: { cuitOdni: cuitOdni, nombreCompleto: nombreCompleto },
      items,
      totales: { total }
    };

    return { data, fileName };
  }

  private async emitirFacturaYEnviar(pedidoId: string, emailCliente: string): Promise<void> {
    const { data, fileName } = await this.buildFacturaData(pedidoId, emailCliente);
    if (!emailCliente) throw new Error("Email del cliente no disponible.");

    this.facturaData = data;
    this.cdr.detectChanges();
    await new Promise(r => setTimeout(r, 0));

    const el = this.facturaCmp.root.nativeElement;
    await this.waitForRender(el);
    const blob = await this.pdf.exportarA4(el, fileName);
    const base64 = await this.pdf.blobToBase64(blob);

    await this.email.enviarFacturaDescarga(emailCliente, {
      receptor: data.receptor,
      items: data.items.map(it => ({
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precioUnit: it.precioUnit,
        subtotal: it.subtotal
      })),
      total: data.totales.total,
      filename: fileName,
      pdfBase64: base64
    });

    (await this.toast.create({
      message: "Factura enviada correctamente",
      duration: 1500,
      position: "top",
      cssClass: "toast"
    })).present();

    this.facturaData = FACTURA_EMPTY;
  }

  private async waitForRender(el: HTMLElement) {
    await new Promise(r => requestAnimationFrame(r));
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
    const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(imgs.map(i => i.complete ? Promise.resolve() :
      new Promise(res => { i.onload = i.onerror = () => res(null); })));
  }

  private async validarEstadoAreas(
    pedidoId: string
  ): Promise<{ valido: boolean; mensaje: string }> {
    try {
      const [{ data: barPedido }, { data: cocinaPedido }] = await Promise.all([
        supabase
          .from('bar_pedidos')
          .select('estado')
          .eq('pedido_id', pedidoId)
          .maybeSingle(),
        supabase
          .from('cocina_pedidos')
          .select('estado')
          .eq('pedido_id', pedidoId)
          .maybeSingle(),
      ]);

      const hasBar = !!barPedido;
      const hasCocina = !!cocinaPedido;
      const doneBar = hasBar && barPedido.estado === 'terminado';
      const doneCocina = hasCocina && cocinaPedido.estado === 'terminado';

      const ready =
        (hasBar && hasCocina && doneBar && doneCocina) ||
        (hasBar && !hasCocina && doneBar) ||
        (!hasBar && hasCocina && doneCocina);

      if (!ready) {
        let mensaje = 'Falta terminar el pedido en ';

        if (hasBar && hasCocina) {
          if (!doneBar && !doneCocina) {
            mensaje += 'cocina y bar';
          } else if (!doneBar) {
            mensaje += 'bar';
          } else if (!doneCocina) {
            mensaje += 'cocina';
          }
        } else if (hasBar && !doneBar) {
          mensaje += 'bar';
        } else if (hasCocina && !doneCocina) {
          mensaje += 'cocina';
        } else {
          mensaje = 'El pedido no está listo para entregar';
        }

        return {
          valido: false,
          mensaje: mensaje,
        };
      }

      try {
        const { data: pedRow } = await supabase
          .from('pedidos')
          .select('id, mesa_id, mesas(numero)')
          .eq('id', pedidoId)
          .maybeSingle();
        const mesaId = pedRow?.mesa_id as number | undefined;
        const mesaNumero =
          mesaId != null ? this.mesasNum.get(mesaId) ?? mesaId : 'NN';
        await this.push.sendToRoles(
          ['mozo'],
          'Pedido listo',
          `Pedido Mesa (${mesaNumero}) entregado`,
          {
            tipo: 'pedido_listo',
            pedidoId,
            mesaId: mesaId ?? null,
            mesa: String(mesaNumero),
          }
        );
      } catch { }

      return {
        valido: true,
        mensaje: 'Pedido entregado',
      };
    } catch (error) {
      console.error('Error validando estado de áreas:', error);
      return {
        valido: false,
        mensaje: 'Error al verificar el estado del pedido',
      };
    }
  }
}