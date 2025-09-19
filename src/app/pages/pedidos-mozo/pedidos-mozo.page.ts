import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { IonContent, IonModal, ToastController } from '@ionic/angular';
import { Chat } from 'src/app/services/chat/chat';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Pedidos } from 'src/app/services/pedidos/pedidos';
import { supabase } from 'src/supabase.client';

type Filtro = "todos" | "pendiente" | "aceptado" | "rechazado";

@Component({
  selector: 'app-pedidos-mozo',
  templateUrl: './pedidos-mozo.page.html',
  styleUrls: ['./pedidos-mozo.page.scss'],
  standalone: false
})
export class PedidosMozoPage implements OnInit {
  private pedidosSrv = inject(Pedidos);
  private chatSvc = inject(Chat);
  private toast = inject(ToastController);
  private mesasSrv = inject(Mesas);

  filtro: Filtro = "todos";
  loading = true;
  pedidos: any[] = [];
  sub?: any;

  chatOpen = false;
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  @ViewChild("chatContent") chatContent?: IonContent;
  messages: any[] = [];
  newMsg = "";
  chatId?: string;
  myUserId?: string;
  myName = "Mozo";
  mesasNum = new Map<number, number>();
  mesaChatId?: number;

  async ngOnInit() {
    await this.ensureMozo();
    this.myUserId = await this.chatSvc.getMyUserId();
    await this.cargar();
    this.sub = this.pedidosSrv.subscribeCambios(() => this.cargar());
  }

  ngOnDestroy() { this.sub?.unsubscribe?.(); this.chatSvc.unsubscribe(); }

  private async ensureMozo() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Auth requerida");
  }

  async cargar() {
    this.loading = true;
    try {
      this.pedidos = await this.pedidosSrv.listar(this.filtro === "todos" ? undefined : this.filtro as any);
      const ids = Array.from(new Set(this.pedidos.map(p => p.mesa_id))).filter(Boolean) as number[];
      const mesas = await Promise.all(ids.map(id => this.mesasSrv.getById(id)));
      mesas.forEach(m => { if (m) this.mesasNum.set(m.id!, m.numero!); });
    } finally {
      this.loading = false;
    }
  }

  async setEstado(pedidoId: string, estado: "aceptado" | "rechazado") {
    await this.pedidosSrv.actualizarEstado(pedidoId, estado as any);
    const msg = estado === "aceptado" ? "Pedido Aceptado" : "Pedido Rechazado";
    (await this.toast.create({ message: msg, duration: 1200, position: "top", cssClass: "toast" })).present();
  }

  async abrirChat(mesaId: number) {
    this.mesaChatId = mesaId;
    if (!this.mesasNum.has(mesaId)) {
      const m = await this.mesasSrv.getById(mesaId);
      if (m) this.mesasNum.set(mesaId, m.numero!);
    }

    const chat = await this.chatSvc.getOrCreateForMesa(mesaId, "mozo");
    this.chatId = chat.id;
    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map(m => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      return { ...vm, role: vm.from === 'yo' ? 'mozo' : 'cliente' };
    });
    this.chatOpen = true;
    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, (m) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      this.messages.push({ ...vm, role: vm.from === 'yo' ? 'mozo' : 'cliente' });
      this.scrollToBottomAfterRender();
    });
  }

  private scrollToBottom(ms: number = 200) { try { this.chatContent?.scrollToBottom(ms); } catch { } }

  private scrollToBottomAfterRender() { requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0)); }

  async cerrarChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatSvc.unsubscribe();
  }

  async enviar() {
    const t = this.newMsg.trim();
    if (!t || !this.chatId || !this.mesaChatId) return;

    await this.chatSvc.sendMessage(this.chatId, t);
    this.newMsg = "";

    try {
      const to = await this.chatSvc.getClienteTokenByMesa(this.mesaChatId);
      await fetch("https://uvjesmdiovtkdgxobvhs.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          data: {
            kind: "chat",
            chatId: this.chatId,
            mesaId: this.mesaChatId,
            fromRole: "mozo",
            fromName: this.myName,
            preview: t.slice(0, 80)
          }
        })
      });
    } catch { }
  }
}
