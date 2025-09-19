import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth/auth';
import { Router } from '@angular/router';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { Usuario } from 'src/app/interfaces/usuario';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
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

  constructor(private auth: AuthService, private router: Router, private usuarios: Usuarios) { }

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
      setTimeout(() => {
        this.loading = false;
      }, 2000);
    }
  }

  async logOut() {
    try {
      const anyAuth = this.auth as any;
      if (typeof anyAuth.signOut === 'function') {
        await anyAuth.signOut({ scope: 'local' });
      } else if (typeof anyAuth.signOutLocal === 'function') {
        await anyAuth.signOutLocal();
      }
    } catch { }

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          localStorage.removeItem(k);
          i--;
        }
      }

      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          sessionStorage.removeItem(k);
          i--;
        }
      }
    } catch { }

    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}



