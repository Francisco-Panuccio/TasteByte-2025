import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastController, ModalController, NavController } from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { supabase } from 'src/supabase.client';
import { ListadoMesasPage } from '../listado-mesas/listado-mesas.page';
import { Push } from 'src/app/services/push/push';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-lista-espera',
  templateUrl: './lista-espera.page.html',
  styleUrls: ['./lista-espera.page.scss'],
  standalone: false
})
export class ListaEsperaPage implements OnInit, OnDestroy {
  clientes: any[] = [];
  loading = true;
  esCliente = false;
  esMaitre = false;
  anonimoId: string | null = null;
  usuarioId: string | null = null;

  private pushSub?: Subscription;
  private rtChannel?: ReturnType<typeof supabase.channel>;
  private seenWaitIds = new Set<string>();

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private navCtrl: NavController,
    private push: Push
  ) {}

  private normalizarPerfil(p?: string): string {
    return (p ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  async ngOnInit() {
    this.anonimoId = this.route.snapshot.queryParamMap.get('anonimoId');
    this.usuarioId = this.route.snapshot.queryParamMap.get('userId');
    if (this.anonimoId) this.esCliente = true;

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('perfil')
          .eq('correo_electronico', authData.user.email)
          .maybeSingle();
        const perfil = this.normalizarPerfil(usuario?.perfil);
        this.esMaitre = perfil === 'maitre';
        if (perfil === 'cliente_registrado') this.esCliente = true;
      }
    } catch {}

    await this.cargarLista();

    await this.push.init(undefined, 'maitre');
    await this.push.ready();

    this.pushSub = this.push.onPush$.subscribe(async (data: any) => {
      if ((data?.tipo ?? '') === 'lista_espera') {
        await this.presentPushToast('Nuevo cliente en lista de espera');
        await this.cargarLista();
      }
    });

    this.rtChannel = supabase
      .channel('rt-lista-espera')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lista_espera' },
        async (payload) => {
          const row: any = payload.new;
          if (!row || row.estado !== 'pendiente') return;
          const id = String(row.id);
          if (this.seenWaitIds.has(id)) return;
          this.seenWaitIds.add(id);
          await this.presentPushToast('Nuevo cliente en lista de espera');
          await this.cargarLista();
          await this.push.sendToRoles(
            ['maitre'],
            'Nuevo cliente en lista de espera',
            '',
            { tipo: 'lista_espera', screen: 'lista-espera', lista_espera_id: row.id }
          );
        }
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    try { this.pushSub?.unsubscribe(); } catch {}
    try { if (this.rtChannel) supabase.removeChannel(this.rtChannel); } catch {}
  }

  async cargarLista() {
    this.loading = true;
    const { data, error } = await supabase
      .from('lista_espera_v')
      .select('*')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true });

    if (error) {
      this.clientes = [];
    } else {
      this.clientes = (data || []).map((c) => {
        const nombre =
          c.cliente_anonimo_nombre ||
          (c.usuario_nombre && c.usuario_apellido ? `${c.usuario_nombre} ${c.usuario_apellido}` : null);
        const foto = c.cliente_anonimo_foto || c.usuario_foto || null;
        return { ...c, nombre: nombre ?? 'Cliente anónimo', foto_url: foto };
      });
    }
    setTimeout(() => (this.loading = false), 1000);
  }

  async aprobar(cliente: any) {
    const modal = await this.modalCtrl.create({ component: ListadoMesasPage });
    await modal.present();
    const { data: mesaSeleccionada } = await modal.onDidDismiss();
    if (!mesaSeleccionada) return;

    const { error: errorLista } = await supabase
      .from('lista_espera')
      .update({ estado: 'aprobado', mesa_id: mesaSeleccionada.id })
      .eq('id', cliente.id);
    if (errorLista) return;

    const payload: any = { mesa_id: mesaSeleccionada.id, estado: 'asignada' };
    if (cliente.cliente_id) payload.cliente_id = cliente.cliente_id;
    if (cliente.cliente_anonimo_id) payload.cliente_anonimo_id = cliente.cliente_anonimo_id;

    await supabase.from('asignaciones_mesa').insert(payload);

    this.clientes = this.clientes.filter((c) => c.id !== cliente.id);
    this.mostrarToast(`${cliente.nombre || 'Cliente'} fue aprobado y se le asignó la mesa ${mesaSeleccionada.numero}`);
  }

  private async presentPushToast(header: string) {
    const t = await this.toastCtrl.create({
      header,
      message: '',
      position: 'top',
      cssClass: 'toasty',
      duration: undefined,
      buttons: [
        {
          text: 'Ver',
          role: 'confirm',
          handler: async () => {
            try { await this.cargarLista(); } catch {}
            try { await this.router.navigate(['/lista-espera']); } catch {}
          }
        },
        { text: 'Cerrar', role: 'cancel' }
      ]
    });
    await t.present();
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
    const idx = this.clientes.findIndex((c) => c.cliente_anonimo_id === this.anonimoId);
    return idx >= 0 ? idx + 1 : null;
  }

  volver() { this.navCtrl.back(); }
}