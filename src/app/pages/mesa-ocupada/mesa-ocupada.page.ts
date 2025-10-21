import { AfterViewInit, Component, inject, NgZone, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { IonContent, IonModal, Platform, ToastController } from "@ionic/angular";
import { Bebida } from "src/app/interfaces/bebida";
import { Mesa } from "src/app/interfaces/mesa";
import { Plato } from "src/app/interfaces/plato";
import { Bebidas } from "src/app/services/bebidas/bebidas";
import { Mesas } from "src/app/services/mesas/mesas";
import { Platos } from "src/app/services/platos/platos";
import { supabase } from "src/supabase.client";
import { Keyboard } from "@capacitor/keyboard";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { Push } from "src/app/services/push/push";
import { MotionControls } from "src/app/services/motion/motion";
import { PluginListenerHandle } from "@capacitor/core";
import { AccelListenerEvent, Motion, OrientationListenerEvent } from "@capacitor/motion";

type Tab = "platos" | "bebidas" | "postres";
type AddItem = { id: number; nombre: string; precio: number; duracionMin: number; tipo: "plato" | "bebida" | "postre" };
type Estado = "pendiente" | "aceptado" | "rechazado" | "terminado";

type PedidoRow = { id: string; estado: Estado; mesa_id: number };

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
  private router = inject(Router);
  private pedidos = inject(Pedidos);
  private push = inject(Push);

  private backUnsub?: () => void;
  private unsubEstado?: () => void;

  private accelSub?: PluginListenerHandle;
  private orientSub?: PluginListenerHandle;

  private lastHoldStart: Record<"L" | "R" | "F" | "B", number> = { L: 0, R: 0, F: 0, B: 0 };
  private _lastFire: Record<string, number> = {};
  private readonly TILT_TH = 22;
  private readonly HOLD_MS = 200;
  private readonly SHAKE_WIN_MS = 1200;
  private readonly SHAKE_AX_TH = 9.5;
  private readonly SHAKE_TOGGLES = 6;

  private lastRollDeg = 0;
  private readonly ROLL_GUARD = 12;
  private lastShakeSignX = 0;
  private togglesX: number[] = [];

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

  presentingEl?: HTMLElement;
  myName = "Cliente";

  qtyMap = new Map<number, number>();
  itemsSel: { productoId: number; tipo: "plato" | "bebida" | "postre"; nombre: string; precioUnit: number; cantidad: number; duracionMin: number }[] = [];
  total = 0;
  etaMin = 0;
  userUid = "";
  pedidoEnCurso = false;
  carritoFlag: boolean = false;
  pedidoActualId?: string;
  estadoPedido: Estado | null = null;
  bannerMsg = "";
  clienteEmail: string | null = null;

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;

  plato?: { titulo: string; total: number; cantidad: number; items: Array<{ nombre: string; cantidad: number; precioUnit: number; duracionMin: number; subtotal: number }> };
  bebidaObj?: { titulo: string; total: number; cantidad: number; items: Array<{ nombre: string; cantidad: number; precioUnit: number; duracionMin: number; subtotal: number }> };

  constructor(private platform: Platform, private zone: NgZone) { }

  async ngOnInit() {
    const sub = this.platform.backButton.subscribeWithPriority(9999, () => {
    });
    this.backUnsub = () => sub.unsubscribe();
    try {
      const qp = this.route.snapshot.queryParamMap;
      const mesaIdQp = qp.get("mesaId");
      this.mesaId = mesaIdQp ? Number(mesaIdQp) : undefined;
      if (!this.mesaId || Number.isNaN(this.mesaId)) { throw new Error("Mesa inválida"); }
      this.mesa = await this.mesasSrv.getById(this.mesaId);
      if (!this.mesa) { throw new Error("Mesa no encontrada"); }
      this.mesaAsignada = !!this.mesa;

      this.anonimoId = qp.get("anonimoId") ?? undefined;
      this.usuarioId = qp.get("usuarioId") ? Number(qp.get("usuarioId")) : null;
      this.clienteId = qp.get("clienteId") ? Number(qp.get("clienteId")) : null;

      const [allPlatos, bebidas] = await Promise.all([this.platosSrv.list(), this.bebidasSrv.list()]);
      this.postres = allPlatos.filter((p: any) => !!p.esPostre);
      this.platos = allPlatos.filter((p: any) => !p.esPostre);
      this.bebidas = bebidas;

      const { data: au } = await supabase.auth.getUser();
      this.clienteEmail = au.user?.email ?? null;

      this.userUid = this.anonimoId ? "" : (au.user?.id ?? "");

      await this.push.init(this.usuarioId ?? null, "cliente");
      await this.push.ready();

      try {
        const tk = this.push.getToken?.();
        const uid = this.anonimoId ? `anon-${this.anonimoId}` : (au.user?.id ?? null);
        if (tk && uid) {
          await supabase.from("push_tokens").upsert(
            { token: tk, usuario_id: uid, role: "cliente", active: true, revoked: false },
            { onConflict: "token" }
          );
        }
      } catch { }

      await this.detectarYPoblarPedido();

      if (this.estadoPedido === "aceptado") {
        this.gotoEncuestasEspera();
        return;
      }

    } catch (e: any) {
      this.error = e?.message || "Error cargando mesa";
      (await this.toast.create({ message: this.error, cssClass: "toast", duration: 1500 })).present();
    } finally {
      setTimeout(() => (this.loading = false), 2000);
    }
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

    void this.startMotion();
  }

  ngOnDestroy() { this.backUnsub?.(); this.unsubEstado?.(); this.stopMotion(); }

  private async startMotion(): Promise<void> {
    this.stopMotion();
    this.orientSub = await Motion.addListener("orientation", (e: OrientationListenerEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      const now = Date.now();

      this.lastRollDeg = gamma;

      if (gamma <= -this.TILT_TH) this.markHold("L", now, () => this.siguienteFoto());
      else this.lastHoldStart.L = 0;
      if (gamma >= this.TILT_TH) this.markHold("R", now, () => this.anteriorFoto());
      else this.lastHoldStart.R = 0;

      const sign = gamma > this.TILT_TH ? 1 : gamma < -this.TILT_TH ? -1 : 0;
      if (Math.abs(gamma) <= this.ROLL_GUARD) {
        if (beta >= this.TILT_TH) this.markHold("F", now, () => this.siguienteProducto());
        else this.lastHoldStart.F = 0;

        if (beta <= -this.TILT_TH) this.markHold("B", now, () => this.anteriorProducto());
        else this.lastHoldStart.B = 0;
      } else {
        this.lastHoldStart.F = 0;
        this.lastHoldStart.B = 0;
      }
    });

    this.accelSub = await Motion.addListener("accel", (ev) => {
      const a = ev.accelerationIncludingGravity ?? ev.acceleration; if (!a) return;
      const now = Date.now();
      const x = a.x ?? 0;
      if (Math.abs(x) < this.SHAKE_AX_TH) return;

      const s = x > 0 ? 1 : -1;
      if (s !== this.lastShakeSignX) {
        this.lastShakeSignX = s;
        this.togglesX.push(now);
        while (this.togglesX.length && now - this.togglesX[0] > this.SHAKE_WIN_MS) this.togglesX.shift();
        if (this.togglesX.length >= this.SHAKE_TOGGLES) {
          this.togglesX.length = 0;
          this.resetAlPrimerProducto();
        }
      }
    });
  }

  private stopMotion(): void {
    this.accelSub?.remove(); this.accelSub = undefined;
    this.orientSub?.remove(); this.orientSub = undefined;
    this.togglesX.length = 0;
    this.lastShakeSignX = 0;
    this.lastRollDeg = 0;
    this.lastHoldStart = { L: 0, R: 0, F: 0, B: 0 };
    this._lastFire = {};
  }

  private markHold(key: "L" | "R" | "F" | "B", now: number, fire: () => void): void {
    if (!this.lastHoldStart[key]) this.lastHoldStart[key] = now;
    if (now - this.lastHoldStart[key] >= this.HOLD_MS) fire();
  }

  private getVisibleCards(): HTMLElement[] {
    return Array.from(document.querySelectorAll(".grid .card")) as HTMLElement[];
  }

  private getActiveCard(): HTMLElement | null {
    const cards = this.getVisibleCards();
    if (!cards.length) return null;
    const midY = window.innerHeight / 2;
    let best: HTMLElement | null = null;
    let dBest = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const cY = r.top + r.height / 2;
      const d = Math.abs(cY - midY);
      if (d < dBest) { dBest = d; best = c; }
    }
    return best;
  }

  private getActiveTrack(): HTMLElement | null {
    const card = this.getActiveCard();
    if (!card) return null;
    return card.querySelector(".track") as HTMLElement | null;
  }

  private getSlidesOf(track: HTMLElement | null): HTMLElement[] {
    if (!track) return [];
    return Array.from(track.querySelectorAll(".slide")) as HTMLElement[];
  }

  private getGrid(): HTMLElement | null {
    return document.querySelector(".grid") as HTMLElement | null;
  }

  private getCards(): HTMLElement[] {
    const g = this.getGrid();
    return g ? (Array.from(g.querySelectorAll(":scope > .card")) as HTMLElement[]) : [];
  }

  private computeSlideIndex(track: HTMLElement | null): number {
    if (!track) return 0;
    const slides = this.getSlidesOf(track);
    if (!slides.length) return 0;
    const scroll = track.scrollLeft;
    let idx = 0, best = Infinity;
    slides.forEach((s, i) => {
      const d = Math.abs(s.offsetLeft - scroll);
      if (d < best) { best = d; idx = i; }
    });
    return idx;
  }

  private scrollToSlide(track: HTMLElement | null, index: number): void {
    if (!track) return;
    const slides = this.getSlidesOf(track);
    if (!slides.length) return;
    const idx = Math.max(0, Math.min(index, slides.length - 1));
    const target = slides[idx];
    try { track.scrollTo({ left: target.offsetLeft, behavior: "smooth" }); }
    catch { track.scrollLeft = target.offsetLeft; }
  }

  private getCarritoItems(): HTMLElement[] {
    return Array.from(document.querySelectorAll(".carrito-lista .carrito-item")) as HTMLElement[];
  }

  private computeCardIndex(): number {
    const g = this.getGrid(), cards = this.getCards();
    if (!g || !cards.length) return 0;
    const gr = g.getBoundingClientRect();
    const mid = gr.top + gr.height / 2;
    let idx = 0, best = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = Math.abs((r.top + r.height / 2) - mid);
      if (d < best) { best = d; idx = i; }
    });
    return idx;
  }

  private computeCarritoIndex(): number {
    const items = this.getCarritoItems();
    if (!items.length) return 0;
    const midY = window.innerHeight / 2;
    let idx = 0, best = Infinity;
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const cY = r.top + r.height / 2;
      const d = Math.abs(cY - midY);
      if (d < best) { best = d; idx = i; }
    });
    return idx;
  }

  private scrollToCarrito(index: number): void {
    const items = this.getCarritoItems();
    if (!items.length) return;
    const idx = Math.max(0, Math.min(index, items.length - 1));
    const el = items[idx];
    try { el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    catch { el.scrollIntoView(); }
  }

  private scrollToCard(index: number): void {
    const g = this.getGrid(), cards = this.getCards();
    if (!g || !cards.length) return;
    const idx = Math.max(0, Math.min(index, cards.length - 1));
    const r = cards[idx].getBoundingClientRect();
    const gr = g.getBoundingClientRect();
    const top = g.scrollTop + (r.top - gr.top);
    try { g.scrollTo({ top, behavior: "smooth" }); } catch { g.scrollTop = top; }
  }

  private siguienteFoto(): void {
    const track = this.getActiveTrack();
    const i = this.computeSlideIndex(track);
    this.scrollToSlide(track, i + 1);
  }

  private anteriorFoto(): void {
    const track = this.getActiveTrack();
    const i = this.computeSlideIndex(track);
    this.scrollToSlide(track, i - 1);
  }

  private siguienteProducto(): void {
    if (this.carritoFlag) {
      const i = this.computeCarritoIndex(); this.scrollToCarrito(i + 1);
    } else {
      const i = this.computeCardIndex(); this.scrollToCard(i + 1);
    }
  }

  private anteriorProducto(): void {
    if (this.carritoFlag) {
      const i = this.computeCarritoIndex(); this.scrollToCarrito(i - 1);
    } else {
      const i = this.computeCardIndex(); this.scrollToCard(i - 1);
    }
  }

  private resetAlPrimerProducto(): void {
    if (this.carritoFlag) {
      this.scrollToCarrito(0);
    } else {
      this.scrollToCard(0);
      const first = this.getCards()[0];
      const track = first ? (first.querySelector(".track") as HTMLElement | null) : null;
      this.scrollToSlide(track, 0);
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

  private applyIdentityFilters(q: any): any {
    if (this.clienteEmail) {
      q = q.eq("cliente_email", this.clienteEmail);
    } else if (this.anonimoId) {
      q = q.eq("anonimo_id", this.anonimoId);
    } else if (this.usuarioId !== null) {
      q = q.eq("usuario_id", this.usuarioId);
    } else if (this.clienteId !== null) {
      q = q.eq("cliente_id", this.clienteId);
    }
    return q;
  }

  private async buscarPedidoActivoDb(): Promise<PedidoRow | null> {
    if (!this.mesaId) { return null; }
    let q = supabase
      .from("pedidos")
      .select("id, estado, mesa_id")
      .eq("mesa_id", this.mesaId)
      .in("estado", ["pendiente", "aceptado"])
      .order("created_at", { ascending: false })
      .limit(1) as any;
    q = this.applyIdentityFilters(q);
    const { data, error } = await q;
    if (error) { return null; }
    return (data && data[0]) ? (data[0] as PedidoRow) : null;
  }

  private async buscarUltimoRechazadoDb(): Promise<PedidoRow | null> {
    if (!this.mesaId) { return null; }
    let q = supabase
      .from("pedidos")
      .select("id, estado, mesa_id")
      .eq("mesa_id", this.mesaId)
      .eq("estado", "rechazado")
      .order("created_at", { ascending: false })
      .limit(1) as any;
    q = this.applyIdentityFilters(q);
    const { data, error } = await q;
    if (error) { return null; }
    return (data && data[0]) ? (data[0] as PedidoRow) : null;
  }

  private async detectarYPoblarPedido(): Promise<void> {
    if (!this.mesaId) { return; }

    const activoDb = await this.buscarPedidoActivoDb();
    if (activoDb) {
      this.pedidoEnCurso = true;
      this.pedidoActualId = activoDb.id;
      this.applyEstado(activoDb.estado);
      await this.cargarItemsDePedido(this.pedidoActualId);
      return;
    }

    if (this.clienteEmail) {
      try {
        const activoSvc = await this.pedidos.getPedidoActivo({ mesaId: this.mesaId, clienteUid: undefined, clienteEmail: this.clienteEmail });
        if (activoSvc) {
          this.pedidoEnCurso = true;
          this.pedidoActualId = activoSvc.id as string;
          this.applyEstado((activoSvc as any).estado);
          await this.cargarItemsDePedido(this.pedidoActualId);
          return;
        }
      } catch { }
    }

    const rej = await this.buscarUltimoRechazadoDb();
    if (rej) {
      this.pedidoActualId = rej.id;
      await this.cargarItemsDePedido(this.pedidoActualId);
      this.pedidoEnCurso = false;
      this.applyEstado("rechazado");
    } else {
      this.pedidoEnCurso = false;
      this.applyEstado(null);
    }
  }

  private async cargarItemsDePedido(pedidoId: string): Promise<void> {
    const { data: items } = await supabase.from("pedido_items")
      .select("producto_id, tipo, nombre, precio_unit, cantidad, duracion_min")
      .eq("pedido_id", pedidoId);
    this.qtyMap.clear();
    this.itemsSel = [];
    for (const it of items ?? []) {
      this.qtyMap.set(it.producto_id as number, it.cantidad as number);
      this.itemsSel.push({
        productoId: it.producto_id as number,
        tipo: it.tipo as any,
        nombre: it.nombre as string,
        precioUnit: it.precio_unit as number,
        cantidad: it.cantidad as number,
        duracionMin: it.duracion_min as number
      });
    }
    let total = 0;
    let maxDur = 0;
    for (const i of this.itemsSel) {
      total += i.precioUnit * i.cantidad;
      maxDur = Math.max(maxDur, i.duracionMin);
    }
    this.total = Number(total.toFixed(2));
    this.etaMin = this.itemsSel.length ? Math.round(maxDur) : 0;
  }

  get pedidoBloqueado(): boolean {
    return !!this.pedidoEnCurso && this.estadoPedido !== "rechazado";
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

 

  incByPlato(p: Plato) {
    if (this.submitting || this.pedidoBloqueado) { return; }
    const id = p.id!;
    this.qtyMap.set(id, (this.qtyMap.get(id) || 0) + 1);
    this.syncItems();
  }

  decById(id: number) {
    if (this.submitting || this.pedidoBloqueado) { return; }
    const prev = this.qtyMap.get(id) || 0;
    if (prev <= 0) { return; }
    this.qtyMap.set(id, prev - 1);
    this.syncItems();
  }

  inc(p: AddItem): void {
    if (this.submitting || this.pedidoBloqueado) { return; }
    this.qtyMap.set(p.id, (this.qtyMap.get(p.id) || 0) + 1);
    this.syncItems();
  }

  dec(id: number): void {
    if (this.submitting || this.pedidoBloqueado) { return; }
    this.decById(id);
  }

  private syncItems() {
    const arr: { productoId: number; tipo: "plato" | "bebida" | "postre"; nombre: string; precioUnit: number; cantidad: number; duracionMin: number }[] = [];
    let total = 0, maxDur = 0;
    const acumPlatos = (list: Plato[], tipo: "plato" | "postre") => {
      for (const p of list) {
        if (p.id == null) { continue; }
        const q = this.qtyMap.get(p.id) || 0;
        if (q > 0) {
          arr.push({ productoId: p.id, tipo, nombre: p.nombre, precioUnit: p.precio, cantidad: q, duracionMin: p.tiempo_elaboracion_min });
          total += p.precio * q;
          maxDur = Math.max(maxDur, p.tiempo_elaboracion_min);
        }
      }
    };
    const acumBebidas = (list: Bebida[]) => {
      for (const b of list) {
        const id = (b as any).id as number | undefined;
        if (id == null) { continue; }
        const q = this.qtyMap.get(id) || 0;
        if (q > 0) {
          const precio = (b as any).precio as number;
          const dur = ((b as any).tiempo_elaboracion_min ?? 0) as number;
          arr.push({ productoId: id, tipo: "bebida", nombre: (b as any).nombre as string, precioUnit: precio, cantidad: q, duracionMin: dur });
          total += precio * q;
          maxDur = Math.max(maxDur, dur);
        }
      }
    };
    acumPlatos(this.platos, "plato");
    acumPlatos(this.postres, "postre");
    acumBebidas(this.bebidas);
    this.itemsSel = arr;
    this.total = Number(total.toFixed(2));
    this.etaMin = arr.length ? Math.round(maxDur) : 0;
  }

  private formatARS(n: number): string {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", currencyDisplay: "symbol" }).format(n);
  }

  private buildPlatoYBebida(): void {
    const mk = (tipos: Array<"plato" | "postre" | "bebida">) => {
      const sel = this.itemsSel.filter(i => tipos.includes(i.tipo));
      const items = sel.map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precioUnit: i.precioUnit,
        duracionMin: i.duracionMin,
        subtotal: Number((i.precioUnit * i.cantidad).toFixed(2))
      }));
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

  async terminarPedido() {
    try {
      if (!this.itemsSel.length) { return; }
      if (!this.mesaId) { throw new Error("Mesa inválida."); }
      if (this.pedidoBloqueado) { this.updateBanner(); return; }
      this.submitting = true;

      if (!this.userUid && !this.clienteEmail) {
        const { data } = await supabase.auth.getUser();
        this.clienteEmail = data.user?.email ?? null;
        this.userUid = this.anonimoId ? "" : (data.user?.id ?? "");
      }

      let existente = await this.buscarPedidoActivoDb();

      if (!existente && this.clienteEmail) {
        try {
          const svc = await this.pedidos.getPedidoActivo({
            mesaId: this.mesaId,
            clienteUid: undefined,
            clienteEmail: this.clienteEmail
          });
          if (svc) {
            existente = {
              id: svc.id as string,
              estado: (svc as any).estado,
              mesa_id: this.mesaId
            } as PedidoRow;
          }
        } catch { }
      }

      let pedidoId: string | undefined;

      if (existente) {
        if (existente.estado !== "rechazado") {
          this.pedidoEnCurso = true;
          this.pedidoActualId = existente.id;
          this.applyEstado(existente.estado);
          return;
        } else {
          await this.pedidos.reemplazarItems(existente.id, this.itemsSel, this.total, this.etaMin, "pendiente");
          pedidoId = existente.id;
        }
      } else {
        const rej = await this.buscarUltimoRechazadoDb();
        if (rej?.id) {
          await this.pedidos.reemplazarItems(rej.id, this.itemsSel, this.total, this.etaMin, "pendiente");
          pedidoId = rej.id;
        } else {
          pedidoId = await this.pedidos.crearPedido(
            this.mesaId,
            this.anonimoId ? "" : this.userUid,
            this.clienteEmail,
            this.itemsSel,
            this.total,
            this.etaMin
          );
          try {
            const upd: any = {};
            if (this.anonimoId) { upd.anonimo_id = this.anonimoId; }
            if (this.usuarioId !== null) { upd.usuario_id = this.usuarioId; }
            if (this.clienteId !== null) { upd.cliente_id = this.clienteId; }
            if (Object.keys(upd).length) {
              await supabase.from("pedidos").update(upd).eq("id", pedidoId);
            }
          } catch { }
        }
      }

      this.pedidoEnCurso = true;
      this.applyEstado("pendiente");
      this.pedidoActualId = pedidoId!;

      this.unsubEstado?.();
      this.unsubEstado = this.pedidos.onEstadoPedido(pedidoId!, async (estado: any) => {
        this.zone.run(async () => {
          this.applyEstado(estado);

          if (this.estadoPedido === "aceptado") {
            this.buildPlatoYBebida();
            this.gotoEncuestasEspera();
          }
          else if (this.estadoPedido === "rechazado") {
            try {
              await this.push.ready();
              const tok = this.push.getToken();
              if (tok) {
                await this.push.send(
                  tok,
                  "Pedido rechazado",
                  "Tu pedido fue rechazado. Modifícalo y reenvíalo.",
                  { tipo: "pedido_rechazado", pedidoId, mesaId: this.mesaId, mesaNumero: this.mesa?.numero ?? null }
                );
              }
            } catch { }

            this.pedidoEnCurso = false;
            this.submitting = false;
            (await this.toast.create({
              message: "Su pedido fue rechazado, por favor modifíquelo correctamente y reenvíelo.",
              position: "top",
              cssClass: "toast",
              duration: 1200
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
        position: "top",
        cssClass: "toast"
      })).present();
      this.submitting = false;
    }
  }

  private buildEncuestaQuery(): any {
    const q: any = {};
    if (this.anonimoId) { q.anonimoId = this.anonimoId; }
    if (this.usuarioId !== null) { q.usuarioId = this.usuarioId; }
    if (this.clienteId !== null) { q.clienteId = this.clienteId; }
    q.tienePermiso = true;
    q.qrValido = true;
    return q;
  }

  private gotoEncuestasEspera(): void {
    this.router.navigate(["/encuestas-espera"], { queryParams: this.buildEncuestaQuery() });
  }

  showCarrito() {
    this.carritoFlag = !this.carritoFlag;
  }

  volver() {
    this.gotoEncuestasEspera();
  }
}