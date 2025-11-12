import { Injectable, inject } from "@angular/core";
import { supabase } from "src/supabase.client";
import { ChatMessage } from "src/app/interfaces/chat-message";
import { Push } from "src/app/services/push/push";

type Role = "cliente" | "mozo" | "delivery";

export interface Chat {
  id: string;
  mesa_id: number;
  created_at: string;
}

@Injectable({ providedIn: "root" })
export class Chat {
  private channel?: ReturnType<typeof supabase.channel>;
  private push = inject(Push);
  private chatKind = new Map<string, "mesa" | "delivery">();

  async getMyUserId(anonimoId?: string): Promise<string> {
    if (anonimoId) return `anon-${anonimoId}`;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error("Sin sesión.");
    return data.user.id;
  }

  private async getMyDisplayName(anonimoId?: string): Promise<string> {
    try {
      if (anonimoId) {
        const { data } = await supabase
          .from("clientes_anonimos")
          .select("nombre")
          .eq("id", anonimoId)
          .maybeSingle();
        return data?.nombre?.trim() || "Cliente Anónimo";
      }
      const { data: au } = await supabase.auth.getUser();
      const email = au?.user?.email ?? null;
      if (!email) return "Usuario";
      const { data } = await supabase
        .from("usuarios")
        .select("nombres, apellidos")
        .eq("correo_electronico", email)
        .maybeSingle();
      const n = (data?.nombres ?? "").trim();
      const a = (data?.apellidos ?? "").trim();
      return (n || a) ? `${n} ${a}`.trim() : "Usuario";
    } catch {
      return "Usuario";
    }
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private async isDeliveryChat(chatId: string): Promise<boolean> {
    const cached = this.chatKind.get(chatId);
    if (cached) return cached === "delivery";
    const { data } = await supabase
      .from("delivery_chats")
      .select("id")
      .eq("id", chatId)
      .maybeSingle();
    const kind: "mesa" | "delivery" = data?.id ? "delivery" : "mesa";
    this.chatKind.set(chatId, kind);
    return kind === "delivery";
  }

  async getOrCreateForDeliveryByPedido(pedidoId: string): Promise<{ id: string }> {
    let { data: chat } = await supabase
      .from("delivery_chats")
      .select("id")
      .eq("pedido_id", pedidoId)
      .maybeSingle();

    if (!chat) {
      const ins = await supabase
        .from("delivery_chats")
        .insert({ pedido_id: pedidoId })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      chat = ins.data;
    }

    const chatId = chat.id as string;
    this.chatKind.set(chatId, "delivery");

    const myId = await this.getMyUserId();
    await supabase
      .from("delivery_chat_participants")
      .upsert({ chat_id: chatId, user_id: myId, role: "delivery" }, { onConflict: "chat_id,user_id" });

    const { data: ped } = await supabase
      .from("pedidos")
      .select("cliente_uid, cliente_email")
      .eq("id", pedidoId)
      .maybeSingle();

    let clienteId: string | null = ped?.cliente_uid ?? null;
    if (!clienteId && ped?.cliente_email) {
      const { data: u } = await supabase
        .from("usuarios")
        .select("id")
        .eq("correo_electronico", ped.cliente_email)
        .maybeSingle();
      clienteId = u?.id ?? null;
    }
    if (clienteId) {
      await supabase
        .from("delivery_chat_participants")
        .upsert({ chat_id: chatId, user_id: clienteId, role: "cliente" }, { onConflict: "chat_id,user_id" });
    }

    await this.bindMyPushToken(chatId);
    return { id: chatId };
  }

  private async getMyRoleInDeliveryChat(chatId: string, anonimoId?: string): Promise<Role> {
    if (anonimoId) return "cliente";
    const uid = await this.getMyUserId();
    const { data } = await supabase
      .from("delivery_chat_participants")
      .select("role")
      .eq("chat_id", chatId)
      .eq("user_id", uid)
      .maybeSingle();
    return (data?.role as Role) || "cliente";
  }

  private async getParticipantTokensDelivery(chatId: string, targetRole: "cliente" | "delivery"): Promise<string[]> {
    const { data: part } = await supabase
      .from("delivery_chat_participants")
      .select("user_id,push_token")
      .eq("chat_id", chatId)
      .eq("role", targetRole)
      .maybeSingle();

    const tk = (part?.push_token as string | null) || null;
    if (tk) return [tk];

    const userId = part?.user_id as string | undefined;
    if (!userId) return [];
    const { data: toks } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("usuario_id", userId)
      .eq("active", true)
      .eq("revoked", false);
    return (toks ?? []).map((t: any) => t.token as string);
  }

  async loadDeliveryMessagesSince(chatId: string, sinceISO: string, limit = 200): Promise<ChatMessage[]> {
    const { data } = await supabase
      .from("delivery_chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true })
      .limit(limit);
    return (data ?? []) as ChatMessage[];
  }

  subscribeToDeliveryMessages(chatId: string, onInsert: (m: ChatMessage) => void, sinceISO?: string): void {
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = supabase
      .channel(`delivery_chat:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (sinceISO && new Date(msg.created_at) < new Date(sinceISO)) return;
          onInsert(msg);
        }
      )
      .subscribe();
  }

  async sendMessageDelivery(chatId: string, text: string, anonimoId?: string): Promise<ChatMessage> {
    const userId = await this.getMyUserId(anonimoId);
    const role = await this.getMyRoleInDeliveryChat(chatId, anonimoId);
    const fromName = await this.getMyDisplayName(anonimoId);

    const ins = await supabase
      .from("delivery_chat_messages")
      .insert({ chat_id: chatId, user_id: userId, body: text })
      .select("*")
      .single();
    if (ins.error) throw ins.error;

    const preview = text.slice(0, 80);

    if (role === "delivery") {
      const to = await this.getParticipantTokensDelivery(chatId, "cliente");
      if (to.length) {
        await this.push.send(to, "Nuevo mensaje del repartidor", text, {
          tipo: "chat_delivery",
          chatId,
          fromRole: "delivery",
          fromName,
          preview,
        });
      }
    } else {
      const to = await this.getParticipantTokensDelivery(chatId, "delivery");
      if (to.length) {
        await this.push.send(to, "Nuevo mensaje del cliente", text, {
          tipo: "chat_delivery",
          chatId,
          fromRole: "cliente",
          fromName,
          preview,
        });
      }
    }

    return ins.data as ChatMessage;
  }

  async getOrCreateForMesa(mesaId: number, role: Role = "cliente", anonimoId?: string): Promise<Chat> {
    let { data: chats } = await supabase.from("chats").select("*").eq("mesa_id", mesaId).limit(1);
    let chat: Chat | null = chats?.[0] ?? null;

    if (!chat) {
      const ins = await supabase.from("chats").insert({ mesa_id: mesaId }).select("*").single();
      if (ins.error) throw ins.error;
      chat = ins.data as Chat;
    }

    const userId = await this.getMyUserId(anonimoId);
    const { data: existing } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("chat_id", chat.id)
      .eq("user_id", userId)
      .limit(1);

    if (!existing?.length) {
      await supabase.from("chat_participants").insert({ chat_id: chat.id, user_id: userId, role });
    }

    this.chatKind.set(chat.id, "mesa");
    return chat;
  }

  async listByClient(userId?: string): Promise<Chat[]> {
    const uid = userId || (await this.getMyUserId());
    const { data: cps } = await supabase.from("chat_participants").select("chat_id").eq("user_id", uid);
    const ids = (cps ?? []).map((r: any) => r.chat_id);
    if (!ids.length) return [];
    const { data: chats } = await supabase.from("chats").select("*").in("id", ids).order("created_at", { ascending: false });
    return (chats ?? []) as Chat[];
  }

  async loadMessages(chatId: string, limit = 200): Promise<ChatMessage[]> {
    if (await this.isDeliveryChat(chatId)) {
      const { data } = await supabase
        .from("delivery_chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(limit);
      return (data ?? []) as ChatMessage[];
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(limit);
    return (data ?? []) as ChatMessage[];
  }

  async loadMessagesSince(chatId: string, sinceISO: string, limit = 200): Promise<ChatMessage[]> {
    if (await this.isDeliveryChat(chatId)) {
      return this.loadDeliveryMessagesSince(chatId, sinceISO, limit);
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: true })
      .limit(limit);
    return (data ?? []) as ChatMessage[];
  }

  subscribeToMessages(chatId: string, onInsert: (m: ChatMessage) => void, sinceISO?: string): void {
    void (async () => {
      if (this.channel) supabase.removeChannel(this.channel);
      if (await this.isDeliveryChat(chatId)) {
        this.subscribeToDeliveryMessages(chatId, onInsert, sinceISO);
      } else {
        this.channel = supabase
          .channel(`chat:${chatId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
            (payload) => {
              const msg = payload.new as ChatMessage;
              if (sinceISO && new Date(msg.created_at) < new Date(sinceISO)) return;
              onInsert(msg);
            }
          )
          .subscribe();
      }
    })();
  }

  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = undefined;
    }
  }

  private async getClienteTokensPreferChat(chatId: string, mesaId: number): Promise<string[]> {
    const { data: parts } = await supabase
      .from("chat_participants")
      .select("user_id,push_token")
      .eq("chat_id", chatId)
      .eq("role", "cliente")
      .limit(1);
    const tk = (parts?.[0]?.push_token as string | null) || null;
    if (tk) return [tk];
    const clienteUserId = parts?.[0]?.user_id as string | undefined;
    if (!clienteUserId) return [];
    const { data: toks } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("usuario_id", clienteUserId)
      .eq("active", true)
      .eq("revoked", false);
    return (toks ?? []).map((t: any) => t.token as string);
  }

  async sendMessage(chatId: string, text: string, anonimoId?: string): Promise<ChatMessage> {
    if (await this.isDeliveryChat(chatId)) {
      return this.sendMessageDelivery(chatId, text, anonimoId);
    }

    const userId = await this.getMyUserId(anonimoId);
    const role = await this.getMyRoleInChat(chatId, anonimoId);
    const fromName = await this.getMyDisplayName(anonimoId);
    const myToken = this.push.getToken?.();

    const ins = await supabase
      .from("chat_messages")
      .insert({ chat_id: chatId, user_id: userId, body: text })
      .select("*")
      .single();
    if (ins.error) throw ins.error;

    let mesaId: number | null = null;
    try {
      const { data: chat } = await supabase.from("chats").select("mesa_id").eq("id", chatId).single();
      mesaId = (chat?.mesa_id as number) ?? null;
    } catch { }

    const preview = text.slice(0, 80);

    if (role === "cliente") {
      const { data } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("role", "mozo")
        .eq("active", true)
        .eq("revoked", false);
      const to = Array.from(new Set((data ?? []).map((r: any) => r.token as string).filter(Boolean)));

      const filtered = myToken ? to.filter(t => t !== myToken) : to;

      if (filtered.length) {
        await this.push.send(filtered, `Nuevo mensaje del cliente${mesaId ? " de la mesa " + mesaId : ""}`, text, {
          tipo: "chat",
          mesaId,
          chatId,
          fromRole: "cliente",
          fromName,
          preview,
        });
      }
    } else {
      const to = Array.from(new Set((await this.getClienteTokensPreferChat(chatId, mesaId ?? 0)).filter(Boolean)));

      const filtered = myToken ? to.filter(t => t !== myToken) : to;

      if (filtered.length) {
        await this.push.send(filtered, "Nuevo mensaje del mozo", text, {
          tipo: "chat",
          mesaId,
          chatId,
          fromRole: "mozo",
          fromName,
          preview,
        });
      }
    }

    return ins.data as ChatMessage;
  }

  private async getMyRoleInChat(chatId: string, anonimoId?: string): Promise<Role> {
    if (anonimoId) return "cliente";
    const uid = await this.getMyUserId();
    const { data } = await supabase
      .from("chat_participants")
      .select("role")
      .eq("chat_id", chatId)
      .eq("user_id", uid)
      .maybeSingle();
    return (data?.role as Role) || "cliente";
  }

  async bindMyPushToken(chatId: string, anonimoId?: string): Promise<void> {
    const tk = this.push.getToken?.();
    if (!tk) return;
    const uid = await this.getMyUserId(anonimoId);
    if (await this.isDeliveryChat(chatId)) {
      await supabase
        .from("delivery_chat_participants")
        .update({ push_token: tk })
        .eq("chat_id", chatId)
        .eq("user_id", uid);
    } else {
      await supabase
        .from("chat_participants")
        .update({ push_token: tk })
        .eq("chat_id", chatId)
        .eq("user_id", uid);
    }
  }

  toViewMessage(
    m: ChatMessage,
    myUserId: string
  ): { id: string; from: "yo" | "mozo"; role: "mozo" | "cliente"; text: string; time: string; createdAt: string } {
    const fromMe = m.user_id === myUserId;
    const role: "mozo" | "cliente" = fromMe ? "cliente" : "mozo";

    return {
      id: m.id,
      from: fromMe ? "yo" : "mozo",
      role,
      text: m.body,
      time: this.hhmm(new Date(m.created_at)),
      createdAt: m.created_at,
    };
  }

  async notifyMozosNuevoPedido(mesaNumero: number, totalARS: string, pedidoId: string, mesaId: number): Promise<void> {
    const { data } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("role", "mozo")
      .eq("active", true)
      .eq("revoked", false);
    const to = Array.from(new Set((data ?? []).map((r: any) => r.token as string).filter(Boolean)));
    if (to.length) {
      await this.push.send(to, "Nuevo pedido", `Mesa ${mesaNumero} • ${totalARS}`, { tipo: "pedido", pedidoId, mesaId });
    }
  }

  async getMesaSince(mesaId: number): Promise<string> {
    const { data: row } = await supabase
      .from("asignaciones_mesa")
      .select("asignada_en")
      .eq("mesa_id", mesaId)
      .in("estado", ["pendiente", "asignada", "sentado"])
      .order("asignada_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (row?.asignada_en as string) ?? new Date().toISOString();
  }
}