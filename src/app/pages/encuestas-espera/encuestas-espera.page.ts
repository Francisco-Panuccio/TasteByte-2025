import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Qr } from 'src/app/services/qr/qr';
import { supabase } from 'src/supabase.client';

@Component({
  selector: 'app-encuestas-espera',
  templateUrl: './encuestas-espera.page.html',
  styleUrls: ['./encuestas-espera.page.scss'],
  standalone: false
})
export class EncuestasEsperaPage implements OnInit {
  nombreCliente: string | undefined;
  usuarioId: string | undefined;
  encuestas: any[] = [];
  clientes: any[] = [];
  qrValido = false;   
  loading = true;

  private qr = inject(Qr);

  constructor(private route: ActivatedRoute) {}

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.usuarioId = params['userId'];
      const anonimoId = params['anonimoId'];

      if (this.usuarioId) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('nombres, apellidos')
          .eq('id', this.usuarioId)
          .single();
        this.nombreCliente = usuario ? `${usuario.nombres} ${usuario.apellidos}` : 'Cliente';
      } else if (anonimoId) {
    const { data: anonimo } = await supabase
      .from('clientes_anonimos')
      .select('nombre')
      .eq('id', anonimoId)
      .single();
    this.nombreCliente = anonimo?.nombre || 'Cliente Anónimo';
  }
    });

    setTimeout(() => {
      this.loading = false;
    }, 1000);
  }

  async escanearQr() {
    const qr = await this.qr.scanQr();
    if (!qr) return;

    const anonimoId = this.route.snapshot.queryParamMap.get('anonimoId')!;
    const res = await this.qr.procesarQrCliente(anonimoId, qr);

    if (res.error) {
      alert(res.error);
      return;
    }

    if (res.yaRegistrado) {
      this.qrValido = true;
      await this.cargarListaYEncuestas();
      alert("Ya estás en lista de espera. Podés ver las encuestas mientras esperás.");
    }
    if (res.registrado) {
      this.qrValido = true;
      await this.cargarListaYEncuestas();
      alert("Te registraste en la lista de espera. Esperá a que te asignen mesa.");
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
    const payload: any = { estado: 'pendiente' };

    if (this.usuarioId) {
      payload.cliente_id = this.usuarioId;
    } else {
      payload.cliente_anonimo_id = this.route.snapshot.queryParamMap.get('anonimoId');
    }

    const { error } = await supabase.from('lista_espera').insert(payload);
    if (error) {
      alert('Error al registrarse en la lista de espera');
      return;
    }

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
}
