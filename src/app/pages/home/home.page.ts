import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth/auth';
import { Router, ActivatedRoute } from '@angular/router';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { Usuario } from 'src/app/interfaces/usuario';
import { Push } from 'src/app/services/push/push';
import { supabase } from 'src/supabase.client';
import { Qr } from 'src/app/services/qr/qr';
import { ToastController } from '@ionic/angular';

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
    private qr: Qr,
    private toast: ToastController
  ) {}

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
    try {
      this.route.queryParams.subscribe(async (params) => {
        const anonimoId = params['anonimoId'];
        if (anonimoId) {
          this.isCliente = true;
          this.profile = 'cliente_anonimo';
          this.email = ' ☠︎ anonymous ☠︎';
          this.loading = false;
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

        const { data: empleado } = await supabase
          .from('usuarios')
          .select('foto_url')
          .eq('correo_electronico', this.email)
          .maybeSingle();
        this.empleadoFoto = empleado?.foto_url ?? '';

        const { data: cliente } = await supabase
          .from('clientes')
          .select('id')
          .eq('usuario_id', usuarioDB.id)
          .maybeSingle();
        this.clienteId = cliente?.id ?? null;

        const p = (usuarioDB.perfil ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

        this.isDuenoSupervisor = p === 'dueno' || p === 'supervisor';
        this.isCocinero = p === 'cocinero';
        this.isBartender = p === 'bartender';
        this.isMaitre = p === 'maitre';
        this.isCliente = p === 'cliente_registrado' || p === 'cliente_anonimo';
        this.isMozo = p === 'mozo';

        const role = this.perfilToRole(usuarioDB.perfil);
        await this.push.init(this.usuarioId ?? null, role);
        await this.push.ready();
      });
    } catch {
      this.router.navigateByUrl('/login', { replaceUrl: true });
    } finally {
      setTimeout(() => {
        this.loading = false;
      }, 2000);


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
    } catch {}
    try {
      await (this.auth as any).signOut();
    } catch {}
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async escanearQrEntrada() {
    this.router.navigate(['/encuestas-espera'], {
      queryParams: {
        clienteId: this.clienteId,
        tienePermiso: true,
        yaRegistrado: true,
        qrValido: true,
        userId: this.userId,
      },
    });
    //   const qr = await this.qr.scanQr();
    //   if (!qr) return;

    //   const res = await this.qr.procesarQrCliente(qr, this.clienteId ?? undefined);

    //   if (res.permiso && qr.startsWith("INGRESO")) {
    //     this.router.navigate(["/encuestas-espera"], {
    //       queryParams: {
    //         clienteId: this.clienteId,
    //         tienePermiso: true,
    //         yaRegistrado: !!res.yaRegistrado,
    //         qrValido: true,
    //         userId: this.userId
    //       }
    //     });
    //   }
    // }
  }
}
