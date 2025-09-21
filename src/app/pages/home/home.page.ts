import { Component, OnInit } from "@angular/core";
import { AuthService } from "src/app/services/auth/auth";
import { Router } from "@angular/router";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Usuario } from "src/app/interfaces/usuario";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
import { ActivatedRoute } from "@angular/router";
import { Qr } from "src/app/services/qr/qr";

@Component({
  selector: "app-home",
  templateUrl: "home.page.html",
  styleUrls: ["home.page.scss"],
  standalone: false
})
export class HomePage implements OnInit {
  loading: boolean = true;
  isDuenoSupervisor: boolean = false;
  isCocinero: boolean = false;
  isBartender: boolean = false;
  isMaitre: boolean = false;
  isCliente: boolean = false;
  isMozo: boolean = false;
  userId: string = ""; 

  fullname: string = "";
  profile: string = "";

  constructor(
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios,
    private push: Push,
    private route: ActivatedRoute,
    private qr: Qr
  ) {}

async ngOnInit() {
  try {

    //agregue esto para los anon clientes porque no deben pasar por el auth.getUser
    this.route.queryParams.subscribe(async params => {
      const anonimoId = params['anonimoId'];

      if (anonimoId) {
        this.isCliente = true;
        this.profile = "cliente_anonimo";
        this.fullname = "Cliente Anónimo";
        this.loading = false;
        return; 
      }

      //de aca en adelante todo lo que ya teniamos
      const user = await this.auth.getUser();
      if (!user) {
        this.router.navigateByUrl("/login", { replaceUrl: true });
        return;
      }

      const usuarioDB: Usuario | null = await this.usuarios.getByEmail(user.email!);
      if (!usuarioDB) {
        this.router.navigateByUrl("/login", { replaceUrl: true });
        return;
      }

      this.fullname = `${usuarioDB.nombres} ${usuarioDB.apellidos}`.trim();
      this.profile = usuarioDB.perfil;
      this.userId = String(usuarioDB.id ?? "");


      const perfil = usuarioDB.perfil?.toLowerCase();
      this.isDuenoSupervisor = perfil === "dueno" || perfil === "dueño" || perfil === "supervisor";
      this.isCocinero = perfil === "cocinero";
      this.isBartender = perfil === "bartender";
      this.isMaitre = perfil === "maître" || perfil === "maitre";
      this.isCliente = perfil === "cliente_registrado" || perfil === "cliente_anonimo" || perfil === "cliente_anónimo";
      this.isMozo = perfil === "mozo";
    });
  } catch (e) {
    console.error(e);
    this.router.navigateByUrl("/login", { replaceUrl: true });
  } finally {
    setTimeout(() => { this.loading = false; }, 2000);
  }
}

  async logOut() {
    try {
      const tok = this.push.getToken();
      if (tok) {
        await supabase.from("push_tokens").update({ active: false }).eq("token", tok);
      }
    } catch (e) {
      console.warn("[logout][push_token_deactivate]", e);
    }

    try {
      await (this.auth as any).signOut();
    } catch (e) {
      console.warn("[logout][signOut]", e);
    }

    this.router.navigateByUrl("/login", { replaceUrl: true });
  }

  async escanearQrEntrada() {
    try {
      const qrCode = await this.qr.scanQr();
      if (!qrCode) return;

      const res = await this.qr.procesarQrCliente(qrCode, this.userId, undefined);

      if (res.error) {
        alert(res.error);
        return;
      }

      if (res.permiso) {
        this.router.navigate(['/encuestas-espera'], {
          queryParams: { userId: this.userId }
        });
      }
    } catch (e) {
      console.error("Error escaneando QR de entrada", e);
      alert("No se pudo escanear el QR");
    }
  }

}