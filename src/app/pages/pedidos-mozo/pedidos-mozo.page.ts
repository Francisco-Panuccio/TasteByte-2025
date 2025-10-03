import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonModal, ToastController } from '@ionic/angular';
import { Chat } from 'src/app/services/chat/chat';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Pedidos } from 'src/app/services/pedidos/pedidos';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';

type Filtro =
  | 'todos'
  | 'pendiente'
  | 'aceptado'
  | 'rechazado'
  | 'terminado'
  | 'impagado';

@Component({
  selector: 'app-pedidos-mozo',
  templateUrl: './pedidos-mozo.page.html',
  styleUrls: ['./pedidos-mozo.page.scss'],
  standalone: false,
})
export class PedidosMozoPage implements OnInit {
  private pedidosSrv = inject(Pedidos);
  private chatSvc = inject(Chat);
  private toast = inject(ToastController);
  private mesasSrv = inject(Mesas);
  private push = inject(Push);

  filtro: Filtro = 'todos';
  loading = true;
  busy = false;

  pedidos: any[] = [];
  sub?: any;

  chatOpen = false;
  @ViewChild('chatModal', { read: IonModal }) chatModal?: IonModal;
  @ViewChild('chatContent') chatContent?: IonContent;
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

  async ngOnInit() {
    console.log('🟢 INIT PedidosMozoPage');
    await this.ensureMozo();
    this.myUserId = await this.chatSvc.getMyUserId();
    await this.cargar();
    this.sub = this.pedidosSrv.subscribeCambios(() => this.cargar());
    await this.push.init(undefined, 'mozo');
    await this.push.ready();
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

  ngOnDestroy() {
    this.sub?.unsubscribe?.();
    this.chatSvc.unsubscribe();
  }

  private async ensureMozo() {
    const { data } = await supabase.auth.getUser();
    console.log('👤 mozo user:', data?.user?.id);
    if (!data.user) throw new Error('Auth requerida');
  }

  async cargar() {
    this.loading = true;
    try {
      console.log('📥 cargar() filtro=', this.filtro);
      this.pedidos = await this.pedidosSrv.listar(
        this.filtro === 'todos' ? undefined : (this.filtro as any)
      );
      console.log('📦 pedidos=', this.pedidos);

      const ids = Array.from(
        new Set(this.pedidos.map((p) => p.mesa_id))
      ).filter(Boolean) as number[];
      console.log('📌 mesa_ids en pedidos=', ids);

      const mesas = await Promise.all(
        ids.map((id) => this.mesasSrv.getById(id))
      );
      mesas.forEach((m) => {
        if (m) {
          this.mesasNum.set(m.id!, m.numero!);
          console.log(`✅ mesa cargada: id=${m.id} num=${m.numero}`);
        }
      });
    } finally {
      this.loading = false;
    }
  }

  async setEstado(
    pedidoId: string,
    estado: 'aceptado' | 'rechazado' | 'pagado'
  ) {
    if (this.busy) return;
    this.busy = true;
    try {
      console.log('⚡ setEstado()', { pedidoId, estado });
      await this.pedidosSrv.actualizarEstado(pedidoId, estado as any);

      try {
        const { data: ped } = await supabase
          .from('pedidos')
          .select('mesa_id')
          .eq('id', pedidoId)
          .single();
        const mesaId = ped?.mesa_id as number | undefined;
        console.log('📌 pedido→mesaId:', mesaId);

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
                .eq('active', true)
                .eq('revoked', false);
              tokens = (toks ?? []).map((t: any) => t.token as string);
            }
          }

          console.log('📨 tokens a notificar:', tokens);

          if (estado === 'pagado') {
          console.log('🧹 Liberando mesa', mesaId);
          await this.mesasSrv.liberarMesa(mesaId);
          }

          if (tokens.length) {
            const mesaNumero = this.mesasNum.get(mesaId) ?? mesaId;
            let title = '';
            let body = '';
            if (estado === 'pagado') {
              title = 'Pago confirmado';
              body = `Mesa ${mesaNumero}: tu pago fue validado ✅`;
            } else if (estado === 'rechazado') {
              title = 'Pago rechazado';
              body = `Mesa ${mesaNumero}: hubo un problema con tu pago ❌`;
            } else {
              title =
                estado === 'aceptado' ? 'Pedido aceptado' : 'Pedido rechazado';
              body =
                estado === 'aceptado'
                  ? `Mesa ${mesaNumero}: tu pedido fue aceptado`
                  : `Mesa ${mesaNumero}: tu pedido fue rechazado. Podés modificarlo y reenviarlo`;
            }
            await this.push.send(tokens, title, body, {
              tipo: 'pedido',
              pedidoId,
              mesaId,
              estado,
            });
          }
        }
      } catch (e) {
        console.log('⚠️ sub-bloque notificaciones/liberar mesa falló:', e);
      }

      const msg =
        estado === 'pagado'
          ? 'Pago validado'
          : estado === 'rechazado'
          ? 'Pago rechazado'
          : estado === 'aceptado'
          ? 'Pedido aceptado'
          : 'Pedido rechazado';

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
      if (m) this.mesasNum.set(mesaId, m.numero!);
    }
    const chat = await this.chatSvc.getOrCreateForMesa(mesaId, 'mozo');
    this.chatId = chat.id;
    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map((m) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      return { ...vm, role: vm.from === 'yo' ? 'mozo' : 'cliente' };
    });
    this.chatOpen = true;
    this.scrollToBottomAfterRender();
    this.chatSvc.unsubscribe();
    this.chatSvc.subscribeToMessages(chat.id, (m) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      this.messages.push({
        ...vm,
        role: vm.from === 'yo' ? 'mozo' : 'cliente',
      });
      this.scrollToBottomAfterRender();
    });
  }

  private scrollToBottom(ms: number = 200) {
    try {
      this.chatContent?.scrollToBottom(ms);
    } catch {}
  }
  private scrollToBottomAfterRender() {
    requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0));
  }

  async cerrarChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatSvc.unsubscribe();
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

  async validarPago(pedidoId: string) {
    console.log('👉 validarPago', pedidoId);
    await this.setEstado(pedidoId, 'pagado');
  }

  async rechazarPago(pedidoId: string) {
    console.log('👉 rechazarPago', pedidoId);
    await this.setEstado(pedidoId, 'rechazado');
  }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({ message: mensaje, duration: 2500, color, cssClass: 'toast2', position: 'bottom', buttons: [{ text: 'OK', role: 'cancel' }] });
    await t.present();
  }
}
