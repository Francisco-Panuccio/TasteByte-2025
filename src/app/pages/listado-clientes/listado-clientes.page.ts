import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import { Clientes } from "src/app/services/clientes/clientes";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Usuario } from "src/app/interfaces/usuario";
import { ClienteRegistrado } from "src/app/interfaces/cliente";
import { Email } from "src/app/services/email/email";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { Subscription } from "rxjs";
import { ToastController } from "@ionic/angular";

type RoleLike = "dueño" | "supervisor";

@Component({
  selector: "app-listado-clientes",
  templateUrl: "./listado-clientes.page.html",
  styleUrls: ["./listado-clientes.page.scss"],
  standalone: false
})
export class ListadoClientesPage implements OnInit, OnDestroy {
  private clientesSvc = inject(Clientes);
  private usuariosSvc = inject(Usuarios);
  private emailSvc = inject(Email);
  private push = inject(Push);
  private toast = inject(ToastController);

  loading = true;
  err: string | null = null;
  ok: string | null = null;

  clientes: (ClienteRegistrado & { usuario: Usuario })[] = [];

  private pushSub?: Subscription;
  private rtChannel?: ReturnType<typeof supabase.channel>;
  private isPrivileged = false;
  private notifiedIds = new Set<number>();

  async ngOnInit() {
    const { data: auth } = await supabase.auth.getUser();
    const email = auth?.user?.email ?? null;

    let role: RoleLike | undefined;
    let usuarioRowId: number | undefined;

    if (email) {
      const u = await this.usuariosSvc.getByEmail(email);
      usuarioRowId = u?.id ?? undefined;
      const p = (u?.perfil ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
      role = p === "dueno" ? "dueño" : p === "supervisor" ? "supervisor" : undefined;
    }

    this.isPrivileged = !!role;

    try {
      await this.push.init(usuarioRowId ?? null, role);
      await this.push.ready();
    } catch { }

    const tk = this.push.getToken();
    if (!tk) {
      this.err = "Sin token FCM. Continuando sin notificaciones.";
    }

    await this.cargarPendientes();

    if (tk) {
      this.pushSub = this.push.onPush$.subscribe(async (data: any) => {
        const tipo = (data?.tipo ?? data?._type) as string;
        if (tipo === "cliente_registrado") await this.cargarPendientes();
      });
    }

    this.rtChannel = supabase
      .channel("rt-clientes-pendientes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clientes" },
        async (payload) => {
          const row: any = payload.new;
          if (!this.isPrivileged || row?.tipo !== "cliente_registrado") return;
          const id = Number(row.id);
          if (this.notifiedIds.has(id)) return;
          this.notifiedIds.add(id);
          try {
            await this.push.sendToRoles(
              ["dueño", "supervisor"],
              "Nuevo cliente pendiente",
              "Hay un registro esperando aprobación",
              { tipo: "cliente_registrado", cliente_id: row.usuario_id }
            );
          } catch { }
          await this.cargarPendientes();
        }
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    try { this.pushSub?.unsubscribe(); } catch { }
    try { if (this.rtChannel) supabase.removeChannel(this.rtChannel); } catch { }
  }

  async cargarPendientes() {
    this.loading = true;
    this.err = null;
    this.ok = null;
    try {
      this.clientes = await this.clientesSvc.listPendientes();
    } catch (e: any) {
      this.err = e.message || "Error al cargar clientes";
    } finally {
      setTimeout(() => { this.loading = false; }, 2000);
    }
  }

  async aprobar(usuarioId: string) {
    try {
      const cliente = this.clientes.find((c) => c.usuario_id === usuarioId);
      if (!cliente) throw new Error("Cliente no encontrado");
      await this.clientesSvc.aprobar(usuarioId);
      await this.emailSvc.enviarEmailPersonalizado(
        "🎉¡Registro Aprobado!🎉",
        cliente.usuario.correo_electronico,
        "Bienvenido a TasteByte",
        `<p>Buenas ${cliente.usuario.nombres + " " + cliente.usuario.apellidos}, su cuenta ya está activa.</p>
            <p>Ya puede experimentar todas las funcionalidades de nuestra aplicación.</p>
            <p>Muchas gracias, esperamos que disfrute nuestras comidas en TasteByte.</p>`,
        "Registro Recibido - Aprobado"
      );
      this.ok = "Cliente aprobado y notificado por email";
      await this.mostrarToast("Cliente Aprobado");
      await this.cargarPendientes();
    } catch (e: any) {
      this.err = e.message || "No se pudo aprobar el cliente";
    }
  }

  async rechazar(usuarioId: string) {
    try {
      const cliente = this.clientes.find((c) => c.usuario_id === usuarioId);
      if (!cliente) throw new Error("Cliente no encontrado");
      await this.clientesSvc.rechazar(usuarioId);
      await this.emailSvc.enviarEmailPersonalizado(
        "❌¡Registro Rechazado!❌",
        cliente.usuario.correo_electronico,
        "Bienvenido a TasteByte",
        `<p>Buenas ${cliente.usuario.nombres + " " + cliente.usuario.apellidos}, su cuenta fue rechazada.</p>
            <p>En caso de que sospeche que se trata de un error, le pedimos que vuelva a intentar registrarse.</p>
            <p>Luego del registro, un dueño o supervisor revisará nuevamente su ingreso.</p>
            <p>Muchas gracias, esperamos que pronto pueda disfrutar de nuestras comidas en TasteByte.</p>`,
        "Registro Recibido - Rechazado"
      );
      this.ok = "Cliente rechazado y notificado por email";
      await this.mostrarToast("Cliente Rechazado");
      await this.cargarPendientes();
    } catch (e: any) {
      this.err = e.message || "No se pudo rechazar el cliente";
    }
  }

  private async mostrarToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 1500,
      cssClass: "toast",
      position: "top"
    });
    await t.present();
  }
}