import { Component, OnInit } from "@angular/core";
import { AuthService } from "src/app/services/auth/auth";
import { Router, ActivatedRoute } from "@angular/router";
import { Usuarios } from "src/app/services/usuarios/usuarios";
import { Usuario } from "src/app/interfaces/usuario";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";
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

  userId: string = "";          // 🔹 UUID de Supabase (auth)
  clienteId: number | null = null; // 🔹 ID int de la tabla clientes
  usuarioId: number | null = null; // 🔹 ID int de la tabla usuarios
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
      this.route.queryParams.subscribe(async params => {
        const anonimoId = params["anonimoId"];
        if (anonimoId) {
          this.isCliente = true;
          this.profile = "cliente_anonimo";
          this.fullname = "Cliente Anónimo";
          this.loading = false;
          return;
        }

        const user = await this.auth.getUser(); // 🔹 UUID del auth
        if (!user) {
          this.router.navigateByUrl("/login", { replaceUrl: true });
          return;
        }
        this.userId = user.id; // guardamos el UUID del auth

        // 🔹 obtenemos el usuario en nuestra tabla "usuarios"
        const usuarioDB: Usuario | null = await this.usuarios.getByEmail(user.email!);
        if (!usuarioDB) {
          this.router.navigateByUrl("/login", { replaceUrl: true });
          return;
        }

        this.fullname = `${usuarioDB.nombres} ${usuarioDB.apellidos}`.trim();
        this.profile = usuarioDB.perfil;
        this.usuarioId = usuarioDB.id ?? null; // ✅ guardamos INT de usuarios

        // 🔹 buscamos cliente usando el id de usuarios (INT)
        const { data: cliente } = await supabase
          .from("clientes")
          .select("id")
          .eq("usuario_id", usuarioDB.id) // usamos el int de usuarios
          .maybeSingle();

        this.clienteId = cliente?.id ?? null;

        const perfil = usuarioDB.perfil?.toLowerCase();
        this.isDuenoSupervisor = perfil === "dueno" || perfil === "dueño" || perfil === "supervisor";
        this.isCocinero = perfil === "cocinero";
        this.isBartender = perfil === "bartender";
        this.isMaitre = perfil === "maître" || perfil === "maitre";
        this.isCliente =
          perfil === "cliente_registrado" || perfil === "cliente_anonimo" || perfil === "cliente_anónimo";
        this.isMozo = perfil === "mozo";
      });
    } catch (e) {
      console.error(e);
      this.router.navigateByUrl("/login", { replaceUrl: true });
    } finally {
      setTimeout(() => {
        this.loading = false;
      }, 2000);
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
      if (!this.clienteId) {
        console.error("No se encontró cliente para el usuario");
        return;
      }

      this.router.navigate(['/encuestas-espera'], {
        queryParams: { clienteId: this.clienteId } // pasamos INT
      });

    } catch (e) {
      console.error("Error escaneando QR de entrada", e);
      alert("No se pudo escanear el QR");
    }
  }
}
