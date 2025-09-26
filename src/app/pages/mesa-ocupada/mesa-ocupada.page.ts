import { AfterViewInit, Component, inject, NgZone, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { IonContent, IonModal, NavController, Platform, ToastController } from "@ionic/angular";
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
import { Push } from "src/app/services/push/push";

type Tab = "platos" | "bebidas" | "postres";
type AddItem = { id: number; nombre: string; precio: number; duracionMin: number; tipo: "plato" | "bebida" | "postre" };
type Estado = "pendiente" | "aceptado" | "rechazado" | "terminado";

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
  private push = inject(Push);

  private kbOpen = false;
  private backUnsub?: () => void;
  private seenIds = new Set<string>();
  private unsubEstado?: () => void;
  private despachados = new Set<string>();

  chatId?: string;
  myUserId?: string;
  error?: string;
  tab: Tab = "platos";
  mesaId?: number;
  mesa?: Mesa | null;
  platos: Plato[] = [];
  postres: Plato[] = [];
  bebidas: Bebida[] = [];
  mesaAsignada = false;
  loading = true;
  submitting = false;
  chatReady = false;

  chatOpen = false;
  presentingEl?: HTMLElement;
  @ViewChild("chatContent") chatContent?: IonContent;
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  messages: { id: string; from: "yo" | "mozo"; role: "mozo" | "cliente"; text: string; time: string }[] = [];
  newMsg = "";
  myName = "Cliente";

  qtyMap = new Map<number, number>();
  itemsSel: { productoId: number; tipo: "plato" | "bebida" | "postre"; nombre: string; precioUnit: number; cantidad: number; duracionMin: number }[] = [];
  total = 0;
  etaMin = 0;
  userUid = "";

  pedidoEnCurso = false;
  pedidoActualId?: string;
  estadoPedido: Estado | null = null;
  bannerMsg = "";
  clienteEmail: string | null = null;

  plato?: { titulo: string; total: number; cantidad: number; items: Array<{ nombre: string; cantidad: number; precioUnit: number; duracionMin: number; subtotal: number }> };
  bebidaObj?: { titulo: string; total: number; cantidad: number; items: Array<{ nombre: string; cantidad: number; precioUnit: number; duracionMin: number; subtotal: number }> };

  constructor(private platform: Platform, private zone: NgZone, private navCtrl: NavController) {}

  async ngOnInit() {
    const sub = this.platform.backButton.subscribeWithPriority(9999, () => {
      if (this.kbOpen) { Keyboard.hide(); return; }
      if (this.chatOpen) { this.closeChat(); return; }
    });
    this.backUnsub = () => sub.unsubscribe();
    try {
      const qp = this.route.snapshot.queryParamMap.get("mesaId");
      const anonimoId = this.route.snapshot.queryParamMap.get("anonimoId");
      this.mesaId = qp ? Number(qp) : undefined;
      if (!this.mesaId || Number.isNaN(this.mesaId)) throw new Error("Mesa inválida");
      this.mesa = await this.mesasSrv.getById(this.mesaId);
      if (!this.mesa) throw new Error("Mesa no encontrada");
      this.mesaAsignada = !!this.mesa;
      const [allPlatos, bebidas] = await Promise.all([this.platosSrv.list(), this.bebidasSrv.list()]);
      this.postres = allPlatos.filter(p => !!p.esPostre);
      this.platos = allPlatos.filter(p => !p.esPostre);
      this.bebidas = bebidas;
      const { data: au } = await supabase.auth.getUser();
      this.userUid = au.user?.id ?? "";
      this.clienteEmail = au.user?.email ?? null;
      this.myUserId = anonimoId ? `anon-${anonimoId}` : await this.chatSvc.getMyUserId();
      await this.push.init(undefined, "cliente");
      await this.push.ready();
      await this.detectarYPoblarPedido();
      await this.ensureChatAndSubscribe();
    } catch (e: any) {
      this.error = e?.message || "Error cargando mesa";
      (await this.toast.create({ message: this.error, duration: 1500 })).present();
    } finally {
      setTimeout(() => (this.loading = false), 2000);
    }
  }

  private applyEstado(raw: any) {
    const norm = (raw ?? "").toString().trim().toLowerCase();
    const ok = ["pendiente", "aceptado", "rechazado", "terminado"] as const;
    this.estadoPedido = (ok as readonly string[]).includes(norm) ? (norm as Estado) : null;
    this.updateBanner();
  }

  private updateBanner(): void {
    switch (this.estadoPedido) {
      case "pendiente":
      case "aceptado":
        this.bannerMsg = "Pedido en curso, espere por favor.";
        break;
      case "terminado":
        this.bannerMsg = "Pedido entregado, disfrute su comida";
        break;
      default:
        this.bannerMsg = "";
    }
  }

  private async detectarYPoblarPedido(): Promise<void> {
    if (!this.mesaId) return;
    const activo = await this.pedidos.getPedidoActivo({ mesaId: this.mesaId, clienteUid: this.userUid || undefined, clienteEmail: this.clienteEmail || undefined });
    if (activo) {
      this.pedidoEnCurso = true;
      this.pedidoActualId = activo.id as string;
      this.applyEstado((activo as any).estado);
      await this.cargarItemsDePedido(this.pedidoActualId);
      return;
    }
    let q = supabase.from("pedidos").select("id").eq("mesa_id", this.mesaId).eq("estado", "rechazado").order("created_at", { ascending: false }).limit(1);
    if (this.clienteEmail) q = q.eq("cliente_email", this.clienteEmail);
    if (this.userUid) q = q.eq("cliente_uid", this.userUid);
    const { data: pedRej } = await q;
    if (pedRej && pedRej[0]?.id) {
      this.pedidoActualId = pedRej[0].id as string;
      await this.cargarItemsDePedido(this.pedidoActualId);
      this.pedidoEnCurso = false;
      this.applyEstado("rechazado");
    } else {
      this.pedidoEnCurso = false;
      this.applyEstado(null);
    }
  }

  private async cargarItemsDePedido(pedidoId: string): Promise<void> {
    const { data: items } = await supabase.from("pedido_items").select("producto_id, tipo, nombre, precio_unit, cantidad, duracion_min").eq("pedido_id", pedidoId);
    this.qtyMap.clear();
    this.itemsSel = [];
    for (const it of items ?? []) {
      this.qtyMap.set(it.producto_id as number, it.cantidad as number);
      this.itemsSel.push({ productoId: it.producto_id as number, tipo: it.tipo as any, nombre: it.nombre as string, precioUnit: it.precio_unit as number, cantidad: it.cantidad as number, duracionMin: it.duracion_min as number });
    }
    let total = 0;
    let maxDur = 0;
    for (const i of this.itemsSel) {
      total += i.precioUnit * i.cantidad;
      maxDur = Math.max(maxDur, i.duracionMin);
    }
    this.total = Number(total.toFixed(2));
    this.etaMin = this.itemsSel.length ? Math.round(maxDur + 10) : 0;
  }

  get pedidoBloqueado(): boolean {
    return !!this.pedidoEnCurso && this.estadoPedido !== "rechazado";
  }

  ngAfterViewInit(): void {
    this.presentingEl = document.querySelector("ion-router-outlet") as HTMLElement;
    const setVars = () => {
      const sticky = document.querySelector(".resumen-flotante") as HTMLElement | null;
      const seg = document.querySelector("ion-segment") as HTMLElement | null;
      const foot = document.querySelector("ion-footer, footer") as HTMLElement | null;
      const sh = sticky ? Math.round(sticky.getBoundingClientRect().height) : 0;
      const sg = seg ? Math.round(seg.getBoundingClientRect().height) : 0;
      const fh = foot ? Math.round(foot.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty("--sticky-h", `${sh}px`);
      document.documentElement.style.setProperty("--seg-h", `${sg}px`);
      document.documentElement.style.setProperty("--foot-h", `${fh}px`);
      document.documentElement.style.setProperty("--grid-pad", `20px`);
    };
    setVars();
    window.addEventListener("resize", setVars);
  }

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
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      if (vm.from === "yo") { this.seenIds.add(m.id); return; }
      const role: "mozo" | "cliente" = "mozo";
      this.messages.push({ ...vm, role });
      this.seenIds.add(m.id);
      if (!this.chatOpen) {
        (await this.toast.create({ message: `Mozo: ${vm.text}`, duration: 3000, position: "top", cssClass: "toast", buttons: [{ text: "Abrir", handler: () => this.openChat() }] })).present();
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
    this.messages.push({ id: tempId, from: "yo", role: "cliente", text: txt, time: this.hhmm(now) });
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
    try {
      await this.push.sendToRoles(["mozo"], "Mensaje del cliente", txt, { tipo: "chat", chatId: this.chatId, mesaId: this.mesaId, fromRole: "cliente", fromName: this.myName, preview: txt.slice(0, 80) });
    } catch {}
  }

  trackMsg = (_: number, m: { id: string }) => m.id;
  private scrollToBottom(ms: number = 200) { try { this.chatContent?.scrollToBottom(ms); } catch {} }
  private scrollToBottomAfterRender() { requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0)); }

  incByPlato(p: Plato) {
    if (this.submitting || this.pedidoBloqueado) return;
    const id = p.id!;
    this.qtyMap.set(id, (this.qtyMap.get(id) || 0) + 1);
    this.syncItems();
  }

  decById(id: number) {
    if (this.submitting || this.pedidoBloqueado) return;
    const prev = this.qtyMap.get(id) || 0;
    if (prev <= 0) return;
    this.qtyMap.set(id, prev - 1);
    this.syncItems();
  }

  inc(p: AddItem): void {
    if (this.submitting || this.pedidoBloqueado) return;
    this.qtyMap.set(p.id, (this.qtyMap.get(p.id) || 0) + 1);
    this.syncItems();
  }

  dec(id: number): void {
    if (this.submitting || this.pedidoBloqueado) return;
    this.decById(id);
  }

  private syncItems() {
    const arr: { productoId: number; tipo: "plato" | "bebida" | "postre"; nombre: string; precioUnit: number; cantidad: number; duracionMin: number }[] = [];
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

  private buildPlatoYBebida(): void {
    const mk = (tipos: Array<"plato" | "postre" | "bebida">) => {
      const sel = this.itemsSel.filter(i => tipos.includes(i.tipo));
      const items = sel.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnit: i.precioUnit, duracionMin: i.duracionMin, subtotal: Number((i.precioUnit * i.cantidad).toFixed(2)) }));
      const total = Number(items.reduce((a, b) => a + b.subtotal, 0).toFixed(2));
      const cantidad = items.reduce((a, b) => a + b.cantidad, 0);
      return { items, total, cantidad };
    };
    const c = mk(["plato", "postre"]);
    const b = mk(["bebida"]);
    const mesaNumero = this.mesa?.numero ?? "NN";
    this.plato = { titulo: `Plato • Mesa ${mesaNumero}`, total: c.total, cantidad: c.cantidad, items: c.items };
    this.bebidaObj = { titulo: `Bebidas • Mesa ${mesaNumero}`, total: b.total, cantidad: b.cantidad, items: b.items };
  }

  private async enviarAProduccion(pedidoId: string): Promise<void> {
    if (!this.mesaId || this.despachados.has(pedidoId)) return;
    const mesaNumero = this.mesa?.numero ?? 0;
    const ahora = new Date().toISOString();
    const cocinaItems = this.itemsSel.filter(i => i.tipo === "plato" || i.tipo === "postre").map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnit: i.precioUnit, duracionMin: i.duracionMin, subtotal: Number((i.precioUnit * i.cantidad).toFixed(2)) }));
    const barItems = this.itemsSel.filter(i => i.tipo === "bebida").map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precioUnit: i.precioUnit, duracionMin: i.duracionMin, subtotal: Number((i.precioUnit * i.cantidad).toFixed(2)) }));
    const cocinaTotal = Number(cocinaItems.reduce((a, b) => a + b.subtotal, 0).toFixed(2));
    const barTotal = Number(barItems.reduce((a, b) => a + b.subtotal, 0).toFixed(2));
    const cocinaCant = cocinaItems.reduce((a, b) => a + b.cantidad, 0);
    const barCant = barItems.reduce((a, b) => a + b.cantidad, 0);
    try {
      if (cocinaItems.length) {
        await supabase.from("cocina_pedidos").insert({ pedido_id: pedidoId, mesa_id: this.mesaId, mesa_numero: mesaNumero, creado_en: ahora, total: cocinaTotal, cantidad: cocinaCant, items: cocinaItems, estado: "pendiente" });
        await this.push.sendToCocina("Nuevo pedido", `Nuevo Pedido de la Mesa ${mesaNumero}`, { tipo: "cocina_pedido", pedidoId, mesaId: this.mesaId, mesaNumero });
      }
      if (barItems.length) {
        await supabase.from("bar_pedidos").insert({ pedido_id: pedidoId, mesa_id: this.mesaId, mesa_numero: mesaNumero, creado_en: ahora, total: barTotal, cantidad: barCant, items: barItems, estado: "pendiente" });
        await this.push.sendToBar("Nuevo pedido", `Nuevo Pedido de la Mesa ${mesaNumero}`, { tipo: "bar_pedido", pedidoId, mesaId: this.mesaId, mesaNumero });
      }
      this.despachados.add(pedidoId);
    } catch {}
  }

  async terminarPedido() {
    try {
      if (!this.itemsSel.length) return;
      if (!this.mesaId) throw new Error("Mesa inválida.");
      if (this.pedidoBloqueado) { this.updateBanner(); return; }
      this.submitting = true;
      if (!this.userUid && !this.clienteEmail) {
        const { data } = await supabase.auth.getUser();
        this.userUid = data.user?.id ?? "";
        this.clienteEmail = data.user?.email ?? null;
      }
      const existente = await this.pedidos.getPedidoActivo({ mesaId: this.mesaId, clienteUid: this.userUid || undefined, clienteEmail: this.clienteEmail || undefined });
      let pedidoId: string | undefined;
      if (existente) {
        if (existente.estado !== "rechazado") {
          this.pedidoEnCurso = true;
          this.pedidoActualId = existente.id as string;
          this.applyEstado((existente as any).estado);
          return;
        } else {
          await this.pedidos.reemplazarItems(existente.id as string, this.itemsSel, this.total, this.etaMin, "pendiente");
          pedidoId = existente.id as string;
        }
      } else {
        let q = supabase.from("pedidos").select("id").eq("mesa_id", this.mesaId).eq("estado", "rechazado").order("created_at", { ascending: false }).limit(1);
        if (this.clienteEmail) q = q.eq("cliente_email", this.clienteEmail);
        if (this.userUid) q = q.eq("cliente_uid", this.userUid);
        const { data: pedRej } = await q;
        const rejId = pedRej?.[0]?.id as string | undefined;
        if (rejId) {
          await this.pedidos.reemplazarItems(rejId, this.itemsSel, this.total, this.etaMin, "pendiente");
          pedidoId = rejId;
        } else {
          pedidoId = await this.pedidos.crearPedido(this.mesaId, this.userUid, this.clienteEmail, this.itemsSel, this.total, this.etaMin);
        }
      }
      this.pedidoEnCurso = true;
      this.applyEstado("pendiente");
      this.pedidoActualId = pedidoId!;
      const mesaNumero = this.mesa?.numero ?? "NN";
      await this.chatSvc.notifyMozosNuevoPedido(mesaNumero as any, this.formatARS(this.total), pedidoId!, this.mesaId);
      this.unsubEstado?.();
      this.unsubEstado = this.pedidos.onEstadoPedido(pedidoId!, async (estado) => {
        this.zone.run(async () => {
          this.applyEstado(estado);
          if (this.estadoPedido === "aceptado") {
            await this.enviarAProduccion(pedidoId!);
            this.buildPlatoYBebida();
            this.router.navigate(["/pedido", pedidoId!]);
          } else if (this.estadoPedido === "rechazado") {
            this.pedidoEnCurso = false;
            this.submitting = false;
            (await this.toast.create({ message: "Su pedido fue rechazado, por favor modifíquelo correctamente y reenvíelo.", position: "top", cssClass: "toasty", duration: undefined, buttons: [{ text: "Cerrar", role: "cancel" }] })).present();
          }
        });
      });
      (await this.toast.create({ message: "Pedido enviado. Esperando confirmación del mozo.", duration: 2000, position: "top", cssClass: "toast" })).present();
    } catch (e: any) {
      (await this.toast.create({ message: e?.message ?? "Error al enviar pedido", duration: 1800, position: "top" })).present();
      this.submitting = false;
    }
  }

  volver() {
    const anonimoId = this.route.snapshot.queryParamMap.get("anonimoId");
    const usuarioId = this.route.snapshot.queryParamMap.get("usuarioId");
    const clienteId = this.route.snapshot.queryParamMap.get("clienteId");
    this.router.navigate(["/encuestas-espera"], { queryParams: { anonimoId, usuarioId, clienteId } });
  }
}