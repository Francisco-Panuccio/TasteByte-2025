import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ModalController, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { supabase } from 'src/supabase.client';
import { ListadoMesasPage } from '../listado-mesas/listado-mesas.page';
import { Push } from 'src/app/services/push/push';

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

  private rtChannel?: ReturnType<typeof supabase.channel>;
  private seenWaitIds = new Set<string>();
  private toast = inject(ToastController);

  constructor(
    private route: ActivatedRoute,
    private modalCtrl: ModalController,
    private navCtrl: NavController,
    private push: Push
  ) { }

  private normalizarPerfil(p?: string): string {
    return (p ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  private perfilToRole(perfil?: string): string | undefined {
    const p = this.normalizarPerfil(perfil);
    if (p === 'dueno') return 'dueño';
    if (['supervisor', 'maitre', 'mozo', 'bartender', 'cocinero'].includes(p)) return p;
    if (p === 'cliente_registrado' || p === 'cliente_anonimo') return 'cliente';
    return undefined;
  }

  async ngOnInit() {
    this.anonimoId = this.route.snapshot.queryParamMap.get('anonimoId');
    this.usuarioId = this.route.snapshot.queryParamMap.get('userId');
    if (this.anonimoId) this.esCliente = true;

    let perfil: string | undefined;
    let usuarioIdNum: number | undefined;

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, perfil')
          .eq('correo_electronico', authData.user.email)
          .maybeSingle();
        perfil = usuario?.perfil;
        usuarioIdNum = usuario?.id ?? undefined;
        const norm = this.normalizarPerfil(perfil);
        this.esMaitre = norm === 'maitre';
        if (norm === 'cliente_registrado') this.esCliente = true;
      }
      const role = this.perfilToRole(perfil);
      await this.push.init(usuarioIdNum, role as any);
      await this.push.ready();
    } catch { }

    await this.cargarLista();

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

          try {
            await this.push.sendToMaitre(
              'Nuevo cliente en lista de espera',
              `Se agregó un nuevo cliente a la lista de espera.`,
              {
                tipo: 'lista_espera',
                screen: 'lista-espera',
                lista_espera_id: row.id,
              }
            );
          } catch (e) {
            console.error('[push][lista_espera][sendToMaitre]', e);
          }

          await this.cargarLista();
        }
      )
      .subscribe();

  }

  ngOnDestroy(): void {
    try {
      if (this.rtChannel) supabase.removeChannel(this.rtChannel);
    } catch { }
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
          (c.usuario_nombre && c.usuario_apellido
            ? `${c.usuario_nombre} ${c.usuario_apellido}`
            : null);
        const foto = c.cliente_anonimo_foto || c.usuario_foto || null;
        return { ...c, nombre: nombre ?? 'Cliente anónimo', foto_url: foto };
      });
    }
    setTimeout(() => (this.loading = false), 2000);
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

    const { data: le } = await supabase
      .from('lista_espera')
      .select('cliente_id, cliente_anonimo_id, push_token')
      .eq('id', cliente.id)
      .maybeSingle();

    const payload: any = { mesa_id: mesaSeleccionada.id, estado: 'asignada' };
    if (le?.cliente_id) payload.cliente_id = le.cliente_id;
    if (le?.cliente_anonimo_id) payload.cliente_anonimo_id = le.cliente_anonimo_id;

    await supabase.from('asignaciones_mesa').insert(payload);

    try {
      const tok = le?.push_token as string | undefined;
      if (tok) {
        await this.push.send(
          tok,
          'Mesa asignada',
          `Se te acaba de asignar la mesa ${mesaSeleccionada.numero}.`,
          {
            tipo: 'mesa_asignada',
            mesa_id: mesaSeleccionada.id,
            mesa_numero: mesaSeleccionada.numero,
            screen: 'mi-mesa'
          }
        );
      } else {
        console.warn('[push][mesa_asignada] cliente sin token');
      }
    } catch (e) {
      console.error('[push][mesa_asignada][error]', e);
    }
    this.clientes = this.clientes.filter((c) => c.id !== cliente.id);
    await this.mostrarToast("Cliente Aprobado");
  }

  async quitar(cliente: any) {
    const { error } = await supabase.from('lista_espera').delete().eq('id', cliente.id);
    if (error) return;
    this.clientes = this.clientes.filter((c) => c.id !== cliente.id);

    const tok = cliente.push_token as string | undefined;
    if (tok) {
      await this.push.send(tok, 'Tu turno fue cancelado', '', {
        tipo: 'lista_cancelada',
        lista_espera_id: cliente.id
      });
    }
    await this.mostrarToast("Cliente Rechazado");
  }

  private async mostrarToast(message: string): Promise<void> {
    const t = await this.toast.create({
      message,
      duration: 1500,
      cssClass: "toast",
      position: "top"
    });
    await t.present();
  }

  getPosicionCliente(): number | null {
    if (!this.anonimoId) return null;
    const idx = this.clientes.findIndex((c) => c.cliente_anonimo_id === this.anonimoId);
    return idx >= 0 ? idx + 1 : null;
  }

  volver() {
    this.navCtrl.back();
  }
}
