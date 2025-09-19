import { Component, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { supabase } from 'src/supabase.client';

@Component({
  selector: 'app-lista-espera',
  templateUrl: './lista-espera.page.html',
  styleUrls: ['./lista-espera.page.scss'],
  standalone: false
})
export class ListaEsperaPage implements OnInit {
  clientes: any[] = [];
  loading = true;

  constructor(private toastCtrl: ToastController) {}

  async ngOnInit() {
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
      clientes_anonimos:cliente_anonimo_id (id, nombre, foto_url)
    `)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: true });

  if (error) {
    console.error("Error loading lista de espera", error);
    this.clientes = [];
  } else {

    this.clientes = (data || []).map(c => ({
      ...c,
      clientes_anonimos: c.clientes_anonimos?.[0] || null
    }));
  }

   setTimeout(() => this.loading = false, 2000);
}


  async aprobar(cliente: any) {
    const { error } = await supabase
      .from('lista_espera')
      .update({ estado: 'aprobado' })
      .eq('id', cliente.id);

    if (!error) {
      this.clientes = this.clientes.filter(c => c.id !== cliente.id);
      this.mostrarToast(`${cliente.clientes_anonimos?.nombre} fue aprobado.`);
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
}
