import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth/auth';
import { Router, ActivatedRoute } from '@angular/router';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { Usuario } from 'src/app/interfaces/usuario';
import { Push } from 'src/app/services/push/push';
import { supabase } from 'src/supabase.client';
import { Email } from 'src/app/services/email/email';

type Role =
  | 'mozo'
  | 'cliente'
  | 'dueño'
  | 'supervisor'
  | 'maitre'
  | 'cocinero'
  | 'bartender';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  loading = true;
  isDuenoSupervisor = false;
  isCocinero = false;
  isBartender = false;
  isMaitre = false;
  isCliente = false;
  isMozo = false;
  private skipNextLoading = false;

  userId = '';
  clienteId: number | null = null;
  usuarioId: number | null = null;
  email = '';
  profile = '';
  empleadoFoto = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios,
    private push: Push,
    private route: ActivatedRoute,
  ) { }

  private perfilToRole(perfil?: string): Role | undefined {
    const p = (perfil ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    if (p === 'dueno') return 'dueño';
    if (p === 'supervisor') return 'supervisor';
    if (p === 'maitre') return 'maitre';
    if (p === 'mozo') return 'mozo';
    if (p === 'bartender') return 'bartender';
    if (p === 'cocinero') return 'cocinero';
    if (p === 'cliente_registrado' || p === 'cliente_anonimo') return 'cliente';
    return undefined;
  }

  async ngOnInit() {
    const vieneDeLista = sessionStorage.getItem('desdeLista') === 'true';
    if (vieneDeLista) {
      this.loading = false;
      sessionStorage.removeItem('desdeLista');
    } else {
      this.loading = true;
    }

    try {
      this.route.queryParams.subscribe(async (params) => {
        const anonimoId = params['anonimoId'];

        if (anonimoId) {
          this.router.navigate(['/encuestas-espera'], {
            queryParams: { anonimoId },
            replaceUrl: true,
          });
          return;
        }

        const user = await this.auth.getUser();
        if (!user) {
          this.router.navigateByUrl('/login', { replaceUrl: true });
          return;
        }

        this.userId = user.id;
        const usuarioDB: Usuario | null = await this.usuarios.getByEmail(
          user.email!
        );
        if (!usuarioDB) {
          this.router.navigateByUrl('/login', { replaceUrl: true });
          return;
        }

        this.email = `${usuarioDB.correo_electronico}`.trim();
        this.profile = usuarioDB.perfil;
        this.usuarioId = usuarioDB.id ?? null;

        const p = (usuarioDB.perfil ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

        if (p === 'cliente_registrado') {
          const { data: cliente } = await supabase
            .from('clientes')
            .select('id')
            .eq('usuario_id', usuarioDB.id)
            .maybeSingle();

          this.router.navigate(['/encuestas-espera'], {
            queryParams: {
              clienteId: cliente?.id ?? null,
              usuarioId: usuarioDB.id,
              userId: user.id,
            },
            replaceUrl: true,
          });
          return;
        }

        const { data: empleado } = await supabase
          .from('usuarios')
          .select('foto_url')
          .eq('correo_electronico', this.email)
          .maybeSingle();
        this.empleadoFoto = empleado?.foto_url ?? '';

        this.isDuenoSupervisor = p === 'dueno' || p === 'supervisor';
        this.isCocinero = p === 'cocinero';
        this.isBartender = p === 'bartender';
        this.isMaitre = p === 'maitre';
        this.isMozo = p === 'mozo';
        this.isCliente = false;

        const role = this.perfilToRole(usuarioDB.perfil);
        await this.push.init(this.usuarioId ?? null, role);
        await this.push.ready();
      });
    } catch {
      this.router.navigateByUrl('/login', { replaceUrl: true });
    } finally {
      if (this.skipNextLoading) {
        this.loading = false;
        this.skipNextLoading = false;
        return;
      }

      this.loading = true;
      setTimeout(() => (this.loading = false), 2000);
    }
  }

  async logOut() {
    try {
      const tok = this.push.getToken();
      if (tok)
        await supabase
          .from('push_tokens')
          .update({ active: false })
          .eq('token', tok);
    } catch { }
    try {
      await (this.auth as any).signOut();
    } catch { }
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  ionViewWillEnter() {
    if (performance.getEntriesByType('navigation').length > 1) {
      this.loading = false;
      return;
    }

    this.loading = true;
    setTimeout(() => (this.loading = false), 2000);
  }
}
