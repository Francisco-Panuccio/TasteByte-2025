import { Component, OnInit } from "@angular/core";
import { AuthService } from "src/app/services/auth/auth";
import { Router, ActivatedRoute } from "@angular/router";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Usuario } from "src/app/interfaces/usuario";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { Qr } from "src/app/services/qr/qr";
import { ToastController } from "@ionic/angular";

@Component({
  selector: "app-home",
  templateUrl: "home.page.html",
  styleUrls: ["home.page.scss"],
  standalone: false
})
export class HomePage implements OnInit {
  loading = true;
  isDuenoSupervisor = false;
  isCocinero = false;
  isBartender = false;
  isMaitre = false;
  isCliente = false;
  isMozo = false;

  userId = "";
  clienteId: number | null = null;
  usuarioId: number | null = null;
  fullname = "";
  profile = "";

  constructor(
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios,
    private push: Push,
    private route: ActivatedRoute,
    private qr: Qr,
    private toast: ToastController
  ) { }

  private perfilToRole(perfil?: string): string | undefined {
    const p = (perfil ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (p === "dueno") return "dueño";
    if (["supervisor", "maitre", "mozo", "bartender", "cocinero"].includes(p)) return p;
    if (p === "cliente_registrado" || p === "cliente_anonimo") return "cliente";
    return undefined;
  }

  async ngOnInit() {
    try {
      this.route.queryParams.subscribe(async params => {
        const anonimoId = params["anonimoId"];
        if (anonimoId) {
          this.isCliente = true;
          this.profile = "cliente_anonimo";
          this.fullname = "Cliente Anónimo";
          this.loading = false;
          return;
        }

        const user = await this.auth.getUser();
        if (!user) {
          this.router.navigateByUrl("/login", { replaceUrl: true });
          return;
        }
        this.userId = user.id;

        const usuarioDB: Usuario | null = await this.usuarios.getByEmail(user.email!);
        if (!usuarioDB) {
          this.router.navigateByUrl("/login", { replaceUrl: true });
          return;
        }

        this.fullname = `${usuarioDB.nombres} ${usuarioDB.apellidos}`.trim();
        this.profile = usuarioDB.perfil;
        this.usuarioId = usuarioDB.id ?? null;

        const { data: cliente } = await supabase
          .from("clientes")
          .select("id")
          .eq("usuario_id", usuarioDB.id)
          .maybeSingle();
        this.clienteId = cliente?.id ?? null;

        const perfil = usuarioDB.perfil?.toLowerCase();
        this.isDuenoSupervisor = perfil === "dueno" || perfil === "dueño" || perfil === "supervisor";
        this.isCocinero = perfil === "cocinero";
        this.isBartender = perfil === "bartender";
        this.isMaitre = perfil === "maître" || perfil === "maitre";
        this.isCliente = perfil === "cliente_registrado" || perfil === "cliente_anonimo" || perfil === "cliente_anónimo";
        this.isMozo = perfil === "mozo";

        const role = this.perfilToRole(usuarioDB.perfil);
        await this.push.init(this.usuarioId ?? this.userId, role as any);
        await this.push.ready();
      });
    } catch {
      this.router.navigateByUrl("/login", { replaceUrl: true });
    } finally {
      setTimeout(() => { this.loading = false; }, 2000);
    }
  }

  async logOut() {
    try {
      const tok = this.push.getToken();
      if (tok) await supabase.from("push_tokens").update({ active: false }).eq("token", tok);
    } catch { }
    try { await (this.auth as any).signOut(); } catch { }
    this.router.navigateByUrl("/login", { replaceUrl: true });
  }

  private async mostrarToast(mensaje: string, color: string = "primary") {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      cssClass: "toast2",
      position: "bottom",
      buttons: [{ text: "OK", role: "cancel" }]
    });
    await t.present();
  }

  async escanearQrEntrada() {
    this.router.navigate(['/encuestas-espera'], {
        queryParams: { clienteId: this.clienteId, tienePermiso : true, yaRegistrado: true, qrValido : true, userId : this.userId}
      });
    }
  //   const qr = await this.qr.scanQr();
  //   if (!qr) return;

  //   const res = await this.qr.procesarQrCliente(
  //     qr,
  //     this.clienteId ?? undefined
  //   );

  //   if (res.error) {
  //     this.mostrarToast(res.error, 'danger');
  //     return;
  //   }

  //   if (res.permiso && qr.startsWith('INGRESO')) {

  //     this.router.navigate(['/encuestas-espera'], {
  //       queryParams: { clienteId: this.clienteId, tienePermiso : true, yaRegistrado: !!res.yaRegistrado, qrValido : true, userId : this.userId}
  //     });
  //   }
  // }
}