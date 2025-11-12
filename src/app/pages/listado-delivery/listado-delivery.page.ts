import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth/auth';
import { Push } from 'src/app/services/push/push';
import { supabase } from 'src/supabase.client';
import { IonContent, IonModal, ToastController } from '@ionic/angular';
import { Chat } from 'src/app/services/chat/chat';
import * as L from 'leaflet';

(L.Icon.Default as any).mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
});

type PedidoDelivery = {
  id: string;
  tipo: string;
  estado: string;
  total: number | null;
  created_at: string | null;
  delivery_direccion: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
};

const ORIGEN = { lat: -34.662305, lng: -58.364723 };

@Component({
  selector: 'app-listado-delivery',
  templateUrl: './listado-delivery.page.html',
  styleUrls: ['./listado-delivery.page.scss'],
  standalone: false,
})
export class ListadoDeliveryPage implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private push = inject(Push);
  private router = inject(Router);
  private toast = inject(ToastController);
  private chatSvc = inject(Chat);

  loading = true;
  pedidos: PedidoDelivery[] = [];
  private sub?: ReturnType<typeof supabase.channel>;

  myUserId?: string;
  messages: any[] = [];
  newMsg = '';
  myName = 'Delivery';
  activePedidoId?: string;
  nombreCompleto = '';

  chatId?: string;
  chatOpen = false;
  @ViewChild('chatModal', { read: IonModal }) chatModal?: IonModal;
  @ViewChild('chatContent') chatContent?: IonContent;

  @ViewChildren('map') mapRefs?: QueryList<ElementRef<HTMLDivElement>>;
  private maps = new Map<string, L.Map>();
  private layers = new Map<string, L.Layer>();

  get activePedido(): PedidoDelivery | undefined {
    return this.pedidos.find((p) => p.id === this.activePedidoId);
  }

  async ngOnInit() {
    const { data: au } = await supabase.auth.getUser();
    await this.push.init(au?.user?.id ?? null, 'delivery');
    await this.initPushRole();
    await this.cargar();
    this.myUserId = await this.chatSvc.getMyUserId();

    this.mapRefs?.changes?.subscribe(() => this.initAllMaps());

    this.sub = supabase
      .channel('delivery_pedidos_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos' },
        () => this.cargar()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos' },
        () => this.cargar()
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    try {
      this.sub?.unsubscribe?.();
    } catch { }
    this.maps.forEach((m) => m.remove());
    this.maps.clear();
    this.layers.clear();
  }

getDireccionCorta(direccion: string | null): string {
  if (!direccion) return '';
  const partes = direccion.split(',');
  if (partes.length < 5) {
    return partes.join(',');
  }
  const direccionCorta = partes.slice(0, 4).join(',') + ', ' + partes[partes.length - 2];
  return direccionCorta;
}

  async cargar() {
    this.loading = true;
    try {
      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidos')
        .select(
          'id, tipo, cliente_email, estado, total, created_at, delivery_direccion, delivery_lat, delivery_lng'
        )
        .eq('tipo', 'delivery')
        .eq('estado', 'recibido')
        .order('created_at', { ascending: false });
      if (pedidosError) throw pedidosError;

      this.pedidos = (pedidosData ?? []) as PedidoDelivery[];
      if (
        !this.activePedidoId ||
        !this.pedidos.some((p) => p.id === this.activePedidoId)
      ) {
        this.activePedidoId = this.pedidos[0]?.id;
      }

      const emails = Array.from(
        new Set(
          (pedidosData ?? []).map((p: any) => p.cliente_email).filter(Boolean)
        )
      );
      if (emails.length) {
        const { data: users } = await supabase
          .from('usuarios')
          .select('correo_electronico, apellidos, nombres')
          .in('correo_electronico', emails);
        const nameByEmail = new Map<string, string>();
        for (const u of users ?? []) {
          const full = `${u.nombres ?? ''} ${u.apellidos ?? ''}`.trim();
          nameByEmail.set(u.correo_electronico as string, full);
        }
        this.pedidos = (this.pedidos as any).map((p: any) => ({
          ...p,
          nombreCliente: p.cliente_email
            ? nameByEmail.get(p.cliente_email) ?? null
            : null,
        }));
        this.nombreCompleto = nameByEmail.get(emails[0]) ?? '';
      } else {
        this.nombreCompleto = '';
      }
    } catch (e) {
      console.log(e);
    } finally {
      this.loading = false;
      setTimeout(() => this.initAllMaps(), 0);
    }
  }

  async terminarPedido(id: string): Promise<void> {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('pedidos')
        .update({ estado: 'terminado' })
        .eq('id', id)
        .eq('tipo', 'delivery')
        .eq('estado', 'recibido')
        .select('id, cliente_email, cliente_uid')
        .maybeSingle();

      if (error) {
        (
          await this.toast.create({
            message: `Error: ${error.message}`,
            duration: 1500,
            position: 'top',
            cssClass: 'toast',
          })
        ).present();
        return;
      }

      if (!data) {
        (
          await this.toast.create({
            message: "Pedido no estaba en 'recibido' o ya fue actualizado",
            duration: 1500,
            position: 'top',
            cssClass: 'toast',
          })
        ).present();
        await this.cargar();
        return;
      }

      try {
        const targets: string[] = [];

        if (data.cliente_uid) {
          const { data: toks } = await supabase
            .from('push_tokens')
            .select('token')
            .eq('usuario_id', data.cliente_uid)
            .eq('active', true)
            .eq('revoked', false);
          for (const t of toks ?? []) targets.push((t as any).token);
        }

        if (!targets.length && data.cliente_email) {
          const { data: user } = await supabase
            .from('usuarios')
            .select('id')
            .eq('correo_electronico', data.cliente_email)
            .maybeSingle();

          if (user?.id) {
            const { data: toks } = await supabase
              .from('push_tokens')
              .select('token')
              .eq('usuario_id', user.id)
              .eq('active', true)
              .eq('revoked', false);
            for (const t of toks ?? []) targets.push((t as any).token);
          }
        }

        if (targets.length) {
          await this.push.send(
            targets,
            'Pedido Entregado',
            'Su pedido fue entregado con éxito. ¡Gracias por confiar en TasteByte!',
            {
              tipo: 'pedido_terminado',
              pedidoId: id,
            }
          );
        }
      } catch (pushErr) {
        console.warn('⚠️ Error enviando push de pedido terminado:', pushErr);
      }

      (
        await this.toast.create({
          message: 'Pedido marcado como terminado',
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();

      if (this.activePedidoId === id) this.activePedidoId = undefined;
      await this.cargar();
    } catch (e: any) {
      (
        await this.toast.create({
          message: e?.message ?? 'Error inesperado',
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
    }
  }

  private fitMap(map: L.Map, bounds: L.LatLngBoundsExpression): void {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    }, 150);
  }

  private initAllMaps(): void {
    const els = this.mapRefs?.toArray() ?? [];
    els.forEach((ref: any, idx: any) => {
      const p = this.pedidos[idx];
      if (!p || !ref?.nativeElement) return;
      this.initMapForPedido(p, ref.nativeElement);
    });
  }

  private async initMapForPedido(p: PedidoDelivery, el: HTMLDivElement) {
    if (this.maps.has(p.id)) {
      const m = this.maps.get(p.id)!;
      setTimeout(() => m.invalidateSize(), 0);
      return;
    }

    const map = L.map(el, { center: [ORIGEN.lat, ORIGEN.lng], zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 19,
    }).addTo(map);
    map.attributionControl.setPrefix('');

    const origen = L.marker([ORIGEN.lat, ORIGEN.lng])
      .addTo(map)
      .bindTooltip('Restaurante');

    let destLat = p.delivery_lat ?? null;
    let destLng = p.delivery_lng ?? null;
    if ((destLat == null || destLng == null) && p.delivery_direccion) {
      try {
        const g = await this.geocode(p.delivery_direccion);
        destLat = g.lat;
        destLng = g.lng;
      } catch { }
    }

    if (destLat != null && destLng != null) {
      const destino = L.marker([destLat, destLng]).addTo(map)
      const addr = this.getDireccionCorta(p.delivery_direccion) ?? "Dirección no disponible";
      this.addAddressControl(map, addr);

      try {
        const line = await this.route(
          [ORIGEN.lat, ORIGEN.lng],
          [destLat, destLng]
        );
        if (this.layers.has(p.id)) this.layers.get(p.id)!.remove();
        line.addTo(map);
        this.layers.set(p.id, line);

        const group = L.featureGroup([origen, destino, line]);
        this.fitMap(map, group.getBounds());
      } catch {
        const group = L.featureGroup([origen, destino]);
        this.fitMap(map, group.getBounds());
      }
    } else {
      map.setView([ORIGEN.lat, ORIGEN.lng], 15);
      setTimeout(() => map.invalidateSize(), 150);
    }

    this.maps.set(p.id, map);
  }

  private addAddressControl(map: L.Map, text: string): void {
    const C = L.Control.extend({
      onAdd: () => {
        const div = L.DomUtil.create("div", "addr-control");
        div.innerHTML = `${text}`;
        return div;
      }
    });
    const ctrl = new C({ position: "bottomleft" } as any);
    map.addControl(ctrl as any);
  }

  private async geocode(q: string): Promise<{ lat: number; lng: number }> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({
      q,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
      'accept-language': 'es',
    }).toString();
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    const f = data?.[0];
    if (!f) throw new Error('No geocode');
    return { lat: parseFloat(f.lat), lng: parseFloat(f.lon) };
  }

  private async route(
    a: [number, number],
    b: [number, number]
  ): Promise<L.Polyline> {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates as
      | [number, number][]
      | undefined;
    if (!coords?.length) throw new Error('No route');
    const latlngs = coords.map(([lon, lat]) => [lat, lon]) as [
      number,
      number
    ][];
    return L.polyline(latlngs, { weight: 5 });
  }

  async abrirChatFooter(): Promise<void> {
    const p = this.activePedido;
    if (!p) {
      (
        await this.toast.create({
          message: 'No existen pedidos activos actualmente',
          duration: 1500,
          position: 'top',
          cssClass: 'toast',
        })
      ).present();
      return;
    }
    this.abrirChatDelivery(p);
  }

  async abrirChatDelivery(p: PedidoDelivery) {
    const chat = await this.chatSvc.getOrCreateForDeliveryByPedido(p.id);
    this.chatId = chat.id;

    await this.bindDeliveryChatToken(chat.id, 'delivery');

    const since = p.created_at ?? new Date().toISOString();
    const rows = await this.chatSvc.loadMessagesSince(chat.id, since, 200);

    const seen = new Set<string>();
    this.messages = rows.map((m) => {
      seen.add(m.id);
      const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
      return { ...vm, role: vm.from === 'yo' ? 'delivery' : 'cliente', createdAt: new Date(m.created_at) };
    });
    this.chatOpen = true;
    this.scrollToBottomAfterRender();

    this.chatSvc.unsubscribe();
    this.chatSvc.subscribeToMessages(
      chat.id,
      async (m) => {
        if (new Date(m.created_at) < new Date(String(since))) return;
        if (seen.has(m.id)) return;
        seen.add(m.id);

        const vm = this.chatSvc.toViewMessage(m, this.myUserId!);
        this.messages.push({
          ...vm,
          role: vm.from === 'yo' ? 'delivery' : 'cliente',
          createdAt: new Date(m.created_at)
        });

        if (vm.from !== 'yo') {
          await this.push.sendLocal(
            'Nuevo mensaje',
            String((vm as any).text ?? m.body ?? '')
          );
        }
        this.scrollToBottomAfterRender();
      },
      since
    );
  }

  private async bindDeliveryChatToken(
    chatId: string,
    role: 'delivery' | 'cliente'
  ): Promise<void> {
    try {
      const tk = this.push.getToken?.();
      if (!tk) return;

      const { data: row } = await supabase
        .from('delivery_chat_participants')
        .select('chat_id,role')
        .eq('chat_id', chatId)
        .eq('role', role)
        .maybeSingle();

      if (row) {
        await supabase
          .from('delivery_chat_participants')
          .update({ push_token: tk })
          .eq('chat_id', chatId)
          .eq('role', role);
      } else {
        await supabase
          .from('delivery_chat_participants')
          .upsert(
            { chat_id: chatId, role, push_token: tk },
            { onConflict: 'chat_id,role' }
          );
      }
    } catch { }
  }

  private async notifyDeliveryPeers(
    chatId: string,
    fromRole: 'delivery' | 'cliente',
    preview: string
  ): Promise<void> {
    try {
      const { data: parts } = await supabase
        .from('delivery_chat_participants')
        .select('role,push_token,user_id')
        .eq('chat_id', chatId);

      const targets = new Set<string>();
      for (const p of parts ?? []) {
        if ((p as any).role === fromRole) continue;

        const tk = (p as any).push_token as string | null;
        if (tk) {
          targets.add(tk);
          continue;
        }

        const uid = (p as any).user_id as string | null;
        if (uid) {
          const { data: toks } = await supabase
            .from('push_tokens')
            .select('token')
            .eq('usuario_id', uid)
            .eq('active', true)
            .eq('revoked', false);
          for (const t of toks ?? []) targets.add((t as any).token as string);
        }
      }

      const list = Array.from(targets);
      if (!list.length) return;

      await this.push.send(
        list,
        'Nuevo mensaje',
        preview?.slice(0, 100) || 'Toque para abrir el chat',
        { tipo: 'delivery_chat', chatId }
      );
    } catch { }
  }

  private scrollToBottom(ms: number = 200) {
    try {
      this.chatContent?.scrollToBottom(ms);
    } catch { }
  }

  private scrollToBottomAfterRender() {
    requestAnimationFrame(() => setTimeout(() => this.scrollToBottom(200), 0));
  }

  async cerrarChat() {
    await this.chatModal?.dismiss();
    this.chatOpen = false;
    this.chatSvc.unsubscribe();
  }

  async enviar() {
    const t = this.newMsg.trim();
    if (!t || !this.chatId) return;
    await this.chatSvc.sendMessage(this.chatId, t);
    this.newMsg = '';
    await this.notifyDeliveryPeers(this.chatId, 'delivery', t);
  }

  private async initPushRole() {
    try {
      const tk = this.push.getToken?.();
      const { data: au } = await supabase.auth.getUser();
      if (tk && au?.user?.id) {
        await supabase
          .from('push_tokens')
          .update({
            usuario_id: au.user.id,
            role: 'delivery',
            active: true,
            revoked: false,
          })
          .eq('token', tk);
      }
    } catch { }
  }

  async logOut() {
    try {
      const tok = this.push.getToken?.();
      if (tok)
        await supabase
          .from('push_tokens')
          .update({ active: false })
          .eq('token', tok);
    } catch { }
    try {
      await (this.auth as any).signOut();
    } catch { }
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}