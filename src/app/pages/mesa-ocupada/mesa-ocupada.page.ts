import { AfterViewInit, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonModal, Platform, ToastController } from '@ionic/angular';
import { Bebida } from 'src/app/interfaces/bebida';
import { ChatMessage } from 'src/app/interfaces/chat-message';
import { Mesa } from 'src/app/interfaces/mesa';
import { Plato } from 'src/app/interfaces/plato';
import { Bebidas } from 'src/app/services/bebidas/bebidas';
import { Chat } from 'src/app/services/chat/chat';
import { Mesas } from 'src/app/services/mesas/mesas';
import { Platos } from 'src/app/services/platos/platos';
import { supabase } from 'src/supabase.client';
import { Keyboard } from "@capacitor/keyboard";
import { Pedidos } from 'src/app/services/pedidos/pedidos';

type Tab = "platos" | "bebidas" | "postres";
type AddItem = {
  id: number;
  nombre: string;
  precio: number;
  duracionMin: number;
  tipo: "plato" | "bebida" | "postre";
};

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
  private router = inject(Router);
  private pedidos = inject(Pedidos);

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
  submitting: boolean = false;
  chatReady: boolean = false;

  chatOpen: boolean = false;
  presentingEl?: HTMLElement;
  @ViewChild("chatContent") chatContent?: IonContent;
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  messages: { id: string; from: "yo" | "mozo"; role: "mozo" | "cliente"; text: string; time: string }[] = [];
  newMsg: string = "";

  myName: string = "Cliente";

  qtyMap = new Map<number, number>();
  itemsSel: {
    productoId: number;
    tipo: "plato" | "bebida" | "postre";
    nombre: string;
    precioUnit: number;
    cantidad: number;
    duracionMin: number;
  }[] = [];
  total = 0;
  etaMin = 0;
  userUid: string = "";

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

      this.mesa = await this.mesasSrv.getById(this.mesaId);
      if (!this.mesa) throw new Error("Mesa no encontrada");

      this.mesaAsignada = !!this.mesa;

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
  ngOnDestroy() { this.chatSvc.unsubscribe(); this.backUnsub?.(); }

  private async ensureChatAndSubscribe(): Promise<void> {
    if (!this.mesaId) return;
    const chat = await this.chatSvc.getOrCreateForMesa(this.mesaId, "cliente");
    this.chatId = chat.id;

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.messages = msgs.map(m => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === "yo" ? "cliente" : "mozo";
      return { ...vm, role };
    });
    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === "yo" ? "cliente" : "mozo";
      this.messages.push({ ...vm, role });
      if (!this.chatOpen) {
        (await this.toast.create({
          message: `${role === "mozo" ? "Mozo" : "Cliente"}: ${vm.text}`,
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

  async openChat() {
    if (this.submitting) return;

    if (!this.chatId && this.mesaId) {
      const chat = await this.chatSvc.getOrCreateForMesa(this.mesaId, "cliente");
      this.chatId = chat.id;
    }

    const msgs = await this.chatSvc.loadMessages(this.chatId!, 200);
    this.messages = msgs.map(m => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === "yo" ? "cliente" : "mozo";
      return { ...vm, role };
    });

    this.chatSvc.unsubscribe();
    this.chatSvc.subscribeToMessages(this.chatId!, (m: ChatMessage) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === "yo" ? "cliente" : "mozo";
      this.messages.push({ ...vm, role });
      this.scrollToBottomAfterRender();
    });

    this.chatOpen = true;
    this.chatReady = true;
    this.scrollToBottomAfterRender();
  }

  async closeChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatReady = false;
    this.chatSvc.unsubscribe();
  }

  async sendMessage() {
    if (this.submitting || !this.chatReady) return;
    const txt = this.newMsg.trim();
    if (!txt || !this.chatId) return;

    const now = new Date();
    this.messages.push({
      id: 'temp-' + now.getTime(),
      from: 'yo',
      role: 'cliente',
      text: txt,
      time: now.toLocaleTimeString()
    });
    this.scrollToBottomAfterRender();
    this.newMsg = "";

    await this.chatSvc.sendMessage(this.chatId, txt);

    try {
      const to = await this.chatSvc.getMozosTokens();
      await fetch("https://uvjesmdiovtkdgxobvhs.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          data: {
            kind: "chat",
            chatId: this.chatId,
            mesaId: this.mesaId,
            fromRole: "cliente",
            fromName: this.myName,
            preview: txt.slice(0, 80)
          }
        })
      });
    } catch { }
  }

  trackMsg = (_: number, m: { id: string }) => m.id;
  private scrollToBottom(ms: number = 200) { try { this.chatContent?.scrollToBottom(ms); } catch { } }
  private scrollToBottomAfterRender() { requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0)); }

  incByPlato(p: Plato) {
    if (this.submitting) return;
    const id = p.id!;
    const prev = this.qtyMap.get(id) || 0;
    this.qtyMap.set(id, prev + 1);
    this.syncItems();
  }

  decById(id: number) {
    if (this.submitting) return;
    const prev = this.qtyMap.get(id) || 0;
    if (prev <= 0) return;
    this.qtyMap.set(id, prev - 1);
    this.syncItems();
  }

  inc(p: AddItem): void {
    if (this.submitting) return;
    const prev = this.qtyMap.get(p.id) || 0;
    this.qtyMap.set(p.id, prev + 1);
    this.syncItems();
  }

  dec(id: number): void {
    if (this.submitting) return;
    this.decById(id);
  }

  private syncItems() {
    const arr: {
      productoId: number; tipo: "plato" | "bebida" | "postre"; nombre: string;
      precioUnit: number; cantidad: number; duracionMin: number;
    }[] = [];
    let total = 0, maxDur = 0, penalty = 0;

    const acumPlatos = (list: Plato[], tipo: "plato" | "postre") => {
      for (const p of list) {
        if (p.id == null) continue;
        const q = this.qtyMap.get(p.id) || 0;
        if (q > 0) {
          arr.push({ productoId: p.id, tipo, nombre: p.nombre, precioUnit: p.precio, cantidad: q, duracionMin: p.tiempo_elaboracion_min });
          total += p.precio * q;
          maxDur = Math.max(maxDur, p.tiempo_elaboracion_min);
          if (q > 2 && p.tiempo_elaboracion_min > 0) penalty += (q - 2) * (p.tiempo_elaboracion_min / 2);
        }
      }
    };

    const acumBebidas = (list: Bebida[]) => {
      for (const b of list) {
        const id = (b as any).id as number | undefined;
        if (id == null) continue;
        const q = this.qtyMap.get(id) || 0;
        if (q > 0) {
          const precio = (b as any).precio as number;
          const dur = ((b as any).tiempo_elaboracion_min ?? 0) as number;
          arr.push({ productoId: id, tipo: "bebida", nombre: (b as any).nombre as string, precioUnit: precio, cantidad: q, duracionMin: dur });
          total += precio * q;
          maxDur = Math.max(maxDur, dur);
          if (q > 2 && dur > 0) penalty += (q - 2) * (dur / 2);
        }
      }
    };

    acumPlatos(this.platos, "plato");
    acumPlatos(this.postres, "postre");
    acumBebidas(this.bebidas);

    this.itemsSel = arr;
    this.total = Number(total.toFixed(2));
    this.etaMin = arr.length ? Math.round(maxDur + 10 + penalty) : 0;
  }

  async terminarPedido() {
    try {
      if (!this.itemsSel.length) return;
      if (!this.mesaId) throw new Error("Mesa inválida.");

      this.submitting = true;

      if (!this.userUid) {
        const { data } = await supabase.auth.getUser();
        this.userUid = data.user?.id ?? "";
      }

      const pedidoId = await this.pedidos.crearPedido(
        this.mesaId,
        this.userUid,
        this.itemsSel,
        this.total,
        this.etaMin
      );

      this.pedidos.onEstadoPedido(pedidoId, async (estado) => {
        if (estado === 'aceptado') {
          this.router.navigate(['/pedido', pedidoId]);
        } else if (estado === 'rechazado') {
          this.submitting = false;
          (await this.toast.create({
            message: 'Tu pedido fue rechazado. Podés modificarlo y reenviarlo.',
            duration: 2000,
            position: 'top',
            cssClass: 'toast'
          })).present();
        }
      });

      const to = await this.chatSvc.getMozosTokens();
      await fetch("https://uvjesmdiovtkdgxobvhs.supabase.co/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          title: "Nuevo pedido",
          body: `Mesa ${this.mesa?.numero ?? "NN"} espera confirmación`,
          sticky: true,
          actions: [{ title: "Aceptar", action: "ACCEPT" }, { title: "Rechazar", action: "REJECT" }],
          data: { tipo: "pedido", pedidoId, mesaId: this.mesaId }
        })
      });

      (await this.toast.create({
        message: "Pedido enviado. Esperando confirmación del mozo.",
        duration: 2000,
        position: "top",
        cssClass: "toast"
      })).present();

    } catch (e: any) {
      (await this.toast.create({
        message: e?.message ?? "Error al enviar pedido",
        duration: 1800,
        position: "top"
      })).present();
      this.submitting = false;
    }
  }
}