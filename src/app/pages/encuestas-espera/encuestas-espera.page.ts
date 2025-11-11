import { Component, inject, OnInit, OnDestroy, NgZone, ViewChild, ChangeDetectorRef } from "@angular/core";
import { Router, ActivatedRoute } from "@angular/router";
import { IonContent, IonModal, ToastController } from "@ionic/angular";
import { Qr } from "src/app/services/qr/qr";
import { supabase } from "src/supabase.client";
import { Push } from "src/app/services/push/push";
import { Chat } from "src/app/services/chat/chat";
import { ChatMessage } from "src/app/interfaces/chat-message";
import { Pedidos } from "src/app/services/pedidos/pedidos";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { ClienteSessionService } from "src/app/services/clienteSessionService/cliente-session-service";
import { firstValueFrom } from "rxjs";
import { take } from "rxjs/operators";

type EstadoAsignacion =
  | "pendiente"
  | "asignada"
  | "sentado"
  | "liberada"
  | "cancelada";

interface AsignacionMesaRow {
  mesa_id: number;
  estado: EstadoAsignacion;
}

@Component({
  selector: "app-encuestas-espera",
  templateUrl: "./encuestas-espera.page.html",
  styleUrls: ["./encuestas-espera.page.scss"],
  standalone: false,
})
export class EncuestasEsperaPage implements OnInit, OnDestroy {
  private qr = inject(Qr);
  private push = inject(Push);
  private zone = inject(NgZone);
  private chatSvc = inject(Chat);
  private pedidos = inject(Pedidos);
  private toast = inject(ToastController);
  private cd = inject(ChangeDetectorRef);
  private subscription: any;
  private pedidoSub: any;
  private listaEsperaSub: any;

  private lastChatId?: string;
  private lastDeliveryChatId?: string;

  deliveryUnlock = false;
  deliveryChatOpen = false;
  deliveryChatReady = false;
  deliveryChatId?: string;
  deliveryMessages: {
    id: string;
    from: "yo" | "delivery";
    role: "delivery" | "cliente";
    text: string;
    time: string;
  }[] = [];
  deliveryNewMsg = "";
  @ViewChild("deliveryChatContent") deliveryChatContent?: IonContent;
  @ViewChild("deliveryChatModal", { read: IonModal })
  deliveryChatModal?: IonModal;
  private deliverySeenIds = new Set<string>();

  chatOpen = false;
  chatReady = false;
  chatId?: string;
  myUserId?: string;
  messages: {
    id: string;
    from: "yo" | "mozo";
    role: "mozo" | "cliente";
    text: string;
    time: string;
  }[] = [];
  newMsg = "";
  @ViewChild("chatContent") chatContent?: IonContent;
  @ViewChild("chatModal", { read: IonModal }) chatModal?: IonModal;
  private seenIds = new Set<string>();

  nombreCliente: string | undefined;
  usuarioId: number | null = null;
  anonimoId: string | undefined;
  clienteId: number | null = null;
  userUid: string | undefined;
  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;
  loading = true;
  tienePermiso = false;
  yaRegistrado = false;
  mostrarJuegos = false;
  mostrarPedido = false;
  mostrarCuenta = false;
  qrMesaEscaneado = false;
  anonClient = false;

  mesaAsignadaId: number | null = null;
  estadoPedido: string | null = null;
  pedidoId: string | null = null;
  email = "";
  clienteFoto = "";
  tieneMesa = false;

  get isDelivery(): boolean {
    return !this.tieneMesa && !!this.pedidoId;
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private usuarios: Usuarios,
    private session: ClienteSessionService
  ) { }

  async ngOnInit() {
    if (this.session.mesaAsignadaId && this.session.tienePermiso) {
      this.mesaAsignadaId = this.session.mesaAsignadaId;
      this.pedidoId = this.session.pedidoId;
      this.estadoPedido = this.session.estadoPedido;
      this.tienePermiso = true;
      this.yaRegistrado = true;
      this.qrValido = true;
      this.tieneMesa = true;

      this.actualizarFlags();
      await this.ensureChatAndSubscribe();
      this.loading = false;
      return;
    }

    if (this.session.tienePermiso) {
      this.tienePermiso = this.session.tienePermiso;
      this.qrValido = this.session.qrValido;
      this.yaRegistrado = this.session.yaRegistrado;
      this.anonimoId = this.session.anonimoId ?? undefined;
      this.usuarioId = this.session.usuarioId ? Number(this.session.usuarioId) : null;
      this.clienteId = this.session.clienteId ? Number(this.session.clienteId) : null;
      this.userUid = this.session.userUid ?? undefined;
    }

    const params = await firstValueFrom(this.route.queryParams.pipe(take(1)));
    await this.procesarParams(params);
  }

  private async procesarParams(params: any) {
    this.clienteId = params["clienteId"] ? Number(params["clienteId"]) : this.clienteId;
    this.usuarioId = params["usuarioId"] ? Number(params["usuarioId"]) : this.usuarioId;
    this.anonimoId = params["anonimoId"] ?? this.anonimoId;
    this.tienePermiso = params["tienePermiso"] ?? this.tienePermiso;
    this.userUid = params["userId"] ?? this.userUid;
    this.mostrarCuenta = params["mostrarCuenta"] ?? this.mostrarCuenta;

    if (!this.clienteId && !this.anonimoId && !this.usuarioId) {
      this.router.navigate(["/login"], { replaceUrl: true });
      return;
    }

    const { data: au } = await supabase.auth.getUser();

    if (this.anonimoId) {
      this.myUserId = `anon-${this.anonimoId}`;
      this.anonClient = true;

      const { data: anon } = await supabase
        .from("clientes_anonimos")
        .select("nombre, foto_url")
        .eq("id", this.anonimoId)
        .maybeSingle();

      this.nombreCliente = anon?.nombre || "Cliente Anónimo";
      this.clienteFoto = anon?.foto_url || "";
      this.email = "☠︎ anonimo ☠︎";
      this.usuarioId = null;
    } else {
      this.myUserId = au?.user?.id ?? undefined;

      const usuarioDB = await this.usuarios.getByEmail(au?.user?.email ?? "");
      this.usuarioId = usuarioDB?.id ?? null;
      this.email = `${usuarioDB?.correo_electronico ?? ""}`.trim();

      const { data: usuario } = await supabase
        .from("usuarios")
        .select("nombres, apellidos, foto_url")
        .eq("id", this.usuarioId)
        .maybeSingle();

      this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : "Cliente";
      this.clienteFoto = usuario?.foto_url ?? "";
    }

    if (!this.usuarioId && this.clienteId) {
      const { data: cli } = await supabase
        .from("clientes")
        .select("usuario_id")
        .eq("id", this.clienteId)
        .maybeSingle();
      this.usuarioId = typeof cli?.usuario_id === "number" ? cli?.usuario_id : null;
    }

    if (this.usuarioId) {
      const { data: usuario } = await supabase
        .from("usuarios")
        .select("nombres, apellidos, foto_url")
        .eq("id", this.usuarioId)
        .maybeSingle();
      this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : "Cliente";
      this.clienteFoto = usuario?.foto_url ?? "";
    } else if (this.anonimoId) {
      const { data: anonimo } = await supabase
        .from("clientes_anonimos")
        .select("nombre")
        .eq("id", this.anonimoId)
        .maybeSingle();
      this.nombreCliente = anonimo?.nombre || "Cliente Anónimo";
    }

    await this.push.init(au?.user?.id ?? null, "cliente");
    await this.push.ready();

    const qpPedidoId = params["pedidoId"] as string | null;
    if (qpPedidoId) {
      this.pedidoId = qpPedidoId;

      const { data: p } = await supabase
        .from("pedidos")
        .select("estado, tipo, mesa_id")
        .eq("id", qpPedidoId)
        .maybeSingle();

      if (p && p.tipo === "delivery" && p.mesa_id == null) {
        this.estadoPedido = p.estado ?? this.estadoPedido;
        this.qrValido = true;
        this.tienePermiso = true;
        this.yaRegistrado = true;
        this.tieneMesa = false;
        this.deliveryUnlock = ["recibido", "terminado"].includes(p.estado);

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);
      }
    }

    await this.cargarMesaAsignada();
    await this.intentarDeliveryUnlock();

    this.subscription = supabase
      .channel("asignaciones_mesa_sub")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "asignaciones_mesa",
          filter: this.clienteId ? `cliente_id=eq.${this.clienteId}` : `cliente_anonimo_id=eq.${this.anonimoId}`,
        },
        async (payload: any) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            if (payload.new && typeof payload.new.mesa_id === "number") {
              this.mesaAsignadaId = payload.new.mesa_id;
              this.yaRegistrado = true;
              this.tieneMesa = true;
              this.zone.run(() => {
                this.mostrarToast(`Ya puede tomar asiento en la mesa #${this.mesaAsignadaId}.`, "Mesa Asignada");
              });

              this.session.mesaAsignadaId = this.mesaAsignadaId;
              this.session.yaRegistrado = true;
              this.session.tienePermiso = true;

              await this.ensureChatAndSubscribe();
            }
          } else if (payload.eventType === "DELETE") {
            await this.limpiarIntentosJuegos();
            this.resetVista();
          }
        }
      )
      .subscribe();

    this.listaEsperaSub = supabase
      .channel("lista_espera_sub")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lista_espera" },
        async (_payload: any) => {
          const esAnon = !!this.anonimoId;
          const filtro = esAnon
            ? supabase.from("lista_espera").select("id").eq("cliente_anonimo_id", this.anonimoId!).limit(1)
            : supabase.from("lista_espera").select("id").eq("cliente_id", this.clienteId!).limit(1);

          const { data: sigue } = await filtro.maybeSingle();

          this.zone.run(() => {
            const estaba = this.yaRegistrado;
            this.yaRegistrado = !!sigue;
            this.session.yaRegistrado = !!sigue;

            if (estaba && !this.yaRegistrado) {
              this.mostrarToast("Fuiste removido de la lista de espera.");
            }

            try {
              this.cd.detectChanges();
            } catch { }
          });

          setTimeout(() => {
            this.cargarMesaAsignada().then(() => {
              try {
                this.cd.detectChanges();
              } catch { }
            });
          }, 300);
        }
      )
      .subscribe();

    setTimeout(() => (this.loading = false), 2000);
    await this.ensureChatAndSubscribe();
  }

  ngOnDestroy() {
    if (this.subscription) supabase.removeChannel(this.subscription);
    if (this.pedidoSub) supabase.removeChannel(this.pedidoSub);
    if (this.listaEsperaSub) supabase.removeChannel(this.listaEsperaSub);
    this.chatOpen = false;
    this.chatReady = false;
    this.deliveryChatOpen = false;
    this.deliveryChatReady = false;
    try {
      this.chatSvc.unsubscribe?.();
    } catch { }
  }

  trackDeliveryMsg = (_: number, m: { id: string }) => m.id;

  private shouldToastMesaVinculada(mesaId: number): boolean {
    const uid = this.userUid || (this.anonimoId ? `anon-${this.anonimoId}` : "desconocido");
    const key = `mesa_vinc_${uid}_${mesaId}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  }

  private async bindDeliveryChatToken(chatId: string, role: "delivery" | "cliente"): Promise<void> {
    try {
      const tk = this.push.getToken?.();
      if (!tk) return;

      const { data: row } = await supabase
        .from("delivery_chat_participants")
        .select("chat_id,role")
        .eq("chat_id", chatId)
        .eq("role", role)
        .maybeSingle();

      if (row) {
        await supabase
          .from("delivery_chat_participants")
          .update({ push_token: tk })
          .eq("chat_id", chatId)
          .eq("role", role);
      } else {
        await supabase
          .from("delivery_chat_participants")
          .upsert({ chat_id: chatId, role, push_token: tk }, { onConflict: "chat_id,role" });
      }
    } catch { }
  }

  private async notifyDeliveryPeers(
    chatId: string,
    fromRole: "delivery" | "cliente",
    preview: string
  ): Promise<void> {
    try {
      const { data: parts } = await supabase
        .from("delivery_chat_participants")
        .select("role,push_token,user_id")
        .eq("chat_id", chatId);

      const targets = new Set<string>();
      for (const p of parts ?? []) {
        if ((p as any).role === fromRole) continue;

        const tk = (p as any).push_token as string | null;
        if (tk) {
          targets.add(tk);
          continue;
        }

        const uid = (p as any).user_id as string | null;
        if (uid) {
          const { data: toks } = await supabase
            .from("push_tokens")
            .select("token")
            .eq("usuario_id", uid)
            .eq("active", true)
            .eq("revoked", false);
          for (const t of toks ?? []) targets.add((t as any).token as string);
        }
      }

      const list = Array.from(targets);
      if (!list.length) return;

      await this.push.send(
        list,
        "Nuevo mensaje",
        preview?.slice(0, 100) || "Toque para abrir el chat",
        { tipo: "delivery_chat", chatId }
      );
    } catch { }
  }

  private async intentarDeliveryUnlock(): Promise<void> {
    if (this.mesaAsignadaId) return;

    let q = supabase
      .from("pedidos")
      .select("id, estado, tipo, delivery_direccion")
      .eq("tipo", "delivery")
      .order("created_at", { ascending: false })
      .limit(1);

    if (this.email) q = q.eq("cliente_email", this.email);
    else if (this.userUid) q = q.eq("cliente_uid", this.userUid);
    else {
      const { data: au } = await supabase.auth.getUser();
      const uid = au?.user?.id ?? null;
      if (uid) q = q.eq("cliente_uid", uid);
    }

    const { data } = await q;
    const p = data?.[0];
    if (!p) return;

    if (["aceptado", "recibido", "terminado", "rechazado"].includes(p.estado)) {
      this.pedidoId = p.id;
      this.estadoPedido = p.estado;

      this.deliveryUnlock = ["recibido", "terminado"].includes(p.estado);

      this.qrValido = true;
      this.tienePermiso = true;
      this.yaRegistrado = true;
      this.tieneMesa = false;

      this.actualizarFlags();
      this.suscribirPedido(this.pedidoId);
    }
  }

  async escanearQr() {
    try {
      const qr = await this.qr.scanQr();
      if (!qr) return;

      const res = await this.qr.procesarQrCliente(qr, this.clienteId ?? undefined, this.anonimoId ?? undefined);

      if (res.error) {
        this.mostrarToast(res.error);
        return;
      }

      if (qr.startsWith("INGRESO")) {
        if (!this.tienePermiso) {
          this.tienePermiso = true;
          this.qrValido = true;
          this.session.tienePermiso = true;
          this.session.qrValido = true;

          if (this.mesaAsignadaId) {
            this.session.mesaAsignadaId = this.mesaAsignadaId;
          }

          this.mostrarToast("Ingreso validado. Ya tenes acceso a algunas funciones.");
        } else {
          this.mostrarToast("Ya habías escaneado el QR de ingreso.");
        }
        return;
      }

      if (res.mesaAsignada) {
        const mesaId = res.mesaAsignada;
        const mesaNumero = res.numero;

        const { data: pedido } = await supabase
          .from("pedidos")
          .select("id, estado")
          .eq("mesa_id", mesaId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pedido) {
          this.estadoPedido = pedido.estado;
          this.pedidoId = pedido.id;
          this.mesaAsignadaId = mesaId;
          this.actualizarFlags();
          this.suscribirPedido(this.pedidoId);
          if (this.shouldToastMesaVinculada(mesaId)) {
            this.mostrarToast(`Mesa ${mesaNumero} vinculada correctamente.`);
          }
        } else {
          const qp: any = { mesaId, numero: mesaNumero };
          if (this.anonimoId) qp.anonimoId = this.anonimoId;
          if (this.usuarioId) qp.usuarioId = this.usuarioId;
          if (this.clienteId) qp.clienteId = this.clienteId;

          await this.router.navigate(["/mesa-ocupada"], { queryParams: qp });
          return;
        }

        return;
      }

      this.mostrarToast("QR no reconocido o no autorizado.");
    } catch (e: any) {
      console.error("[escanearQr] Error:", e);
      this.mostrarToast("Error al procesar el QR.");
    }
  }

  private async cargarMesaAsignada() {
    let q = supabase
      .from("asignaciones_mesa")
      .select("mesa_id, estado")
      .in("estado", ["pendiente", "asignada", "sentado"] as EstadoAsignacion[])
      .order("asignada_en", { ascending: false })
      .limit(1);

    if (this.clienteId) q = q.eq("cliente_id", this.clienteId);
    if (this.anonimoId) q = q.eq("cliente_anonimo_id", this.anonimoId);

    const { data: asignacion, error: errAsignacion } = await q.maybeSingle();

    if (!errAsignacion && asignacion && typeof asignacion.mesa_id === "number") {
      this.mesaAsignadaId = asignacion.mesa_id;
      this.yaRegistrado = true;
      this.tieneMesa = true;
      this.tienePermiso = true;

      this.session.tienePermiso = true;
      this.session.qrValido = true;
      this.session.mesaAsignadaId = this.mesaAsignadaId;
      this.session.yaRegistrado = true;

      const { data: pedido } = await supabase
        .from("pedidos")
        .select("id, estado")
        .eq("mesa_id", this.mesaAsignadaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pedido) {
        this.estadoPedido = pedido.estado;
        this.pedidoId = pedido.id;

        this.session.pedidoId = this.pedidoId;
        this.session.estadoPedido = this.estadoPedido;

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);
      }

      await this.ensureChatAndSubscribe();
      return;
    }

    let qLista = supabase.from("lista_espera").select("id, estado").in("estado", ["pendiente", "aprobado"]);

    if (this.clienteId) qLista = qLista.eq("cliente_id", this.clienteId);
    if (this.anonimoId) qLista = qLista.eq("cliente_anonimo_id", this.anonimoId);

    const { data: espera, error: errLista } = await qLista.maybeSingle();
    if (!errLista && espera) {
      this.yaRegistrado = true;
      this.session.yaRegistrado = true;
    }
  }

  async escanearQrMesa() {
    const qr = await this.qr.scanQr();
    if (!qr) return;

    const { data: au } = await supabase.auth.getUser();
    const email = au?.user?.email;

    let puedeEntrar = false;

    if (email) {
      const ahora = new Date();
      const hace45 = new Date(ahora.getTime() - 45 * 60 * 1000);
      const dentro45 = new Date(ahora.getTime() + 45 * 60 * 1000);

      const { data: reservasActivas } = await supabase
        .from("reservas")
        .select("id, estado, fecha_hora")
        .eq("usuario_correo", email)
        .in("estado", ["confirmada", "en curso"])
        .gte("fecha_hora", hace45.toISOString())
        .lte("fecha_hora", dentro45.toISOString());

      if (reservasActivas && reservasActivas.length > 0) {
        puedeEntrar = true;
      }
    }

    if (!puedeEntrar) {
      let asignacionQuery = supabase
        .from("asignaciones_mesa")
        .select("mesa_id, estado")
        .in("estado", ["asignada", "sentado"]);

      if (this.clienteId) {
        asignacionQuery = asignacionQuery.eq("cliente_id", this.clienteId);
      } else if (this.anonimoId) {
        asignacionQuery = asignacionQuery.eq("cliente_anonimo_id", this.anonimoId);
      }

      const { data: asignacionActiva } = await asignacionQuery.maybeSingle();

      if (asignacionActiva) {
        puedeEntrar = true;
        this.mesaAsignadaId = asignacionActiva.mesa_id;
        this.session.mesaAsignadaId = asignacionActiva.mesa_id;
        this.session.tienePermiso = true;
      }
    }

    if (!puedeEntrar) {
      await this.mostrarToast("No tienes ninguna reserva ni mesa asignada activa.");
      return;
    }

    const res = await this.qr.procesarQrCliente(qr, this.clienteId ?? undefined, this.anonimoId ?? undefined);

    if (res.error) {
      this.mostrarToast(res.error);
      return;
    }

    if (res.mesaAsignada) {
      const mesaId = res.mesaAsignada;
      const mesaNumero = res.numero;

      const { data } = await supabase
        .from("pedidos")
        .select("id, estado")
        .eq("mesa_id", mesaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const qp: any = { mesaId, numero: mesaNumero };
      if (this.anonimoId) qp.anonimoId = this.anonimoId;
      if (this.usuarioId) qp.usuarioId = this.usuarioId;
      if (this.clienteId) qp.clienteId = this.clienteId;

      if (data) {
        this.estadoPedido = data.estado;
        this.pedidoId = data.id;
        this.session.pedidoId = this.pedidoId;
        this.session.estadoPedido = this.estadoPedido;

        this.qrMesaEscaneado = true;

        if (this.estadoPedido === "rechazado") {
          await this.router.navigate(["/mesa-ocupada"], { queryParams: qp });
          return;
        }

        if (this.estadoPedido === "aceptado") {
          await this.checkEstadoTrasScan(mesaId, this.userUid ?? null, null);
        }

        if (this.estadoPedido === "recibido") {
          (
            await this.toast.create({
              message: "Pedido Entregado",
              duration: 1500,
              position: "top",
              cssClass: "toast",
            })
          ).present();
        }

        this.actualizarFlags();
        this.suscribirPedido(this.pedidoId);

        if (this.shouldToastMesaVinculada(mesaId)) {
          this.mostrarToast(`Mesa ${mesaNumero} vinculada correctamente.`);
        }
        return;
      }

      await this.router.navigate(["/mesa-ocupada"], { queryParams: qp });
      return;
    }

    this.mostrarToast("QR no reconocido o no autorizado.");
  }

  async checkEstadoTrasScan(mesaId: number, clienteUid: string | null, clienteEmail: string | null): Promise<void> {
    const pedidoId = await this.pedidos.getPedidoAceptadoActual(mesaId, clienteUid, clienteEmail);
    if (!pedidoId) return;
    const estados = await this.pedidos.getEstadosAreas(pedidoId);
    const msg = this.pedidos.resolverMensajeAreas(estados);
    if (!msg) return;
    const t = await this.toast.create({
      message: msg,
      duration: 1500,
      position: "top",
      cssClass: "toast",
    });
    await t.present();
  }

  private suscribirPedido(pedidoId: string | null) {
    if (!pedidoId) return;
    if (this.pedidoSub) supabase.removeChannel(this.pedidoSub);

    this.pedidoSub = supabase
      .channel(`pedido_${pedidoId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pedidos",
          filter: `id=eq.${pedidoId}`,
        },
        (payload) => {
          const nuevoEstado = (payload.new as any)["estado"];
          if (nuevoEstado) {
            this.estadoPedido = nuevoEstado;
            this.session.estadoPedido = nuevoEstado;
            if (nuevoEstado === "pagado") {
              this.limpiarIntentosJuegos().finally(() => this.resetVista());
              return;
            }
            this.actualizarFlags();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "pedidos",
          filter: `id=eq.${pedidoId}`,
        },
        async () => {
          await this.limpiarIntentosJuegos();
          this.resetVista();
        }
      )
      .subscribe();
  }

  async registrarseListaEspera() {
    if (this.yaRegistrado) return;

    const { data: existe } = this.anonimoId
      ? await supabase.from("lista_espera").select("id").eq("cliente_anonimo_id", this.anonimoId).maybeSingle()
      : await supabase.from("lista_espera").select("id").eq("cliente_id", this.clienteId!).maybeSingle();

    if (existe) {
      this.yaRegistrado = true;
      this.mostrarToast("Ya estabas en la lista.");
      return;
    }

    const payload: any = { estado: "pendiente" };
    const tk = this.push.getToken();
    if (tk) payload.push_token = tk;
    if (this.clienteId) payload.cliente_id = this.clienteId;
    else if (this.anonimoId) payload.cliente_anonimo_id = this.anonimoId;
    else {
      this.mostrarToast("Error: no se detectó cliente");
      return;
    }

    const { error } = await supabase.from("lista_espera").insert(payload);
    if (error) {
      this.mostrarToast("Error al registrarse en la lista de espera");
      return;
    }

    this.yaRegistrado = true;
    this.mostrarToast("Se registró correctamente en la lista de espera");
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase.from("respuestas_encuestas").insert({
      usuario_id: this.usuarioId,
      encuesta_id: encuestaId,
      respondido_en: new Date().toISOString(),
    });
    this.mostrarToast("Gracias por participar en la encuesta!");
  }

  private actualizarFlags() {
    if (!this.estadoPedido) {
      this.mostrarCuenta = this.mostrarPedido = this.mostrarJuegos = false;
      return;
    }

    const st = this.estadoPedido.toLowerCase();
    const unlock = this.deliveryUnlock;
    const isDelivery = this.isDelivery;

    if (!this.qrMesaEscaneado && !unlock && !isDelivery) {
      this.mostrarCuenta = false;
      this.mostrarPedido = false;
      this.mostrarJuegos = false;
      return;
    }

    const basePedido = ["pendiente", "aceptado", "recibido", "terminado"];
    this.mostrarPedido = isDelivery ? [...basePedido, "rechazado"].includes(st) : basePedido.includes(st);

    this.mostrarJuegos = unlock ? ["aceptado", "recibido", "terminado"].includes(st) : ["aceptado", "recibido"].includes(st);

    this.mostrarCuenta = (this.qrMesaEscaneado || unlock || isDelivery) && ["recibido", "terminado"].includes(st);

    if (["impagado", "cancelado"].includes(st)) {
      this.mostrarCuenta = this.mostrarJuegos = this.mostrarPedido = false;
    }
    if (st === "pagado") {
      this.limpiarIntentosJuegos();
      this.resetVista();
    }
  }

  private resetVista() {
    this.mesaAsignadaId = null;
    this.estadoPedido = null;
    this.pedidoId = null;
    this.yaRegistrado = false;
    this.tieneMesa = false;
    this.mostrarCuenta = false;
    this.mostrarPedido = false;
    this.mostrarJuegos = false;
    this.qrValido = false;
    this.tienePermiso = false;
    this.qrMesaEscaneado = false;
  }

  private async limpiarIntentosJuegos() {
    if (!this.userUid) {
      const { data: au } = await supabase.auth.getUser();
      this.userUid = au?.user?.id || undefined;
    }
    try {
      if (this.userUid)
        await supabase.from("intentos_juegos").delete().eq("cliente_uid", this.userUid);
      else if (this.clienteId)
        await supabase.from("intentos_juegos").delete().eq("cliente_id", this.clienteId);
    } catch { }
  }

  async pedirCuenta(): Promise<void> {
    try {
      await this.push.ready();

      if (this.mesaAsignadaId) {
        const { data: mesaRow } = await supabase.from("mesas").select("numero").eq("id", this.mesaAsignadaId).maybeSingle();
        const mesaNumero = mesaRow?.numero ?? this.mesaAsignadaId;
        await this.push.sendToRoles(
          ["mozo"],
          "Cuenta Solicitada",
          `Cliente Mesa (${mesaNumero}) solicita la cuenta`,
          {
            tipo: "pedir_cuenta",
            mesaId: this.mesaAsignadaId,
            mesaNumero,
          }
        );
        this.mostrarToast("Aviso enviado al mozo.");
        return;
      }

      if (this.deliveryUnlock && this.pedidoId) {
        await this.push.sendToRoles(
          ["mozo"],
          "Cuenta solicitada",
          "Cliente delivery solicita la cuenta",
          { tipo: "pedir_cuenta_delivery", pedidoId: this.pedidoId }
        );
        this.mostrarToast("Aviso enviado.");
      }
    } catch (e: any) {
      this.mostrarToast(e?.message ?? "No se pudo notificar");
    }
  }

  async salir() {
    try {
      await supabase.auth.signOut();
    } catch { }
    this.session.limpiar();
    this.router.navigate(["/login"], { replaceUrl: true });
  }

  private async mostrarToast(mensaje: string, header?: string) {
    const t = await this.toast.create({
      header,
      message: mensaje,
      duration: 1500,
      cssClass: "toast",
      position: "top",
    });
    await t.present();
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private async ensureDeliveryChatAndSubscribe(): Promise<void> {
    if (!this.pedidoId) return;

    if (!this.myUserId) {
      const { data: au } = await supabase.auth.getUser();
      this.myUserId = this.anonimoId ? `anon-${this.anonimoId}` : au.user?.id ?? undefined;
    }

    const chat = await this.chatSvc.getOrCreateForDeliveryByPedido(this.pedidoId);
    if (this.lastDeliveryChatId === chat.id) return;
    this.lastDeliveryChatId = chat.id;
    this.deliveryChatId = chat.id;

    await this.bindDeliveryChatToken(this.deliveryChatId, "cliente");

    this.chatSvc.bindMyPushToken(this.deliveryChatId, this.anonimoId).catch(() => { });

    this.deliverySeenIds.clear();
    const msgs = await this.chatSvc.loadMessages(this.deliveryChatId, 200);

    this.deliveryMessages = msgs.map((m) => {
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role: "delivery" | "cliente" = vm.from === "yo" ? "cliente" : "delivery";
      return {
        id: vm.id,
        from: vm.from as "yo",
        role,
        text: vm.text,
        time: vm.time,
      };
    });
    for (const m of msgs) this.deliverySeenIds.add(m.id);

    this.scrollToBottomAfterRender();

    try {
      this.chatSvc.unsubscribe?.();
    } catch { }

    this.chatSvc.subscribeToMessages(this.deliveryChatId, (m) => {
      if (m.user_id === this.myUserId) return;
      if (this.deliverySeenIds.has(m.id)) return;
      this.deliverySeenIds.add(m.id);

      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      const role: "delivery" | "cliente" = vm.from === "yo" ? "cliente" : "delivery";

      this.zone.run(() => {
        this.deliveryMessages.push({
          id: vm.id,
          from: vm.from as "yo",
          role,
          text: vm.text,
          time: vm.time,
        });
        this.scrollToBottomAfterRender();
      });
    });
  }

  async openDeliveryChat(): Promise<void> {
    if (!this.deliveryChatId) {
      await this.ensureDeliveryChatAndSubscribe();
    }
    this.deliveryChatOpen = true;
    this.deliveryChatReady = true;
    this.scrollToBottomAfterRender();
  }

  async closeDeliveryChat(): Promise<void> {
    await this.deliveryChatModal?.dismiss();
    this.deliveryChatOpen = false;
    this.deliveryChatReady = false;
  }

  async sendDeliveryMessage(): Promise<void> {
    if (!this.deliveryChatReady || !this.deliveryChatId) return;
    const txt = this.deliveryNewMsg.trim();
    if (!txt) return;

    const tempId = "temp-" + Date.now();
    const now = new Date();

    this.deliveryMessages.push({
      id: tempId,
      from: "yo",
      role: "cliente",
      text: txt,
      time: this.hhmm(now),
    });
    this.scrollToBottomAfterRender();
    this.deliveryNewMsg = "";

    const saved = await this.chatSvc.sendMessage(this.deliveryChatId, txt, this.anonimoId);
    const vm = this.chatSvc.toViewMessage(saved, this.myUserId!);
    const role: "delivery" | "cliente" = "cliente";

    const idx = this.deliveryMessages.findIndex((m) => m.id === tempId);
    if (idx >= 0) {
      this.deliveryMessages[idx] = {
        id: vm.id,
        from: vm.from as "yo",
        role,
        text: vm.text,
        time: vm.time,
      };
    } else if (!this.deliverySeenIds.has(saved.id)) {
      this.deliveryMessages.push({
        id: vm.id,
        from: vm.from as "yo",
        role,
        text: vm.text,
        time: vm.time,
      });
    }

    this.deliverySeenIds.add(saved.id);
    await this.notifyDeliveryPeers(this.deliveryChatId, "cliente", txt);
  }

  private async ensureChatAndSubscribe(): Promise<void> {
    const mesaId = this.mesaAsignadaId;
    if (!mesaId) return;

    if (!this.myUserId) {
      const { data: au } = await supabase.auth.getUser();
      this.myUserId = this.anonimoId ? `anon-${this.anonimoId}` : au.user?.id ?? undefined;
    }

    const chat = await this.chatSvc.getOrCreateForMesa(mesaId, "cliente", this.anonimoId);
    if (this.lastChatId === chat.id) return;
    this.lastChatId = chat.id;
    this.chatId = chat.id;

    this.chatSvc.bindMyPushToken(this.chatId, this.anonimoId).catch(() => { });

    const since = await this.chatSvc.getMesaSince(mesaId);

    this.seenIds.clear();
    this.messages = [];

    const msgs = await this.chatSvc.loadMessagesSince(this.chatId, since, 200);

    const unique = new Map<string, ChatMessage>();
    for (const m of msgs) unique.set(m.id, m);

    this.messages = Array.from(unique.values()).map((m) => this.chatSvc.toViewMessage(m, this.myUserId!));
    for (const m of unique.values()) this.seenIds.add(m.id);

    this.scrollToBottomAfterRender();

    try {
      this.chatSvc.unsubscribe?.();
    } catch { }

    this.chatSvc.subscribeToMessages(
      this.chatId,
      (m) => {
        if (m.user_id === this.myUserId) return;
        if (this.seenIds.has(m.id)) return;
        this.seenIds.add(m.id);

        const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
        const ya = this.messages.some((x) => x.id === vm.id);
        if (ya) return;

        this.zone.run(() => {
          this.messages.push(vm);
          this.scrollToBottomAfterRender();
        });
      },
      since
    );
  }

  async openChat() {
    if (!this.chatId && this.mesaAsignadaId) {
      const chat = await this.chatSvc.getOrCreateForMesa(this.mesaAsignadaId, "cliente", this.anonimoId);
      this.chatId = chat.id;
      await this.chatSvc.bindMyPushToken(this.chatId, this.anonimoId);
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
    if (!this.chatReady || !this.chatId) return;
    const txt = this.newMsg.trim();
    if (!txt) return;

    const tempId = "temp-" + Date.now();
    const now = new Date();

    this.messages.push({
      id: tempId,
      from: "yo",
      role: "cliente",
      text: txt,
      time: this.hhmm(now),
    });
    this.scrollToBottomAfterRender();
    this.newMsg = "";

    const saved = await this.chatSvc.sendMessage(this.chatId, txt, this.anonimoId);
    const vm = this.chatSvc.toViewMessage(saved, this.myUserId!);
    const role: "mozo" | "cliente" = "cliente";

    const idx = this.messages.findIndex((m) => m.id === tempId);
    if (idx >= 0) {
      this.messages[idx] = {
        id: vm.id,
        from: vm.from,
        role,
        text: vm.text,
        time: vm.time,
      };
    } else if (!this.seenIds.has(saved.id)) {
      this.messages.push({
        id: vm.id,
        from: vm.from,
        role,
        text: vm.text,
        time: vm.time,
      });
    }

    this.seenIds.add(saved.id);
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