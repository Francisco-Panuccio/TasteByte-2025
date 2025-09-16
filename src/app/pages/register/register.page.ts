import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { User } from 'src/app/classes/user';
import { AuthService } from 'src/app/services/auth/auth';
import { Usuarios } from 'src/app/services/usuarios/usuarios';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],

})
export class RegisterPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;
  errorText = "Ocurrió un error";

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private usuarios: Usuarios) {
    this.formRegister = this.fb.group({
      fullname: ["", [Validators.required]],
      lastname: ["", [Validators.required]],
      documentType: ["dni", [Validators.required]],
      documentNumber: ["", [Validators.required, this.dniValidator]],
      profile: ["", [Validators.required]],
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required, Validators.minLength(6)]],
      confirm: ["", [Validators.required]],
    }, { validators: this.passwordsMatch })
  }

  formRegister: ReturnType<FormBuilder["group"]>

  passwordsMatch: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const pass = group.get("password")?.value ?? "";
    const conf = group.get("confirm")?.value ?? "";
    const confirmCtrl = group.get("confirm");
    if (!confirmCtrl) return null;

    const others = { ...(confirmCtrl.errors ?? {}) };
    delete (others as any)["passwordmatch"];

    if (conf && pass !== conf) {
      confirmCtrl.setErrors({ ...others, passwordmatch: true });
      return { passwordmatch: true };
    } else {
      confirmCtrl.setErrors(Object.keys(others).length ? others : null);
      return null;
    }
  };

  dniValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? "").replace(/\D/g, "");
    return v.length === 8 ? null : { dni: true };
  };

  cuilValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? "").replace(/\D/g, "");
    return v.length === 11 ? null : { cuil: true };
  };

  async ngOnInit() {
    this.formRegister.get("documentType")!.valueChanges.subscribe((t) => {
      const ctrl = this.formRegister.get("documentNumber")!;
      ctrl.clearValidators();
      ctrl.addValidators([Validators.required, t === 'dni' ? this.dniValidator : this.cuilValidator]);
      ctrl.updateValueAndValidity({ emitEvent: false });
    });
    setTimeout(() => this.loading = false, 2000);
  }

  async onRegister() {
    this.errorMsg = false;
    this.formRegister.markAllAsTouched();
    this.formRegister.updateValueAndValidity({ emitEvent: true });
    if (this.formRegister.invalid) return;

    const v = this.formRegister.value as any;
    const email: string = (v.email).trim().toLowerCase();
    const password: string = v.password;

    const digits = String(v.documentNumber ?? "").replace(/\D/g, "");
    const isDni = v.documentType === "dni";
    const dniStr = isDni ? digits : undefined;
    const cuilStr = !isDni ? digits : undefined;

    try {
      if (await this.usuarios.existsByEmail(email)) {
        this.errorText = "Correo ya registrado";
        this.errorMsg = true;
        return;
      }

      if (isDni && dniStr) {
        const dup = await this.usuarios.existsByDni(Number(dniStr));
        if (dup) {
          this.errorText = "DNI ya registrado";
          this.errorMsg = true;
          return;
        }
      } else if (!isDni && cuilStr) {
        const dup = await this.usuarios.existsByCuil(Number(cuilStr));
        if (dup) {
          this.errorText = "CUIL ya registrado";
          this.errorMsg = true;
          return;
        }
      }
    } catch {
      this.errorText = "Error Verificando Duplicados";
      this.errorMsg = true;
      return;
    }

    const { data, error } = await this.auth.signUp(email, password);
    if (error) {
      this.errorText = "Usuario Existente en Autenticación";
      this.errorMsg = true;
      return;
    }

    const user = new User(
      v.lastname,
      v.fullname,
      v.email,
      v.profile,
      dniStr,
      cuilStr,
      undefined
    );

    try {
      await this.usuarios.createFromUser(user);
    } catch (e: any) {
      const pgCode = e?.code as string | undefined;
      const details = String(e?.details ?? "").toLowerCase();
      if (pgCode === "23505" || details.includes("already exists")) {
        if (details.includes("numero_documento")) {
          this.errorText = "DNI ya registrado";
        } else if (details.includes("numero_cuil")) {
          this.errorText = "CUIL ya registrado";
        } else if (details.includes("correo") || details.includes("email")) {
          this.errorText = "Correo ya registrado";
        } else {
          this.errorText = "Registro duplicado";
        }
      } else {
        console.log(e);
        this.errorText = "Error guardando usuario";
      }
      this.errorMsg = true;
      return;
    }

    this.router.navigateByUrl(data.session ? "/home" : "/login", { replaceUrl: true });
  }

  closeError() { this.errorMsg = false; }
}