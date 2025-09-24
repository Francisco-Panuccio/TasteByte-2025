import { Component, OnInit, OnDestroy, inject } from "@angular/core";
import { Router } from "@angular/router";
import { ToastController } from "@ionic/angular";
import { Clientes } from "src/app/services/clientes/clientes";
import { Usuario } from "src/app/interfaces/usuario";
import { ClienteRegistrado } from "src/app/interfaces/cliente";
import { Email } from "src/app/services/email/email";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { Subscription } from "rxjs";

@Component({
  selector: "app-listado-clientes",
  templateUrl: "./listado-clientes.page.html",
  styleUrls: ["./listado-clientes.page.scss"],
  standalone: false
})
export class ListadoClientesPage implements OnInit, OnDestroy {
  private clientesSvc = inject(Clientes);
  private emailSvc = inject(Email);
  private push = inject(Push);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  loading: boolean = true;
  err: string | null = null;
  ok: string | null = null;

  clientes: (ClienteRegistrado & { usuario: Usuario })[] = [];

  private pushSub?: Subscription;
  private rtChannel?: ReturnType<typeof supabase.channel>;

  async ngOnInit() {
    await this.cargarPendientes();
    await this.push.init(undefined, "supervisor");
    await this.push.ready();

    this.pushSub = this.push.onPush$.subscribe(async (data: any) => {
      const tipo = data?.tipo ?? data?._type ?? "";
      if (tipo === "nuevo_cliente") {
        const nombre = (data?.cliente_nombre as string) || "";
        await this.presentPushToast(
          "Nuevo cliente registrado en espera de aprobación",
          nombre,
          () => this.cargarPendientes()
        );
      }
    });

    this.rtChannel = supabase
      .channel("rt-clientes-pendientes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clientes" },
        async (payload) => {
          const row: any = payload.new;
          if (row?.tipo === "cliente_registrado") {
            await this.presentPushToast(
              "Nuevo cliente registrado en espera de aprobación",
              "",
              () => this.cargarPendientes()
            );
          }
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

  private async presentPushToast(header: string, message: string, onView?: () => void): Promise<void> {
    const t = await this.toastCtrl.create({
      header,
      message,
      position: "top",
      cssClass: "toasty",
      duration: undefined,
      buttons: [
        {
          text: "Ver",
          role: "confirm",
          handler: async () => {
            try { onView?.(); } catch { }
            try { await this.router.navigate(["/listado-clientes"]); } catch { }
          }
        },
        { text: "Cerrar", role: "cancel" }
      ]
    });
    await t.present();
  }

  async aprobar(usuarioId: string) {
    try {
      const cliente = this.clientes.find(c => c.usuario_id === usuarioId);
      if (!cliente) throw new Error("Cliente no encontrado");

      await this.clientesSvc.aprobar(usuarioId);

      await this.emailSvc.sendEmail(
        cliente.usuario.correo_electronico,
        "🎉 ¡Registro Aprobado! - Tu Cuenta Ya Está Activa",
        "registro_aprobado",
        {
          nombres: cliente.usuario.nombres,
          apellidos: cliente.usuario.apellidos
        }
      );

      this.ok = "Cliente aprobado y notificado por email";
      await this.cargarPendientes();
    } catch (e: any) {
      console.error("Error al aprobar cliente:", e);
      this.err = e.message || "No se pudo aprobar el cliente";
    }
  }

  async rechazar(usuarioId: string) {
    try {
      const cliente = this.clientes.find(c => c.usuario_id === usuarioId);
      if (!cliente) throw new Error("Cliente no encontrado");

      await this.clientesSvc.rechazar(usuarioId);

      await this.emailSvc.sendEmail(
        cliente.usuario.correo_electronico,
        "❌ Estado de tu Registro - Comunicación Importante",
        "registro_rechazado",
        {
          nombres: cliente.usuario.nombres,
          apellidos: cliente.usuario.apellidos
        }
      );

      this.ok = "Cliente rechazado y notificado por email";
      await this.cargarPendientes();
    } catch (e: any) {
      console.error("Error al aprobar/rechazar cliente:", e);
      this.err = e.message || "No se pudo rechazar el cliente";
    }
  }
}