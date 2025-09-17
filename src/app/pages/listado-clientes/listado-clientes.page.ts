import { Component, OnInit, inject } from '@angular/core';
import { Clientes } from 'src/app/services/clientes/clientes';
import { Usuario } from 'src/app/interfaces/usuario';
import { ClienteRegistrado } from 'src/app/interfaces/cliente';
import { Email } from 'src/app/services/email/email';

@Component({
  selector: 'app-listado-clientes',
  templateUrl: './listado-clientes.page.html',
  styleUrls: ['./listado-clientes.page.scss'],
  standalone: false
})
export class ListadoClientesPage implements OnInit {
  private clientesSvc = inject(Clientes);
  private emailSvc = inject(Email);

  loading = true;
  err: string | null = null;
  ok: string | null = null;

  clientes: (ClienteRegistrado & { usuario: Usuario })[] = [];

  async ngOnInit() {
    await this.cargarPendientes();
  }

  async cargarPendientes() {
    this.loading = true;
    this.err = null;
    this.ok = null;
    try {
      this.clientes = await this.clientesSvc.listPendientes();
    } catch (e: any) {
      this.err = e.message || 'Error al cargar clientes';
    } finally {
      this.loading = false;
    }
  }

async aprobar(usuarioId: string) {
  try {
    console.log('👤 Approving client with usuario_id:', usuarioId);
    
    const cliente = this.clientes.find(c => c.usuario_id === usuarioId);
    
    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }

    console.log('📧 Client email:', cliente.usuario.correo_electronico);

    // 1. Primero aprobar el cliente
    await this.clientesSvc.aprobar(usuarioId);
    console.log('✅ Client approved in database');
    
    // 2. Enviar email de aprobación
    await this.emailSvc.sendEmail(
      cliente.usuario.correo_electronico,
      "🎉 ¡Registro Aprobado! - Tu Cuenta Ya Está Activa",
      "registro_aprobado",
      { 
        nombres: cliente.usuario.nombres,
        apellidos: cliente.usuario.apellidos
      }
    );

    this.ok = 'Cliente aprobado y notificado por email';
    await this.cargarPendientes();
    
  } catch (e: any) {
    console.error("❌ Error al aprobar cliente:", e);
    this.err = e.message || 'No se pudo aprobar el cliente';
  }
}

  async rechazar(usuarioId: string) {
    try {
      // Buscar el cliente antes de rechazar para tener los datos del email
      const cliente = this.clientes.find(c => c.usuario_id === usuarioId);
      
      if (!cliente) {
        throw new Error('Cliente no encontrado');
      }

      // Rechazar el cliente
      await this.clientesSvc.rechazar(usuarioId);
      
      // Enviar email de rechazo
      await this.emailSvc.sendEmail(
        cliente.usuario.correo_electronico,
        "❌ Estado de tu Registro - Comunicación Importante",
        "registro_rechazado",
        { 
          nombres: cliente.usuario.nombres,
          apellidos: cliente.usuario.apellidos
        }
      );

      this.ok = 'Cliente rechazado y notificado por email';
      await this.cargarPendientes();
    } catch (e: any) {
      console.error("Error al aprobar/rechazar cliente:", e);
      this.err = e.message || 'No se pudo rechazar el cliente';
    }
  }


  // async aprobar(usuarioId: string) {
  //   try {
  //     await this.clientesSvc.aprobar(usuarioId);
  //     this.ok = 'Cliente aprobado';
  //     await this.cargarPendientes();
  //   } catch (e: any) {
  //     this.err = e.message || 'No se pudo aprobar el cliente';
  //   }
  // }

  // async rechazar(usuarioId: string) {
  //   try {
  //     await this.clientesSvc.rechazar(usuarioId);
  //     this.ok = 'Cliente rechazado';
  //     await this.cargarPendientes();
  //   } catch (e: any) {
  //     this.err = e.message || 'No se pudo rechazar el cliente';
  //   }
  // }

}
