import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth';
import { FormBuilder, Validators } from '@angular/forms';
import { Push } from 'src/app/services/push/push';
import { supabase } from 'src/supabase.client';

type Role = 'mozo' | 'cliente';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;
  errorText: string = 'Ocurrió un error';

  formLogin: ReturnType<FormBuilder['group']>;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private push: Push
  ) {
    this.formLogin = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  private isApproved(perfil?: string, estado?: string): boolean {
    if (perfil === 'cliente_registrado' && estado === 'activo') {
      return true;
    }
    return perfil !== 'cliente_registrado'; // otros perfiles no necesitan estado
  }

  private async initPush(userId: string, role: Role) {
    await this.push.init(userId, role);
    if (role === 'mozo') this.push.initMozoHandlers();
    await this.push.ready();
  }

  async ngOnInit() {
    const session = await this.auth.getSession();
    if (session) {
      const { data: authData } = await supabase.auth.getUser();
      const authId = authData.user?.id as string | undefined;

      if (authId) {
        const { data: u } = await supabase
          .from('usuarios')
          .select('perfil, clientes(estado)')
          .eq('auth_id', authId)   // ✅ corregido
          .maybeSingle();

        const perfil = u?.perfil;
        const estado = u?.clientes?.[0]?.estado;

        if (!this.isApproved(perfil, estado)) {
          await supabase.auth.signOut();
          this.errorText = 'Cuenta Pendiente de Aprobación.';
          this.errorMsg = true;
          return;
        }

        const role: Role = perfil === 'mozo' ? 'mozo' : 'cliente';
        await this.initPush(authId, role);
      }

      await this.router.navigateByUrl('/home', { replaceUrl: true });
      return;
    }

    setTimeout(() => (this.loading = false), 2000);
  }

  goAnonRegister() {
    this.router.navigateByUrl('/anon-register');
  }

  async onLogin() {
    this.errorMsg = false;
    this.formLogin.markAllAsTouched();
    this.formLogin.updateValueAndValidity({ emitEvent: true });
    if (this.formLogin.invalid) return;

    const { email, password } = this.formLogin.value as {
      email: string;
      password: string;
    };
    const { error } = await this.auth.signIn(email, password);
    if (error) {
      this.errorText = 'Credenciales Inválidas';
      this.errorMsg = true;
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const authId = authData.user?.id as string | undefined;

    if (!authId) {
      this.errorText = 'No se pudo obtener el usuario';
      this.errorMsg = true;
      return;
    }

    const { data: u } = await supabase
      .from('usuarios')
      .select('perfil, clientes(estado)')
      .eq('user_id', authId)   // ✅ corregido
      .maybeSingle();

    const perfil = u?.perfil;
    const estado = u?.clientes?.[0]?.estado;

    if (!this.isApproved(perfil, estado)) {
      await supabase.auth.signOut();
      this.errorText = 'Cuenta Pendiente de Aprobación.';
      this.errorMsg = true;
      return;
    }

    const role: Role = perfil === 'mozo' ? 'mozo' : 'cliente';
    await this.initPush(authId, role);

    await this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  async quickLogin(user: { email: string; password: string }) {
    this.formLogin.patchValue(user);
  }

  closeError() {
    this.errorMsg = false;
  }
}
