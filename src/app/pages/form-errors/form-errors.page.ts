import { Component, HostBinding, Input } from '@angular/core';
import { AbstractControl, ValidationErrors } from '@angular/forms';

@Component({
  selector: 'app-form-errors',
  templateUrl: './form-errors.page.html',
  styleUrls: ['./form-errors.page.scss']
})
export class FormErrorsPage {
  @Input() control!: AbstractControl | null;
  @Input() color: string | null = null;

  @HostBinding("style.--fe-color")
  get hostColor() { return this.color ?? null; }

  errorMessages(): string | null {
    if (!this.control || !this.control.errors) return null;

    const errors: ValidationErrors = this.control.errors;
    if (errors['required']) return 'Campo requerido';
    if (errors['minlength']) return `Mínimo ${errors['minlength'].requiredLength} caracteres`;
    if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
    if (errors['email']) return 'Formato de correo electrónico inválido';
    if (errors['min']) return `El valor mínimo es ${errors['min'].min}`;
    if (errors['max']) return `El valor máximo es ${errors['max'].max}`;
    if (errors['passwordmatch']) return 'Las contraseñas no coinciden';
    if (errors['nombreExistente']) return 'Ya existe en la carta';
    if (errors['dni']) return 'DNI inválido';
    if (errors['cuil']) return 'CUIL inválido';
    if (errors['fotosIncompletas']) return 'Debes subir las 3 fotos';

    return 'Error desconocido';
  }
}
