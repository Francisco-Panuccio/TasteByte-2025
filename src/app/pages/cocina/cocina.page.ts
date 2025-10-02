import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ToastController } from "@ionic/angular";
import { supabase } from "src/supabase.client";
import { Push } from "src/app/services/push/push";

@Component({
  selector: "app-cocina",
  templateUrl: "./cocina.page.html",
  styleUrls: ["./cocina.page.scss"],
  standalone: false
})
export class CocinaPage implements OnInit, OnDestroy {
  private push = inject(Push);
  private toast = inject(ToastController);
  pedidos: Array<{ id: string; pedido_id: string; mesa_id: number; mesa_numero: number; creado_en: string; estado: "pendiente" | "terminado"; items: any[]; total: number; cantidad: number }> = [];
  private channel?: ReturnType<typeof supabase.channel>;

  loading: boolean = true;

  async ngOnInit() {
    await this.push.init(undefined, "cocinero");
    await this.push.ready();
    this.push.onPush$.subscribe(async (d: Record<string, any>) => {
      if ((d?.["tipo"] ?? "") === "cocina_pedido") {
        const mesa = d?.["mesaNumero"] ?? d?.["mesaId"] ?? "";
        (await this.toast.create({ message: `Nuevo Pedido de la Mesa ${mesa}`, duration: 3000, position: "top" })).present();
        this.cargar();
      }
    });
    await this.cargar();
    this.channel = supabase
      .channel("cocina_pedidos_changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cocina_pedidos" }, () => this.cargar())
      .subscribe();
    setTimeout(() => (this.loading = false), 2000);
  }

  ngOnDestroy() {
    try { this.channel && supabase.removeChannel(this.channel); } catch { }
  }

  async cargar() {
    const { data } = await supabase.from("cocina_pedidos").select("*").eq("estado", "pendiente").order("creado_en", { ascending: false });
    this.pedidos = (data ?? []) as any[];
  }

  async terminar(id: string) {
    await supabase.from("cocina_pedidos").update({ estado: "terminado", terminado_en: new Date().toISOString() }).eq("id", id);
    this.pedidos = this.pedidos.filter(p => p.id !== id);
  }
}