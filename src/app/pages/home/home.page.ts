import { Component, OnInit } from "@angular/core";
import { AuthService } from "src/app/services/auth/auth";
import { Router } from "@angular/router";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Usuario } from "src/app/interfaces/usuario";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";

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

  fullname: string = "";
  profile: string = "";

  constructor(
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios,
    private push: Push
  ) {}

  async ngOnInit() {
    try {
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

      const perfil = usuarioDB.perfil?.toLowerCase();
      this.isDuenoSupervisor = perfil === "dueno" || perfil === "dueño" || perfil === "supervisor";
      this.isCocinero = perfil === "cocinero";
      this.isBartender = perfil === "bartender";
      this.isMaitre = perfil === "maître" || perfil === "maitre";
      this.isCliente = perfil === "cliente_registrado" || perfil === "cliente_anonimo" || perfil === "cliente_anónimo";
      this.isMozo = perfil === "mozo";
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
}