import { Component } from '@angular/core';
import { AbstractControl, FormBuilder, FormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  
})
export class RegisterPage {
  errorMsg: boolean = false;

  fullName = '';
  email = '';
  password = '';
  errorMessage = '';
  successMessage = '';
  loading = false;

  constructor(private fb: FormBuilder,private auth: AuthService, private router: Router) {}

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
  
  formRegister = this.fb.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(6)]],
    confirm: ["", [Validators.required]],
  }, { validators: this.passwordsMatch });
  
  async onRegister() {
    this.loading = true;
    this.errorMsg = false;
    this.formRegister.markAllAsTouched();
    this.formRegister.updateValueAndValidity({ emitEvent: true });
    if (this.formRegister.invalid) return;


    this.errorMessage = '';
    this.successMessage = '';
    this.loading = false;

    if (this.formRegister.invalid) return;

    const { email, password } = this.formRegister.value as any;
    const { data, error } = await this.auth.signUp(email, password);

    if (error) {
      this.errorMsg = true;
      return;
    }

    if (data.session) {
      this.router.navigateByUrl("/home", { replaceUrl: true });
    } else {
      this.router.navigateByUrl("/login", { replaceUrl: true });
    }

    
  }
}
