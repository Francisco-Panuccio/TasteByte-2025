import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { supabase } from 'src/supabase.client';

type Segment = 'encuestas' | 'graficos';

@Component({
  selector: 'app-encuestas',
  templateUrl: './encuestas.page.html',
  styleUrls: ['./encuestas.page.scss'],
  standalone: false
})
export class EncuestasPage implements OnInit {
  loading = true;
  segment: Segment = 'encuestas';
  puedeRealizar = false;

  anonimoId?: string;
  usuarioId: number | null = null;
  clienteId: number | null = null;

  respuestas: Array<{
    creado_en: string;
    calificacion_general: number | null;
    calidad_comida: 'excelente' | 'aceptable' | 'regular' | 'mala' | null;
    tiempo_espera: 'bajo' | 'razonable' | 'excesivo' | null;
    opinion: string | null;
  }> = [];

  qualityChart: any = {
    chart: { type: 'donut' },
    labels: ['Excelente', 'Aceptable', 'Regular', 'Mala'],
    series: [0, 0, 0, 0]
  };

  waitChart: any = {
    chart: { type: 'bar' },
    series: [{ name: 'Respuestas', data: [0, 0, 0] }],
    xaxis: { categories: ['Bajo', 'Razonable', 'Excesivo'] }
  };

  ratingChart: any = {
    chart: { type: 'bar' },
    series: [{ name: 'Calificaciones', data: new Array(10).fill(0) }],
    xaxis: { categories: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] }
  };

  constructor(private router: Router, private route: ActivatedRoute) { }

  async ngOnInit() {
    const p = this.route.snapshot.queryParamMap;
    this.anonimoId = p.get('anonimoId') ?? undefined;
    this.usuarioId = p.get('usuarioId') ? Number(p.get('usuarioId')) : null;
    this.clienteId = p.get('clienteId') ? Number(p.get('clienteId')) : null;

    await this.evaluarPermisoEncuesta();
    await this.cargarRespuestas();
    this.armarGraficos();
    setTimeout(() => (this.loading = false), 2000);
  }

  private async evaluarPermisoEncuesta() {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id ?? null;
    const email = au.user?.email ?? null;

    let q = supabase
      .from('pedidos')
      .select('id, estado')
      .eq('estado', 'terminado')
      .order('created_at', { ascending: false })
      .limit(1);

    const ors: string[] = [];
    if (uid) ors.push(`cliente_uid.eq.${uid}`);
    if (email) ors.push(`cliente_email.eq.${email}`);
    if (ors.length) q = q.or(ors.join(','));

    const { data } = await q.maybeSingle();
    this.puedeRealizar = !!data;
  }

  private async cargarRespuestas() {
    const { data } = await supabase
      .from('encuestas_respuestas')
      .select('creado_en, calificacion_general, calidad_comida, tiempo_espera, opinion')
      .order('creado_en', { ascending: false });
    this.respuestas = (data ?? []) as any[];
  }

  private armarGraficos() {
    const calidadMap = { excelente: 0, aceptable: 0, regular: 0, mala: 0 } as Record<string, number>;
    const esperaMap = { bajo: 0, razonable: 0, excesivo: 0 } as Record<string, number>;
    const califArr = new Array(10).fill(0) as number[];

    for (const r of this.respuestas) {
      if (r.calidad_comida && calidadMap[r.calidad_comida] != null) calidadMap[r.calidad_comida]++;
      if (r.tiempo_espera && esperaMap[r.tiempo_espera] != null) esperaMap[r.tiempo_espera]++;
      if (typeof r.calificacion_general === 'number' && r.calificacion_general >= 1 && r.calificacion_general <= 10) {
        califArr[r.calificacion_general - 1]++;
      }
    }

    this.qualityChart = {
      ...this.qualityChart,
      series: [
        calidadMap['excelente'],
        calidadMap['aceptable'],
        calidadMap['regular'],
        calidadMap['mala']
      ]
    };

    this.waitChart = {
      ...this.waitChart,
      series: [{ name: 'Respuestas', data: [esperaMap['bajo'], esperaMap['razonable'], esperaMap['excesivo']] }]
    };

    this.ratingChart = {
      ...this.ratingChart,
      series: [{ name: 'Calificaciones', data: califArr }]
    };
  }

  volver() {
    this.router.navigate(['/encuestas-espera'], {
      queryParams: { anonimoId: this.anonimoId, usuarioId: this.usuarioId, clienteId: this.clienteId }
    });
  }
}