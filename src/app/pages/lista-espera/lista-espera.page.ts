import { Component, OnInit } from '@angular/core';
import { ToastController, ModalController } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { supabase } from 'src/supabase.client';
import { ListadoMesasPage } from '../listado-mesas/listado-mesas.page';

@Component({
  selector: 'app-lista-espera',
  templateUrl: './lista-espera.page.html',
  styleUrls: ['./lista-espera.page.scss'],
  standalone: false
})
export class ListaEsperaPage implements OnInit {
  clientes: any[] = [];
  loading = true;
  esCliente = false;
  anonimoId: string | null = null;

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private route: ActivatedRoute,
    private modalCtrl: ModalController
  ) {}

  async ngOnInit() {
    this.anonimoId = this.route.snapshot.queryParamMap.get('anonimoId');
    const usuarioId = this.route.snapshot.queryParamMap.get('userId');
    console.log('anonimoId:', this.anonimoId);
    console.log('usuarioId:', usuarioId);

    this.esCliente = Boolean(this.anonimoId || usuarioId);
    await this.cargarLista();
  }

  async cargarLista() {
  this.loading = true;

  const { data, error } = await supabase
    .from('lista_espera')
    .select(`
      id,
      estado,
      creado_en,
      cliente_id,
      clientes_anonimos:cliente_anonimo_id (id, nombre, foto_url)
    `)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true });

  if (error) {
    console.error("Error loading lista de espera", error);
    this.clientes = [];
  } else {
    this.clientes = (data || []).map(c => {
      const anon = (c.clientes_anonimos && c.clientes_anonimos.length > 0) 
        ? c.clientes_anonimos[0] 
        : null;

      return {
        ...c,
        nombre: anon?.nombre || `Cliente #${c.cliente_id || 'N/A'}`,
        foto_url: anon?.foto_url || null
      };
    });
  }

  setTimeout(() => (this.loading = false), 2000);
}


  async aprobar(cliente: any) {
  if (this.esCliente) return; 

  const modal = await this.modalCtrl.create({
    component: ListadoMesasPage,
  });

  await modal.present();
  const { data: mesaSeleccionada } = await modal.onDidDismiss();

  if (!mesaSeleccionada) return; 

  const { error } = await supabase
    .from('lista_espera')
    .update({ estado: 'aprobado', mesa_id: mesaSeleccionada.id })
    .eq('id', cliente.id);

  if (!error) {
    this.clientes = this.clientes.filter(c => c.id !== cliente.id);
    this.mostrarToast(
      `${cliente.nombre || 'Cliente'} fue aprobado y se le asignó la mesa ${mesaSeleccionada.numero}`
    );
  }
}

  private async mostrarToast(mensaje: string) {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 2000,
      position: 'bottom',
      color: 'success'
    });
    await toast.present();
  }

  getPosicionCliente(): number | null {
    if (!this.anonimoId) return null;
    const idx = this.clientes.findIndex(c => c.cliente_anonimo_id === this.anonimoId);
    return idx >= 0 ? idx + 1 : null;
  }

  volver() {
    const anonimoId = this.anonimoId;
    const userId = this.route.snapshot.queryParamMap.get('userId');

    if (anonimoId || userId) {
      this.router.navigate(['/encuestas-espera'], {
        queryParams: { anonimoId, userId }
      });
    } else {
      this.router.navigate(['/home']);
    }
  }
}
