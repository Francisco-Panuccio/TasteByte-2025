import { AfterViewInit, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular';
import { Bebida } from 'src/app/interfaces/bebida';
import { ChatMessage } from 'src/app/interfaces/chat-message';
import { Mesa } from 'src/app/interfaces/mesa';
import { Plato } from 'src/app/interfaces/plato';
import { Bebidas } from 'src/app/services/bebidas/bebidas';
import { Chat } from 'src/app/services/chat/chat';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Platos } from 'src/app/services/platos/platos';

type Tab = "platos" | "bebidas" | "postres";

@Component({
  selector: 'app-mesa-ocupada',
  templateUrl: './mesa-ocupada.page.html',
  styleUrls: ['./mesa-ocupada.page.scss'],
  standalone: false
})
export class MesaOcupadaPage implements OnInit, OnDestroy, AfterViewInit {
  private mesasSrv = inject(Mesas);
  private platosSrv = inject(Platos);
  private bebidasSrv = inject(Bebidas);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  private chatSvc = inject(Chat);

  chatId?: string;
  myUserId?: string;
  error?: string;
  tab: Tab = "platos";
  mesaId?: number;
  mesa?: Mesa | null;
  platos: Plato[] = [];
  postres: Plato[] = [];
  bebidas: Bebida[] = [];
  mesaAsignada: boolean = false;
  loading: boolean = true;

  chatOpen: boolean = false;
  presentingEl?: HTMLElement;
  @ViewChild("chatContent") chatContent?: IonContent;
  messages: { id: string; from: "yo" | "mozo"; text: string; time: string }[] = [];
  newMsg: string = "";

  constructor() { }

  async ngOnInit() {
    try {
      const qp = this.route.snapshot.queryParamMap.get("tableId");
      const pp = this.route.snapshot.paramMap.get("id");
      this.mesaId = qp ? Number(qp) : (pp ? Number(pp) : undefined);
      if (!this.mesaId || Number.isNaN(this.mesaId)) throw new Error("Mesa inválida");

      this.mesa = await this.mesasSrv.getById(this.mesaId);
      if (!this.mesa) throw new Error("Mesa no encontrada");

      this.mesaAsignada = this.estaAsignada(this.mesa);

      const [allPlatos, bebidas] = await Promise.all([
        this.platosSrv.list(),
        this.bebidasSrv.list()
      ]);

      this.postres = allPlatos.filter(p => !!p.esPostre);
      this.platos = allPlatos.filter(p => !p.esPostre);
      this.bebidas = bebidas;

      this.myUserId = await this.chatSvc.getMyUserId();
      await this.ensureChatAndSubscribe();
    } catch (e: any) {
      this.error = e?.message || "Error cargando mesa";
      (await this.toast.create({ message: this.error, duration: 1500 })).present();
    } finally {
      setTimeout(() => (this.loading = false), 2000);
    }
  }

  ngAfterViewInit() { this.presentingEl = document.querySelector("ion-router-outlet") as HTMLElement; }

  ngOnDestroy() { this.chatSvc.unsubscribe(); }

  private estaAsignada(m: Mesa): boolean { return !!m; }

  private async ensureChatAndSubscribe(): Promise<void> {
    if (!this.mesaId) return;
    const chat = await this.chatSvc.getOrCreateForMesa(this.mesaId, "cliente");
    this.chatId = chat.id;

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map((m) => this.chatSvc.toViewMessage(m, this.myUserId!));
    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      this.messages.push(vm);

      if (!this.chatOpen) {
        (await this.toast.create({
          message: `Mozo: ${vm.text}`,
          duration: 2500,
          buttons: [{ text: "Abrir", handler: () => this.openChat() }]
        })).present();
      } else {
        this.scrollToBottom();
      }
    });
  }

  openChat() {
    this.chatOpen = true;
    this.scrollToBottomAfterRender();
  }

  async sendMessage() {
    const txt = this.newMsg.trim();
    if (!txt || !this.chatId) return;
    await this.chatSvc.sendMessage(this.chatId, txt);
    this.newMsg = "";
    this.scrollToBottomAfterRender();
  }

  trackMsg = (_: number, m: { id: string }) => m.id;

  private scrollToBottom(ms: number = 200) {
    try {
      this.chatContent?.scrollToBottom(ms);
    } catch { }
  }

  private scrollToBottomAfterRender() {
    requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0));
  }
}
