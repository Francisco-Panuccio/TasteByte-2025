import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { IonModal, ToastController } from '@ionic/angular';
import { Chat } from 'src/app/services/chat/chat';
import { Pedidos } from 'src/app/services/pedidos/pedidos';
import { supabase } from 'src/supabase.client';

type Filtro = "todos" | "pendiente" | "aceptado" | "rechazado" | "derivado";

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

  filtro: Filtro = "todos";
  loading = true;
  pedidos: any[] = [];
  sub?: any;

  chatOpen = false;
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  messages: any[] = [];
  newMsg = "";
  chatId?: string;
  myUserId?: string;
  myName = "Mozo";
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
    } finally {
      this.loading = false;
    }
  }

  async setEstado(pedidoId: string, estado: "aceptado" | "rechazado") {
    await this.pedidosSrv.actualizarEstado(pedidoId, estado as any);
    const msg = estado === "aceptado" ? "Pedido aceptado" : "Pedido rechazado";
    (await this.toast.create({ message: msg, duration: 1200, position: "top" })).present();
  }

  async abrirChat(mesaId: number) {
    this.mesaChatId = mesaId;
    const chat = await this.chatSvc.getOrCreateForMesa(mesaId, "mozo");
    this.chatId = chat.id;
    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map(m => this.chatSvc.toViewMessage(m, this.myUserId!));
    this.chatOpen = true;

    this.chatSvc.subscribeToMessages(chat.id, (m) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      this.messages.push(vm);
    });
  }

  async cerrarChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatSvc.unsubscribe();
  }

  async enviar() {
    const t = this.newMsg.trim();
    if (!t || !this.chatId) return;
    await this.chatSvc.sendMessage(this.chatId, t);
    this.newMsg = "";
  }
}
