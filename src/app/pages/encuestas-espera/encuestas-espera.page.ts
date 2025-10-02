import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';
import { Push } from 'src/app/services/push/push';

type EstadoAsignacion = 'pendiente' | 'asignada' | 'sentado' | 'liberada' | 'cancelada';
interface AsignacionMesaRow { mesa_id: number; estado: EstadoAsignacion; }

@Component({
  selector: 'app-encuestas-espera',
  templateUrl: './encuestas-espera.page.html',
  styleUrls: ['./encuestas-espera.page.scss'],
  standalone: false
})
export class EncuestasEsperaPage implements OnInit, OnDestroy {
  private qr = inject(Qr);
  private push = inject(Push);
  private subscription: any;

  nombreCliente: string | undefined;
  usuarioId: number | null = null;
  anonimoId: string | undefined;
  clienteId: number | null = null;

  userUid : string | undefined;
  
  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;
  loading = true;
  tienePermiso = false;
  yaRegistrado = false;

  mesaAsignadaId: number | null = null;
  estadoPedido = false;

  constructor(private router: Router, private route: ActivatedRoute, private toast: ToastController) { }

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.anonimoId = params['anonimoId'];
      this.tienePermiso = params['tienePermiso'];
      this.userUid = params['userId'];

      if (!this.clienteId && !this.anonimoId && !this.usuarioId) {
        this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      if (!this.usuarioId && this.clienteId) {
        const { data: cli } = await supabase.from('clientes').select('usuario_id').eq('id', this.clienteId).maybeSingle();
        this.usuarioId = typeof cli?.usuario_id === 'number' ? cli?.usuario_id : null;
      }

      if (this.usuarioId) {
        const { data: usuario } = await supabase.from('usuarios').select('nombres, apellidos').eq('id', this.usuarioId).maybeSingle();
        this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : 'Cliente';
        await this.push.init(this.usuarioId, 'cliente' as any);
        await this.push.ready();
      } else if (this.anonimoId) {
        const { data: anonimo } = await supabase.from('clientes_anonimos').select('nombre').eq('id', this.anonimoId).maybeSingle();
        this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
        await this.push.init(null, 'cliente' as any);
        await this.push.ready();
      }

      await this.cargarMesaAsignada();

      this.subscription = supabase
        .channel('asignaciones_mesa_sub')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'asignaciones_mesa',
            filter: this.clienteId ? `cliente_id=eq.${this.clienteId}` : `cliente_anonimo_id=eq.${this.anonimoId}`
          },
          async (payload: { new?: Partial<AsignacionMesaRow> }) => {
            const mesa = payload?.new?.mesa_id;
            if (typeof mesa === 'number') this.mesaAsignadaId = mesa;
          }
        )
        .subscribe();

      setTimeout(() => (this.loading = false), 2000);
    });
  }

  ngOnDestroy() { if (this.subscription) supabase.removeChannel(this.subscription); }

  async escanearQr() {
    const qr = await this.qr.scanQr();
    if (!qr) return;
    const res = await this.qr.procesarQrCliente(qr, this.clienteId ?? undefined, this.anonimoId ?? undefined);
    if (res.error) { this.mostrarToast(res.error, 'danger'); return; }
    if (res.permiso && qr.startsWith('INGRESO')) {
      this.tienePermiso = true;
      this.yaRegistrado = !!res.yaRegistrado;
      this.qrValido = true;
      this.mostrarToast('Bienvenido!');
    }
  }

  private async cargarMesaAsignada() {
    let q = supabase.from('asignaciones_mesa').select('mesa_id, estado').in('estado', ['pendiente', 'asignada', 'sentado'] as EstadoAsignacion[]).order('asignada_en', { ascending: false }).limit(1);
    if (this.clienteId) q = q.eq('cliente_id', this.clienteId);
    if (this.anonimoId) q = q.eq('cliente_anonimo_id', this.anonimoId);
    const { data: asignacion, error: errAsignacion } = await q.maybeSingle();
    if (!errAsignacion && asignacion && typeof asignacion.mesa_id === 'number') { this.mesaAsignadaId = asignacion.mesa_id; this.yaRegistrado = true; return; }

    let qLista = supabase.from('lista_espera').select('id, estado').in('estado', ['pendiente', 'aprobado']);
    if (this.clienteId) qLista = qLista.eq('cliente_id', this.clienteId);
    if (this.anonimoId) qLista = qLista.eq('cliente_anonimo_id', this.anonimoId);
    const { data: espera, error: errLista } = await qLista.maybeSingle();
    if (!errLista && espera) this.yaRegistrado = true;
  }

  async registrarseListaEspera() {
    if (this.yaRegistrado) return;
    const payload: any = { estado: 'pendiente' };
    const tk = this.push.getToken();
    if (tk) payload.push_token = tk;
    if (this.clienteId) payload.cliente_id = this.clienteId;
    else if (this.anonimoId) payload.cliente_anonimo_id = this.anonimoId;
    else { this.mostrarToast('Error: no se detectó cliente', 'danger'); return; }
    const { error } = await supabase.from('lista_espera').insert(payload);
    if (error) { this.mostrarToast('Error al registrarse en la lista de espera', 'danger'); return; }
    this.yaRegistrado = true;
    this.mostrarToast('Te uniste a la lista de espera. Esperá a que el maître te asigne una mesa.');
  }

  async registrarEncuesta(encuestaId: string) {
    await supabase.from('respuestas_encuestas').insert({ usuario_id: this.usuarioId, encuesta_id: encuestaId, respondido_en: new Date().toISOString() });
    this.mostrarToast('Gracias por participar en la encuesta!');
  }

  async escanearQrMesa() {
    const qr = await this.qr.scanQr();
    if (!qr) return;
    const res = await this.qr.procesarQrCliente(qr, this.clienteId ?? undefined, this.anonimoId ?? undefined);
    if (res.error) { this.mostrarToast(res.error, 'danger'); return; }
    if (res.mesaAsignada) {
      const { data } = await supabase.from('pedidos').select('id, estado').eq('mesa_id', res.mesaAsignada).in('estado', ['aceptado', 'terminado']).limit(1).maybeSingle();
      if (data) { this.estadoPedido = true; return; }
      this.router.navigate(['/mesa-ocupada'], { queryParams: { mesaId: res.mesaAsignada, numero: res.numero, anonimoId: this.anonimoId, usuarioId: this.usuarioId, clienteId: this.clienteId } });
    }
  }

  async salir() { try { await supabase.auth.signOut(); } catch { } this.router.navigate(['/login'], { replaceUrl: true }); }

  private async mostrarToast(mensaje: string, color: string = 'primary') {
    const t = await this.toast.create({ message: mensaje, duration: 2500, color, cssClass: 'toast2', position: 'bottom', buttons: [{ text: 'OK', role: 'cancel' }] });
    await t.present();
  }
}