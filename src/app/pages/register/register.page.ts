import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { User } from 'src/app/classes/user';
import { AuthService } from 'src/app/services/auth/auth';
import { Usuarios } from 'src/app/services/usuarios/usuarios';
import { supabase } from 'src/supabase.client';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

@Component({
  selector: 'app-register',
  standalone: false,

  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit {
  loading: boolean = true;
  errorMsg: boolean = false;
  errorText = 'Ocurrió un error';

  fotoPreview: string | null = null; // preview en el registro
  fotoUrl: string | null = null; // url subida a Supabase

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private usuarios: Usuarios
  ) {
    this.formRegister = this.fb.group(
      {
        fullname: ['', [Validators.required]],
        lastname: ['', [Validators.required]],
        documentType: ['dni', [Validators.required]],
        documentNumber: ['', [Validators.required, this.dniValidator]],
        profile: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirm: ['', [Validators.required]],
      },
      { validators: this.passwordsMatch }
    );
  }

  formRegister: ReturnType<FormBuilder['group']>;

  // ✅ validación para habilitar el botón
  get isFormValid(): boolean {
    return this.formRegister.valid && !!this.fotoPreview;
  }

  passwordsMatch: ValidatorFn = (
    group: AbstractControl
  ): ValidationErrors | null => {
    const pass = group.get('password')?.value ?? '';
    const conf = group.get('confirm')?.value ?? '';
    const confirmCtrl = group.get('confirm');
    if (!confirmCtrl) return null;

    const others = { ...(confirmCtrl.errors ?? {}) };
    delete (others as any)['passwordmatch'];

    if (conf && pass !== conf) {
      confirmCtrl.setErrors({ ...others, passwordmatch: true });
      return { passwordmatch: true };
    } else {
      confirmCtrl.setErrors(Object.keys(others).length ? others : null);
      return null;
    }
  };

  dniValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
    const v = String(c.value ?? '').replace(/\D/g, '');
    return v.length === 8 ? null : { dni: true };
  };

  cuilValidator: ValidatorFn = (
    c: AbstractControl
  ): ValidationErrors | null => {
    const v = String(c.value ?? '').replace(/\D/g, '');
    return v.length === 11 ? null : { cuil: true };
  };

  async ngOnInit() {
    this.formRegister.get('documentType')!.valueChanges.subscribe((t) => {
      const ctrl = this.formRegister.get('documentNumber')!;
      ctrl.clearValidators();

      ctrl.addValidators([
        Validators.required,
        t === 'dni' ? this.dniValidator : this.cuilValidator,
      ]);
      ctrl.updateValueAndValidity({ emitEvent: false });
    });
    setTimeout(() => (this.loading = false), 2000);
  }

  async tomarFoto() {
    try {
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      this.fotoPreview = image.dataUrl || null;
    } catch (e) {
      console.error('Error tomando foto', e);
    }
  }

  async onRegister() {
    this.errorMsg = false;
    this.formRegister.markAllAsTouched();
    this.formRegister.updateValueAndValidity({ emitEvent: true });
    if (this.formRegister.invalid) return;

    if (!this.fotoPreview) {
      this.errorText = 'Debes tomar una foto';
      this.errorMsg = true;
      return;
    }

    const v = this.formRegister.value as any;
    const email: string = String(v.email).trim().toLowerCase();
    const password: string = v.password;

    const digits = String(v.documentNumber ?? '').replace(/\D/g, '');
    const isDni = v.documentType === 'dni';
    const dniStr = isDni ? digits : undefined;
    const cuilStr = !isDni ? digits : undefined;

    try {
      if (await this.usuarios.existsByEmail(email)) {
        this.errorText = 'Correo ya registrado';
        this.errorMsg = true;
        return;
      }

      if (isDni && dniStr) {
        const dup = await this.usuarios.existsByDni(Number(dniStr));
        if (dup) {
          this.errorText = 'DNI ya registrado';
          this.errorMsg = true;
          return;
        }
      } else if (!isDni && cuilStr) {
        const dup = await this.usuarios.existsByCuil(Number(cuilStr));
        if (dup) {
          this.errorText = 'CUIL ya registrado';
          this.errorMsg = true;
          return;
        }
      }
    } catch {
      this.errorText = 'Error Verificando Duplicados';
      this.errorMsg = true;
      return;
    }

    const { data, error } = await this.auth.signUp(email, password);
    if (error) {
      this.errorText = 'Usuario Existente en Autenticación';
      this.errorMsg = true;
      return;
    }

    const user = new User(
      v.lastname,
      v.fullname,
      email,
      v.profile,
      dniStr,
      cuilStr,
      undefined
    );

    try {

      const fileName = `foto_${Date.now()}.jpeg`;
      const { error: uploadError } = await supabase.storage
        .from('empleados')
        .upload(fileName, this.dataURLtoBlob(this.fotoPreview!), {
          contentType: 'image/jpeg',
        });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from('empleados')
        .getPublicUrl(fileName);

      this.fotoUrl = publicUrl.publicUrl;


      const usuarioDB = await this.usuarios.createFromUser(user, this.fotoUrl);

      await supabase.from('clientes').insert({
        tipo: 'cliente_registrado',
        usuario_id: usuarioDB.id
      });
    } catch (e: any) {
      console.log(e);
      this.errorText = 'Error guardando usuario/cliente';
      this.errorMsg = true;
      return;
    }

    if (v.profile === 'cliente_registrado') {
      try {
        await supabase.auth.signOut();
      } catch {}
      await this.router.navigateByUrl('/login', { replaceUrl: true });
      return;
    }

    await this.router.navigateByUrl(data.session ? '/home' : '/login', {
      replaceUrl: true,
    });
  }

  private dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  closeError() {
    this.errorMsg = false;
  }
}
