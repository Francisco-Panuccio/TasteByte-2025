import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth';
import { FormBuilder, Validators } from '@angular/forms';


@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {
  errorMsg: boolean = false;
  email = '';
  password = '';
  errorMessage = '';
  loading = false;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {}

  formLogin = this.fb.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(6)]],
  });

  async onLogin() {
    this.errorMsg = false;
    this.formLogin.markAllAsTouched();
    this.formLogin.updateValueAndValidity({ emitEvent: true });

    if (this.formLogin.invalid) return;
    const { email, password } = this.formLogin.value as any;
    const { error } = await this.auth.signIn(email, password);

    if (error) {
      this.errorMsg = true;
      return;
    }

    this.router.navigateByUrl("/home", { replaceUrl: true });
  }

  async quickLogin(user: { email: string, password: string }) {
    this.formLogin.controls["email"].setValue(user.email);
    this.formLogin.controls["password"].setValue(user.password);
  }

  goToRegister() {
  this.router.navigate(['/register']);
  }

}
