import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth';
import { FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;

  formLogin: ReturnType<FormBuilder['group']>

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.formLogin = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
    })
  }

  async ngOnInit() {
    const session = await this.auth.getSession();
    if (session) {
      this.router.navigateByUrl("/home", { replaceUrl: true });
    }
    setTimeout(() => this.loading = false, 2000);
  }

  async onLogin() {
    this.errorMsg = false;
    this.formLogin.markAllAsTouched();
    this.formLogin.updateValueAndValidity({ emitEvent: true });

    if (this.formLogin.invalid) return;
    const { email, password } = this.formLogin.value as any;
    const { error } = await this.auth.signIn(email, password);

    if (error) {
      console.log(error);
      this.errorMsg = true;
      return;
    }
    
    this.router.navigateByUrl("/home", { replaceUrl: true });
  }

  async quickLogin(user: { email: string, password: string }) {
    this.formLogin.patchValue(user)
  }

  closeError() { this.errorMsg = false; }
}
