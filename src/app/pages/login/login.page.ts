import { Component, OnInit } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "src/app/services/auth/auth";
import { FormBuilder, Validators } from "@angular/forms";
import { Push } from "src/app/services/push/push";
import { supabase } from "src/supabase.client";

@Component({
  selector: "app-login",
  standalone: false,
  templateUrl: "./login.page.html",
  styleUrls: ["./login.page.scss"]
})
export class LoginPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;

  formLogin: ReturnType<FormBuilder["group"]>;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private push: Push
  ) {
    this.formLogin = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]]
    });
  }


  async ngOnInit() {
    const session = await this.auth.getSession();
    if (session) {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id as string | undefined;
      if (userId) {
        const { data: u } = await supabase.from("usuarios").select("perfil").eq("id", userId).single();
        const role = u?.perfil === "mozo" ? "mozo" : "cliente";
        await this.push.init(userId, role);
        if (role === "mozo") this.push.initMozoHandlers();
        await this.push.ready();
      }
      this.router.navigateByUrl("/home", { replaceUrl: true });
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

    const { email, password } = this.formLogin.value as { email: string; password: string };
    const { error } = await this.auth.signIn(email, password);
    if (error) { this.errorMsg = true; return; }

    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id as string;
    const { data: u } = await supabase.from("usuarios").select("perfil").eq("id", userId).single();
    const role = u?.perfil === "mozo" ? "mozo" : "cliente";
    await this.push.init(userId, role);
    if (role === "mozo") this.push.initMozoHandlers();
    await this.push.ready();

    this.router.navigateByUrl("/home", { replaceUrl: true });
  }

  async quickLogin(user: { email: string; password: string }) {
    this.formLogin.patchValue(user);
  }

  closeError() { this.errorMsg = false; }
}