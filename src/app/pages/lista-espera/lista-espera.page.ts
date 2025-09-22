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
  esMaitre = false;

  anonimoId: string | null = null;
  usuarioId: string | null = null; // dejamos este param tal cual para no romper tu "volver()"

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private route: ActivatedRoute,
    private modalCtrl: ModalController
  ) {}

  private normalizarPerfil(p?: string): string {
    return (p ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // quita acentos (maître -> maitre)
  }

  async ngOnInit() {
    // Tomamos params (los seguimos leyendo para tu "volver()")
    this.anonimoId = this.route.snapshot.queryParamMap.get('anonimoId');
    this.usuarioId = this.route.snapshot.queryParamMap.get('userId');

    // Si viene anonimoId, seguro es cliente
    if (this.anonimoId) this.esCliente = true;

    // Detectar rol a partir del usuario logueado (no confiamos en userId del query param)
    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!authErr && authData?.user?.email) {
        const email = authData.user.email;

        const { data: usuario, error: uErr } = await supabase
          .from('usuarios')
          .select('perfil')
          .eq('correo_electronico', email)
          .maybeSingle();

        if (!uErr && usuario?.perfil) {
          const perfil = this.normalizarPerfil(usuario.perfil);
          this.esMaitre = perfil === 'maitre';
          // si es cliente registrado, marcamos esCliente
          if (perfil === 'cliente_registrado') this.esCliente = true;
        }
      }
    } catch (e) {
      // Si algo falla, no bloqueamos la UI; por defecto no es maître
      console.warn('[lista-espera][rol]', e);
    }

    await this.cargarLista();
  }

  async cargarLista() {
    this.loading = true;

    const { data, error } = await supabase
      .from('lista_espera_v')
      .select('*')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true });

    if (error) {
      console.error('Error loading lista de espera', error);
      this.clientes = [];
    } else {
      this.clientes = (data || []).map((c) => {
        const nombre =
          c.cliente_anonimo_nombre ||
          (c.usuario_nombre && c.usuario_apellido
            ? `${c.usuario_nombre} ${c.usuario_apellido}`
            : null);

        const foto = c.cliente_anonimo_foto || c.usuario_foto || null;

        return {
          ...c,
          nombre: nombre ?? 'Cliente anónimo',
          foto_url: foto
        };
      });
    }

    setTimeout(() => (this.loading = false), 1000);
  }

  async aprobar(cliente: any) {
    // Solo maître puede aprobar
    if (!this.esMaitre) return;

    const modal = await this.modalCtrl.create({
      component: ListadoMesasPage
    });

    await modal.present();
    const { data: mesaSeleccionada } = await modal.onDidDismiss();

    if (!mesaSeleccionada) return;

    // actualizar lista_espera
    const { error: errorLista } = await supabase
      .from('lista_espera')
      .update({ estado: 'aprobado', mesa_id: mesaSeleccionada.id })
      .eq('id', cliente.id);

    if (errorLista) {
      console.error('Error al actualizar lista_espera', errorLista);
      return;
    }

    // insertar asignación
    const payload: any = {
      mesa_id: mesaSeleccionada.id,
      estado: 'asignada'
    };

    if (cliente.cliente_id) payload.cliente_id = cliente.cliente_id;
    if (cliente.cliente_anonimo_id) payload.cliente_anonimo_id = cliente.cliente_anonimo_id;

    const { error: errorAsignacion } = await supabase
      .from('asignaciones_mesa')
      .insert(payload);

    if (errorAsignacion) {
      console.error('Error al insertar en asignaciones_mesa', errorAsignacion);
    }

    this.clientes = this.clientes.filter((c) => c.id !== cliente.id);
    this.mostrarToast(
      `${cliente.nombre || 'Cliente'} fue aprobado y se le asignó la mesa ${mesaSeleccionada.numero}`
    );
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

  volver() {
    const anonimoId = this.anonimoId;
    const userId = this.usuarioId;

    if (anonimoId || userId) {
      this.router.navigate(['/encuestas-espera'], {
        queryParams: { anonimoId, userId }
      });
    } else {
      this.router.navigate(['/home']);
    }
  }
}
