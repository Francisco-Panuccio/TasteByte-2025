import { Component, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { supabase } from "src/supabase.client";
import { ToastController } from "@ionic/angular";

@Component({
  selector: "app-cuenta",
  templateUrl: "./cuenta.page.html",
  styleUrls: ["./cuenta.page.scss"],
  standalone: false
})
export class CuentaPage implements OnInit {
  pedidoId!: string;
  items: any[] = [];
  ped: any;
  descuento: number = 0;
  propina: number = 0;
  totalFinal: number = 0;

  constructor(
    private ar: ActivatedRoute,
    private toast: ToastController,
    private router: Router
  ) {}

  async ngOnInit() {
    this.pedidoId =
      this.ar.snapshot.paramMap.get("id") ??
      this.ar.snapshot.queryParamMap.get("id") ??
      "";

    if (!this.pedidoId) {
      await this.mostrarToast("⚠ No se encontró el pedido");
      return;
    }

    // 1. Traer pedido e ítems
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("id, total, estado, cliente_uid, mesa_id")
      .eq("id", this.pedidoId)
      .maybeSingle();

    this.ped = pedido;

    const { data: items } = await supabase
      .from("pedido_items")
      .select("nombre, cantidad, precio_unit")
      .eq("pedido_id", this.pedidoId);

    this.items = items || [];

    // 2. Buscar descuento
    const { data: desc } = await supabase
      .from("descuentos")
      .select("porcentaje")
      .eq("pedido_id", this.pedidoId)
      .maybeSingle();

    this.descuento = desc ? desc.porcentaje : 0;

    // 3. Calcular total
    let subtotal = this.items.reduce(
      (acc, it) => acc + it.cantidad * it.precio_unit,
      0
    );

    if (this.descuento > 0) {
      subtotal = subtotal * (1 - this.descuento / 100);
    }

    this.totalFinal = subtotal; // sin propina aún
  }

  aplicarPropina(p: number) {
    this.propina = (this.totalFinal * p) / 100;
    this.totalFinal = this.totalFinal + this.propina;
  }

  async pagar() {
    // Opcional: guardar en tabla propinas
    const { error } = await supabase.from("propinas").insert({
      pedido_id: this.pedidoId,
      propina: this.propina,
      pagado_en: new Date().toISOString()
    });

    if (error) {
      await this.mostrarToast(`❌ Error al pagar: ${error.message}`);
      return;
    }

    await this.mostrarToast("✅ Pago realizado. Espera confirmación del mozo.");
    this.router.navigate(["/encuestas-espera"]);
  }

  private async mostrarToast(mensaje: string, color: string = "primary") {
    const t = await this.toast.create({
      message: mensaje,
      duration: 2500,
      color,
      position: "top"
    });
    await t.present();
  }
}
