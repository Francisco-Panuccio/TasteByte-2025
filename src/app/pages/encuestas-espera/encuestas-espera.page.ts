import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';

// Tipos para evitar el error de TS
type EstadoAsignacion = 'pendiente' | 'asignada' | 'sentado' | 'liberada' | 'cancelada';
interface AsignacionMesaRow {
  mesa_id: number;
  estado: EstadoAsignacion;
}

@Component({
  selector: 'app-encuestas-espera',
  templateUrl: './encuestas-espera.page.html',
  styleUrls: ['./encuestas-espera.page.scss'],
  standalone: false
})
export class EncuestasEsperaPage implements OnInit, OnDestroy {
  nombreCliente: string | undefined;
  usuarioId: string | undefined;     // id de usuarios (uuid)
  anonimoId: string | undefined;     // id de clientes_anonimos (uuid)
  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;   
  loading = true;
  tienePermiso = false;      
  yaRegistrado = false;

  // Nueva info
  mesaAsignadaId: number | null = null;
  private subscription: any;

  private qr = inject(Qr);

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastController
  ) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.usuarioId = params['userId'];        
      this.anonimoId = params['anonimoId'];     

      if (!this.usuarioId && !this.anonimoId) {
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      // Nombre visible
      if (this.usuarioId) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombres, apellidos')
          .eq('id', this.usuarioId)
          .single();
        this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : 'Cliente';
      } else if (this.anonimoId) {
        const { data: anonimo } = await supabase
          .from('clientes_anonimos')
          .select('nombre')
          .eq('id', this.anonimoId)
          .single();
        this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
      }

      // Encuestas
      const { data: encuestas } = await supabase.from('encuestas').select('*');
      this.encuestas = encuestas || [];

      // 👉 Cargar mesa asignada (si ya existe)
      await this.cargarMesaAsignada();

      // 👉 Suscripción realtime a asignaciones para este cliente
      this.subscription = supabase
        .channel('asignaciones_mesa_sub')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'asignaciones_mesa',
            filter: this.usuarioId
              ? `cliente_id=eq.${this.usuarioId}`
              : `cliente_anonimo_id=eq.${this.anonimoId}`,
          },
          async (payload: { new?: Partial<AsignacionMesaRow> }) => {
            const mesa = payload?.new?.mesa_id;
            if (typeof mesa === 'number') {
              this.mesaAsignadaId = mesa;
              const t = await this.toast.create({
                message: `¡Te asignaron la mesa #${mesa}!`,
                duration: 2000,
                color: 'success'
              });
              t.present();
            }
          }
        )
        .subscribe();

      this.loading = false;
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      supabase.removeChannel(this.subscription);
    }
  }

  // ----- NUEVO: carga inicial de la mesa asignada con tipado explícito -----
  private async cargarMesaAsignada() {
    let q = supabase
      .from('asignaciones_mesa')
      .select('mesa_id, estado')
      .in('estado', ['pendiente', 'asignada', 'sentado'] as EstadoAsignacion[])
      .order('asignada_en', { ascending: false })
      .limit(1);

    if (this.usuarioId) q = q.eq('cliente_id', this.usuarioId);
    if (this.anonimoId) q = q.eq('cliente_anonimo_id', this.anonimoId);

    const { data, error } = await q.maybeSingle();
    // data está tipado laxo -> lo “narroweamos” para que TS no se queje
    const fila = data as AsignacionMesaRow | null;

    if (!error && fila && typeof fila.mesa_id === 'number') {
      this.mesaAsignadaId = fila.mesa_id;
    }
  }
  // ------------------------------------------------------------------------

  async escanearQr() {
    const qr = await this.qr.scanQr();
    if (!qr) return;

    const res = await this.qr.procesarQrCliente(qr, this.usuarioId, this.anonimoId);

    if (res.error) {
      alert(res.error);
      return;
    }

    if (res.permiso) {
      this.tienePermiso = true;  
    }

    if (res.yaRegistrado) {
      this.yaRegistrado = true;
      alert("Ya estás en lista de espera. Podés ver las encuestas mientras esperás.");
    } else {
      alert("Acceso habilitado. Ahora podés ver la lista de espera y decidir si anotarte.");
    }

    if (res.mesaAsignada) {
      alert(`Bienvenido a la mesa ${res.mesaAsignada}. Disfrutá tu experiencia.`);
    }
  }

  async cargarListaYEncuestas() {
    const { data: encuestas } = await supabase.from('encuestas').select('*');
    this.encuestas = encuestas || [];

    const { data: lista } = await supabase
      .from('lista_espera')
      .select(`
        id,
        estado,
        creado_en,
        clientes_anonimos:cliente_anonimo_id (id, nombre, foto_url)
      `)
      .order('creado_en', { ascending: true });

    this.clientes = lista || [];
  }

  async registrarseListaEspera() {
    if (this.yaRegistrado) return;

    const payload: any = { estado: 'pendiente' };
    if (this.usuarioId) payload.cliente_id = this.usuarioId;
    else payload.cliente_anonimo_id = this.anonimoId;

    const { error } = await supabase.from('lista_espera').insert(payload);
    if (error) {
      alert('Error al registrarse en la lista de espera');
      return;
    }

    this.yaRegistrado = true;
    alert('Te has registrado en la lista de espera. Espera a que el maître te asigne una mesa.');
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase.from('respuestas_encuestas').insert({
      usuario_id: this.usuarioId,
      encuesta_id: encuestaId,
      respondido_en: new Date().toISOString()
    });
    alert('Gracias por participar en la encuesta!');
  }

  async escanearQrMesa() {
  const qr = await this.qr.scanQr();
  if (!qr) return;

  const res = await this.qr.procesarQrCliente(qr, this.usuarioId, this.anonimoId);

  if (res.error) {
    const t = await this.toast.create({
      message: res.error,
      duration: 2000,
      color: 'danger'
    });
    return t.present();
  }

  if (res.mesaAsignada) {
    this.router.navigate(['/mesa-ocupada'], {
      queryParams: { mesaId: res.mesaAsignada, numero: res.numero }
    });
  }
}

  salir() {
    this.router.navigate(['/login']);
  }
}
