import { Component, ElementRef, OnInit, ViewChild, inject } from "@angular/core";
import { ToastController } from "@ionic/angular";
import { AuthService } from "src/app/services/auth/auth";
import * as L from "leaflet";
import { Router } from "@angular/router";
import { supabase } from "src/supabase.client";

(L.Icon.Default as any).mergeOptions({
  iconRetinaUrl: "assets/leaflet/marker-icon-2x.png",
  iconUrl: "assets/leaflet/marker-icon.png",
  shadowUrl: "assets/leaflet/marker-shadow.png"
});

@Component({
  selector: "app-delivery",
  templateUrl: "./delivery.page.html",
  styleUrls: ["./delivery.page.scss"],
  standalone: false
})
export class DeliveryPage implements OnInit {
  private toast = inject(ToastController);
  private auth = inject(AuthService);
  private router = inject(Router);

  private map?: L.Map;
  private marker?: L.Marker;
  private autoToast?: HTMLIonToastElement;
  private autoOps = 0;
  private readonly DEFAULT_CENTER = { lat: -34.662305, lng: -58.364723 };

  loading: boolean = true;
  mapOpen: boolean = false;
  email: string = "";
  address: string = "";
  lat: number | null = null;
  lng: number | null = null;

  @ViewChild("map", { static: false }) mapEl?: ElementRef<HTMLDivElement>;

  async ngOnInit() {
    try {
      const userAuth = await this.auth.getUser();
      if (!userAuth) {
        await this.mostrarToast("No hay sesión activa.");
        return;
      }
      this.email = userAuth.email ?? "";

      await this.redirigirSiTieneDeliveryActivo(userAuth);
    } catch {
      await this.mostrarToast("Error al cargar datos");
    } finally {
      setTimeout(() => (this.loading = false), 2000);
    }
  }

  private async redirigirSiTieneDeliveryActivo(
    user: { id?: string; email?: string } | null
  ): Promise<void> {
    try {
      let q = supabase
        .from("pedidos")
        .select("id, estado, tipo, delivery_direccion, delivery_lat, delivery_lng, created_at")
        .eq("tipo", "delivery")
        .order("created_at", { ascending: false })
        .limit(1);

      if (user?.email) q = q.eq("cliente_email", user.email);
      else if (user?.id) q = q.eq("cliente_uid", user.id);
      else return;

      const { data, error } = await q;
      if (error) return;

      const p = data?.[0];
      if (!p) return;

      if (["recibido", "terminado", "impagado"].includes(p.estado)) {
        this.router.navigate(["/encuestas-espera"], { replaceUrl: true });
        return;
      }

      if (["en_espera", "pendiente", "aceptado"].includes(p.estado)) {
        this.router.navigate(["/mesa-ocupada"], {
          queryParams: {
            delivery: true,
            address: p.delivery_direccion ?? "",
            lat: p.delivery_lat ?? "",
            lng: p.delivery_lng ?? ""
          },
          replaceUrl: true
        });
      }
    } catch { }
  }

  async geocodeAddress(): Promise<void> {
    const q = this.address?.trim();
    if (!q) { return; }

    await this.showAutoToast();
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({
        q,
        format: "jsonv2",
        addressdetails: "1",
        limit: "1",
        "accept-language": "es"
      }).toString();

      const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
      const data = await res.json();
      const first = data?.[0];
      if (!first) {
        await this.mostrarToast("Dirección no encontrada.");
        return;
      }
      this.lat = parseFloat(first.lat);
      this.lng = parseFloat(first.lon);
      this.address = first.display_name;
    } catch {
      await this.mostrarToast("No se pudo geocodificar.");
    } finally {
      await this.hideAutoToast();
    }
  }

  openMap(): void { this.mapOpen = true; }
  closeMap(): void { this.mapOpen = false; }

  onModalWillPresent(): void {
    const center = (this.lat != null && this.lng != null)
      ? { lat: this.lat, lng: this.lng }
      : this.DEFAULT_CENTER;

    setTimeout(() => {
      if (!this.mapEl) { return; }

      if (this.map) {
        this.map.remove();
        this.map = undefined;
      }

      this.map = L.map(this.mapEl.nativeElement, {
        center: [center.lat, center.lng],
        zoom: 15
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19
      }).addTo(this.map);

      this.marker = L.marker([center.lat, center.lng], { draggable: true }).addTo(this.map);

      this.lat = center.lat;
      this.lng = center.lng;
      this.reverseGeocode(center.lat, center.lng, true);

      this.map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        this.marker!.setLatLng([lat, lng]);
        this.lat = lat;
        this.lng = lng;
        this.reverseGeocode(lat, lng, true);
      });

      this.marker.on("dragend", () => {
        const p = this.marker!.getLatLng();
        this.lat = p.lat;
        this.lng = p.lng;
        this.reverseGeocode(p.lat, p.lng, true);
      });

      setTimeout(() => this.map?.invalidateSize(), 0);
    });
  }

  async reverseGeocode(lat: number, lng: number, silent: boolean = false): Promise<void> {
    if (!silent) { await this.showAutoToast(); }
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.search = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        format: "jsonv2",
        "accept-language": "es"
      }).toString();

      const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
      const data = await res.json();
      if (data?.display_name) { this.address = data.display_name; }
    } finally {
      if (!silent) { await this.hideAutoToast(); }
    }
  }

  async confirmFromMap(): Promise<void> {
    if ((this.lat == null || this.lng == null) && this.marker) {
      const p = this.marker.getLatLng();
      this.lat = p.lat;
      this.lng = p.lng;
    }
    if (this.lat == null || this.lng == null) { return; }

    await this.reverseGeocode(this.lat, this.lng, false);
    this.closeMap();
  }

  confirmar(): void {
    this.mostrarToast("Dirección guardada");
    this.router.navigate(['/mesa-ocupada'], {
      queryParams: {
        delivery: true,
        address: this.address,
        lat: this.lat,
        lng: this.lng
      }
    });
  }

  vaciar(): void {
    this.address = "";
    this.lat = null;
    this.lng = null;
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

  private async showAutoToast(): Promise<void> {
    this.autoOps++;
    if (this.autoOps > 1) { return; }
    this.autoToast = await this.toast.create({
      message: "Autocompletando",
      position: "top",
      cssClass: "toast"
    });
    await this.autoToast.present();
  }

  private async hideAutoToast(): Promise<void> {
    this.autoOps = Math.max(0, this.autoOps - 1);
    if (this.autoOps === 0 && this.autoToast) {
      await this.autoToast.dismiss();
      this.autoToast = undefined;
    }
  }
}