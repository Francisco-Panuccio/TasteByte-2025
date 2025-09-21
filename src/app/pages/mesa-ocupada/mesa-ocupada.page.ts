import { AfterViewInit, Component, inject, NgZone, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { IonContent, IonModal, Platform, ToastController } from "@ionic/angular";
import { Bebida } from "src/app/interfaces/bebida";
import { ChatMessage } from "src/app/interfaces/chat-message";
import { Mesa } from "src/app/interfaces/mesa";
import { Plato } from "src/app/interfaces/plato";
import { Bebidas } from "src/app/services/bebidas/bebidas";
import { Chat } from "src/app/services/chat/chat";
import { Mesas } from "src/app/services/mesas/mesas";
import { Platos } from "src/app/services/platos/platos";
import { supabase } from "src/supabase.client";
import { Keyboard } from "@capacitor/keyboard";
import { Pedidos } from "src/app/services/pedidos/pedidos";

type Tab = "platos" | "bebidas" | "postres";
type AddItem = {
  id: number;
  nombre: string;
  precio: number;
  duracionMin: number;
  tipo: "plato" | "bebida" | "postre";
};

@Component({
  selector: "app-mesa-ocupada",
  templateUrl: "./mesa-ocupada.page.html",
  styleUrls: ["./mesa-ocupada.page.scss"],
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
  private seenIds = new Set<string>();
  private unsubEstado?: () => void;

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

  constructor(private platform: Platform, private zone: NgZone) {}

  async ngOnInit() {
    const sub = this.platform.backButton.subscribeWithPriority(9999, () => {
      if (this.kbOpen) { Keyboard.hide(); return; }
      if (this.chatOpen) { this.closeChat(); return; }
    });
    this.backUnsub = () => sub.unsubscribe();

    try {
      // ✅ Ahora solo usamos "mesaId" de queryParams
      const qp = this.route.snapshot.queryParamMap.get("mesaId");
      this.mesaId = qp ? Number(qp) : undefined;

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
  ngOnDestroy() { this.chatSvc.unsubscribe(); this.backUnsub?.(); this.unsubEstado?.(); }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private async ensureChatAndSubscribe(): Promise<void> {
    if (!this.mesaId) return;
    const chat = await this.chatSvc.getOrCreateForMesa(this.mesaId, "cliente");
    this.chatId = chat.id;

    const msgs = await this.chatSvc.loadMessages(chat.id, 200);
    this.seenIds.clear();
    this.messages = msgs.map(m => {
      this.seenIds.add(m.id);
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role = vm.from === "yo" ? "cliente" : "mozo";
      return { ...vm, role };
    });
    this.scrollToBottomAfterRender();

    this.chatSvc.subscribeToMessages(chat.id, async (m: ChatMessage) => {
      if (this.seenIds.has(m.id)) return;
      this.seenIds.add(m.id);
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
    if (this.submitting || !this.chatReady) return;
    const txt = this.newMsg.trim();
    if (!txt || !this.chatId) return;

    const tempId = "temp-" + Date.now();
    const now = new Date();
    this.messages.push({
      id: tempId,
      from: "yo",
      role: "cliente",
      text: txt,
      time: this.hhmm(now)
    });
    this.scrollToBottomAfterRender();
    this.newMsg = "";

    const saved = await this.chatSvc.sendMessage(this.chatId, txt);
    const vm = this.chatSvc.toViewMessage(saved, this.myUserId!);
    const role: "mozo" | "cliente" = "cliente";
    const idx = this.messages.findIndex(m => m.id === tempId);
    if (idx >= 0) {
      this.messages[idx] = { id: vm.id, from: vm.from, role, text: vm.text, time: vm.time };
    } else {
      if (!this.seenIds.has(saved.id)) {
        this.messages.push({ id: vm.id, from: vm.from, role, text: vm.text, time: vm.time });
      }
    }
    this.seenIds.add(saved.id);
  }

  trackMsg = (_: number, m: { id: string }) => m.id;
  private scrollToBottom(ms: number = 200) { try { this.chatContent?.scrollToBottom(ms); } catch {} }
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

  private formatARS(n: number): string {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", currencyDisplay: "symbol" }).format(n);
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

      const mesaNumero = this.mesa?.numero ?? "NN";
      await this.chatSvc.notifyMozosNuevoPedido(
        mesaNumero as any,
        this.formatARS(this.total),
        pedidoId,
        this.mesaId
      );

      this.unsubEstado = this.pedidos.onEstadoPedido(pedidoId, async (estado) => {
        this.zone.run(async () => {
          if (estado === "aceptado") {
            this.router.navigate(["/pedido", pedidoId]);
          } else if (estado === "rechazado") {
            this.submitting = false;
            (await this.toast.create({
              message: "Tu pedido fue rechazado. Podés modificarlo y reenviarlo.",
              duration: 2000,
              position: "top",
              cssClass: "toast"
            })).present();
          }
        });
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
