import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ItemFactura { codigo: string; descripcion: string; cantidad: number; precioUnit: number; subtotal: number; }
export interface TotalesFactura { total: number; }
export interface FacturaData {
  receptor: { cuitOdni: string; nombreCompleto: string; };
  items: ItemFactura[];
  totales: TotalesFactura;
}

const FACTURA_EMPTY: FacturaData = { receptor: { cuitOdni: "", nombreCompleto: "" }, items: [], totales: { total: 0 } };

@Component({
  selector: 'app-factura',
  templateUrl: './factura.page.html',
  styleUrls: ['./factura.page.scss'],
  imports: [FormsModule, CommonModule, DecimalPipe],
  standalone: true
})
export class FacturaPage {
  @Input() data: FacturaData = FACTURA_EMPTY;
  @ViewChild('root', { static: false }) root!: ElementRef<HTMLDivElement>;
}