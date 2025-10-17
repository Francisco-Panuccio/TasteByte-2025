import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ClienteSessionService {
  tienePermiso = false;
  qrValido = false;
  yaRegistrado = false;
  anonimoId: string | null = null;
  usuarioId: string | null = null;
  clienteId: string | null = null;
  userUid: string | null = null;

  mesaAsignadaId: number | null = null;
  pedidoId: string | null = null;
  estadoPedido: string | null = null;

  limpiar() {
    this.tienePermiso = false;
    this.qrValido = false;
    this.yaRegistrado = false;
    this.anonimoId = null;
    this.usuarioId = null;
    this.clienteId = null;
    this.userUid = null;
    this.mesaAsignadaId = null;
    this.pedidoId = null;
    this.estadoPedido = null;
  }
}
