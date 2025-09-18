import { AfterViewInit, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonModal, Platform, ToastController } from '@ionic/angular';
import { Bebida } from 'src/app/interfaces/bebida';
import { ChatMessage } from 'src/app/interfaces/chat-message';
import { Mesa } from 'src/app/interfaces/mesa';
import { Plato } from 'src/app/interfaces/plato';
import { Bebidas } from 'src/app/services/bebidas/bebidas';
import { Chat } from 'src/app/services/chat/chat';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Platos } from 'src/app/services/platos/platos';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { supabase } from 'src/supabase.client';
import { Keyboard } from "@capacitor/keyboard";

type Tab = "platos" | "bebidas" | "postres";
type Role = "cliente" | "mozo";

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
  private usuariosSrv = inject(Usuarios);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  private chatSvc = inject(Chat);

  private kbOpen = false;
  private backUnsub?: () => void;
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
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  messages: { id: string; from: "yo" | "mozo"; role: "mozo" | "cliente"; text: string; time: string }[] = [];
  newMsg: string = "";

  role!: Role;
  myName: string = "Mozo NN";

  constructor(private platform: Platform) { }

  async ngOnInit() {
    const sub = this.platform.backButton.subscribeWithPriority(9999, () => {
      if (this.kbOpen) { Keyboard.hide(); return; }
      if (this.chatOpen) { this.closeChat(); return; }
    });
    this.backUnsub = () => sub.unsubscribe();

    try {
      const qp = this.route.snapshot.queryParamMap.get("tableId");
      const pp = this.route.snapshot.paramMap.get("id");
      this.mesaId = qp ? Number(qp) : (pp ? Number(pp) : undefined);
      if (!this.mesaId || Number.isNaN(this.mesaId)) throw new Error("Mesa inválida");

      await this.resolveViewerFromDB();

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

  ngOnDestroy() {
    this.chatSvc.unsubscribe();
    this.backUnsub?.();
  }

  private estaAsignada(m: Mesa): boolean { return !!m; }

  private async resolveViewerFromDB(): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const email = auth.user?.email?.toLowerCase();
    if (!email) { this.role = "cliente"; this.myName = "Cliente"; return; }

    const u = await this.usuariosSrv.getByEmail(email);
    if (u) {
      const nombres = (u as any).nombres ?? "";
      const apellidos = (u as any).apellidos ?? "";
      const perfil = String((u as any).perfil ?? "").trim().toLowerCase();
      this.myName = `${nombres} ${apellidos}`.trim() || this.myName;
      this.role = (u as any).perfil === "mozo" ? "mozo" : "cliente";
    } else {
      this.role = "cliente";
      this.myName = "Cliente";
    }
  }

  private msgRole(from: "yo" | "mozo"): "mozo" | "cliente" {
    return from === "yo" ? this.role : (this.role === "mozo" ? "cliente" : "mozo");
  }

  private async ensureChatAndSubscribe(): Promise<void> {
    if (!this.mesaId) return;
    const chat = await this.chatSvc.getOrCreateForMesa(this.mesaId, this.role);
    this.chatId = chat.id;

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map(m => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      return { ...vm, role: this.msgRole(vm.from) };
    });
    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      this.messages.push({ ...vm, role: this.msgRole(vm.from) });
      const senderLabel = this.role === "mozo" ? "Cliente" : "Mozo";
      if (!this.chatOpen) {
        (await this.toast.create({
          message: `${senderLabel}: ${vm.text}`,
          duration: 3000,
          position: "top",
          cssClass: "toast",
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

  async closeChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
  }

  async sendMessage() {
    const txt = this.newMsg.trim();
    if (!txt || !this.chatId) return;
    await this.chatSvc.sendMessage(this.chatId, txt);

    try {
      const to = this.role === "cliente"
        ? await this.chatSvc.getMozosTokens()
        : await this.chatSvc.getClienteTokenByMesa(this.mesaId!);

      await fetch("https://uvjesmdiovtkdgxobvhs.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          data: {
            kind: "chat",
            chatId: this.chatId,
            mesaId: this.mesaId,
            fromRole: this.role,
            fromName: this.myName,
            preview: txt.slice(0, 80)
          }
        })
      });
    } catch { }

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
