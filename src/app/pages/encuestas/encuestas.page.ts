import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { supabase } from 'src/supabase.client';
import { ApexChart, ApexLegend, ApexDataLabels, ApexPlotOptions, ChartType } from "ng-apexcharts";

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
  userId!: string | null;

  respuestas: Array<{
    creado_en: string;
    calificacion_general: number | null;
    calidad_comida: 'excelente' | 'aceptable' | 'regular' | 'mala' | null;
    tiempo_espera: 'bajo' | 'razonable' | 'excesivo' | null;
    opinion: string | null;
  }> = [];

  qualityChart: {
    chart: ApexChart;
    labels: string[];
    series: number[];
    legend: ApexLegend;
    dataLabels: ApexDataLabels;
    plotOptions: ApexPlotOptions;
  } = {
      chart: {
        type: "donut" as ChartType,
        height: 390,
        parentHeightOffset: 0,
        toolbar: { show: false },
        offsetY: -1
      },
      labels: ["Excelente", "Aceptable", "Regular", "Mala"],
      series: [0, 0, 0, 0],

      dataLabels: {
        enabled: true,
        formatter: (val: string) => `${Math.round(parseFloat(val))}%`,
        style: { fontSize: "18px", fontWeight: 600 },
        dropShadow: { enabled: false }
      },

      legend: {
        show: true,
        position: "bottom",
        horizontalAlign: "center",
        floating: false,
        offsetY: 2,
        fontSize: "14px",
        itemMargin: { horizontal: 12, vertical: 6 }
      },

      plotOptions: {
        pie: {
          donut: {
            size: "70%",
            labels: {
              show: true,
              name: { show: true, fontSize: "14px", fontWeight: 600, offsetY: 6 },
              value: {
                show: true,
                fontSize: "16px",
                fontWeight: 700,
                offsetY: -6,
                formatter: ((
                  _val: string,
                  opts?: any
                ): string => {
                  const i = opts?.seriesIndex ?? 0;
                  const v = (opts?.w?.globals?.series as number[])[i] || 0;
                  const totals = (opts?.w?.globals?.seriesTotals as number[]) || [];
                  const total = totals.reduce((a: number, b: number) => a + b, 0) || 1;
                  return `${Math.round((v / total) * 100)}%`;
                }) as unknown as (val: string) => string
              },
              total: { show: false }
            }
          }
        }
      }
    };


  waitChart: any = {
    chart: { type: 'bar', height: 400, width: "100%" },
    series: [{ name: 'Respuestas', data: [0, 0, 0] }],
    xaxis: {
      categories: ["Bajo", "Razonable", "Excesivo"],
      labels: { style: { fontSize: "12px", fontWeight: 600 } }
    },
    yaxis: {
      labels: { style: { fontSize: "14px", fontWeight: 600 } }
    }
  };

  ratingChart: any = {
    chart: { type: "bar", height: 400, width: "100%", color: "black" },
    series: [{ name: "Calificaciones", data: new Array(10).fill(0) }],
    xaxis: {
      categories: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      labels: { style: { fontSize: "14px", fontWeight: 600 } }
    },
    yaxis: {
      labels: { style: { fontSize: "14px", fontWeight: 600 } }
    }
  };

  constructor(private router: Router, private route: ActivatedRoute) {
    this.route.queryParams.subscribe(params => {
      this.userId = params['userId'] ?? null;
      this.anonimoId = params['anonimoId'] ?? undefined;
      this.usuarioId = params['usuarioId'] ? Number(params['usuarioId']) : null;
      this.clienteId = params['clienteId'] ? Number(params['clienteId']) : null;
    });
  }

  async ngOnInit() {
    await this.evaluarPermisoEncuesta();
    await this.cargarRespuestas();
    this.armarGraficos();
    setTimeout(() => (this.loading = false), 2000);
  }

  private async evaluarPermisoEncuesta() {
    const { data: au } = await supabase.auth.getUser();
    const uid = au.user?.id ?? null;
    const email = au.user?.email ?? null;

    let qPed = supabase
      .from('pedidos')
      .select('id, estado, created_at')
      .eq('estado', 'terminado')
      .order('created_at', { ascending: false })
      .limit(1);

    const ors: string[] = [];
    if (uid) ors.push(`cliente_uid.eq.${uid}`);
    if (email) ors.push(`cliente_email.eq.${email}`);
    if (ors.length) qPed = qPed.or(ors.join(','));

    const { data: ped } = await qPed.maybeSingle();
    if (!ped) { this.puedeRealizar = false; return; }

    let qResp = supabase
      .from('encuestas_respuestas')
      .select('creado_en')
      .order('creado_en', { ascending: false })
      .limit(1);

    const orsR: string[] = [];
    if (uid) orsR.push(`cliente_uid.eq.${uid}`);
    if (email) orsR.push(`cliente_email.eq.${email}`);
    if (orsR.length) qResp = qResp.or(orsR.join(','));

    const { data: respUlt } = await qResp.maybeSingle();
    this.puedeRealizar = !respUlt || new Date(respUlt.creado_en).getTime() < new Date(ped.created_at).getTime();
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

  volver(): void {
    const from = this.route.snapshot.queryParamMap.get("from");
    if (from === "delivery") {
      this.router.navigate(["/delivery"]);
      return;
    }

    this.router.navigate(["/encuestas-espera"], {
      queryParams: {
        clienteId: this.clienteId ?? undefined,
        anonimoId: this.anonimoId ?? undefined,
        usuarioId: this.usuarioId ?? undefined,
        tienePermiso: true,
        qrValido: true,
        userId: this.userId ?? undefined
      }
    });
  }
}