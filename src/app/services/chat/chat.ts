import { Injectable, inject } from "@angular/core";
import { supabase } from "src/supabase.client";
import { ChatMessage } from "src/app/interfaces/chat-message";
import { Push } from "src/app/services/push/push";

type Role = "cliente" | "mozo";

export interface Chat {
  id: string;
  mesa_id: number;
  created_at: string;
}

@Injectable({ providedIn: "root" })
export class Chat {
  private channel?: ReturnType<typeof supabase.channel>;
  private push = inject(Push);

  async getMyUserId(anonimoId?: string): Promise<string> {
    if (anonimoId) return `anon-${anonimoId}`;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error("Sin sesión.");
    return data.user.id;
  }

  private async getMyDisplayName(anonimoId?: string): Promise<string> {
  try {
    if (anonimoId) {
      const { data, error } = await supabase
        .from("clientes_anonimos")
        .select("nombre")
        .eq("id", anonimoId)
        .maybeSingle();

      if (error) {
        console.warn("[ChatService] getMyDisplayName clientes_anonimos error:", error.message);
      }

      return data?.nombre?.trim() || "Cliente Anónimo";
    }

    const { data: au, error: errAuth } = await supabase.auth.getUser();
    if (errAuth || !au?.user) {
      console.warn("[ChatService] getMyDisplayName auth error:", errAuth?.message);
      return "Usuario";
    }

    const email = au.user.email ?? null;
    if (!email) return "Usuario";

    const { data, error } = await supabase
      .from("usuarios")
      .select("nombres, apellidos")
      .eq("correo_electronico", email)
      .maybeSingle();

    if (error) {
      console.warn("[ChatService] getMyDisplayName usuarios error:", error.message);
    }

    const n = (data?.nombres ?? "").trim();
    const a = (data?.apellidos ?? "").trim();
    return (n || a) ? `${n} ${a}`.trim() : "Usuario";

  } catch (err) {
    console.error("[ChatService] getMyDisplayName unexpected error:", err);
    return "Usuario";
  }
}


  private async getMyRoleInChat(chatId: string, anonimoId?: string): Promise<Role> {
    if (anonimoId) return "cliente";
    const uid = await this.getMyUserId();
    const { data } = await supabase.from("chat_participants").select("role").eq("chat_id", chatId).eq("user_id", uid).maybeSingle();
    return (data?.role as Role) || "cliente";
  }

  async bindMyPushToken(chatId: string, anonimoId?: string): Promise<void> {
    const tk = this.push.getToken?.();
    if (!tk) return;
    const uid = await this.getMyUserId(anonimoId);
    await supabase.from("chat_participants").update({ push_token: tk }).eq("chat_id", chatId).eq("user_id", uid);
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
  const { data: existing } = await supabase.from("chat_participants").select("chat_id").eq("chat_id", chat.id).eq("user_id", userId).limit(1);

  if (!existing?.length) {
    await supabase.from("chat_participants").insert({ chat_id: chat.id, user_id: userId, role });
  }

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
    const { data } = await supabase.from("chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(limit);
    return (data ?? []) as ChatMessage[];
  }

subscribeToMessages(
  chatId: string,
  onInsert: (m: ChatMessage) => void,
  sinceISO?: string
): void {
  if (this.channel) {
    const nm = (this.channel as any).name ?? "";
    if (nm === `chat:${chatId}`) return;
    supabase.removeChannel(this.channel);
  }

  this.channel = supabase
    .channel(`chat:${chatId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `chat_id=eq.${chatId}`,
      },
      (payload) => {
        const msg = payload.new as ChatMessage;
        if (sinceISO && new Date(msg.created_at) < new Date(sinceISO)) return;
        onInsert(msg);
      }
    )
    .subscribe();
}

  unsubscribe(): void {
  if (this.channel) {
    supabase.removeChannel(this.channel);
    console.log("[ChatService] Canal eliminado");
    this.channel = undefined;
  }
}

  private async getClienteTokensPreferChat(chatId: string, mesaId: number): Promise<string[]> {
    const { data: parts } = await supabase.from("chat_participants").select("user_id,push_token").eq("chat_id", chatId).eq("role", "cliente").limit(1);
    const tk = (parts?.[0]?.push_token as string | null) || null;
    if (tk) return [tk];
    const clienteUserId = parts?.[0]?.user_id as string | undefined;
    if (!clienteUserId) return [];
    const { data: toks } = await supabase.from("push_tokens").select("token").eq("usuario_id", clienteUserId).eq("active", true).eq("revoked", false);
    return (toks ?? []).map((t: any) => t.token as string);
  }

  async sendMessage(chatId: string, text: string, anonimoId?: string): Promise<ChatMessage> {
    const userId = await this.getMyUserId(anonimoId);
    console.log("[DEBUG sendMessage]", { chatId, text, userId, anonimoId });
    const role = await this.getMyRoleInChat(chatId, anonimoId);
    const fromName = await this.getMyDisplayName(anonimoId);
    const ins = await supabase.from("chat_messages").insert({ chat_id: chatId, user_id: userId, body: text }).select("*").single();
    console.log("[DEBUG insert result]", ins);
    if (ins.error) throw ins.error;
    const { data: chat } = await supabase.from("chats").select("mesa_id").eq("id", chatId).single();
    const mesaId = chat?.mesa_id as number;
    const preview = text.slice(0, 80);

    if (role === "cliente") {
      const { data } = await supabase.from("push_tokens").select("token").eq("role", "mozo").eq("active", true).eq("revoked", false);
      const to = Array.from(new Set((data ?? []).map((r: any) => r.token as string).filter(Boolean)));
      if (to.length) await this.push.send(to, `Nuevo mensaje del cliente de la mesa ${mesaId}`, text, { tipo: "chat", mesaId, chatId, fromRole: "cliente", fromName, preview });
    } else {
      const to = Array.from(new Set((await this.getClienteTokensPreferChat(chatId, mesaId)).filter(Boolean)));
      if (to.length) await this.push.send(to, "Nuevo mensaje del mozo", text, { tipo: "chat", mesaId, chatId, fromRole: "mozo", fromName, preview });
    }

    return ins.data as ChatMessage;
  }

toViewMessage(
  m: ChatMessage,
  myUserId: string
): { id: string; from: "yo" | "mozo"; role: "mozo" | "cliente"; text: string; time: string } {
  const fromMe = m.user_id === myUserId;

  const role: "mozo" | "cliente" =
    m.user_id?.startsWith("anon-") || (m.user_id && m.user_id.length < 36)
      ? "cliente"
      : "mozo";

  return {
    id: m.id,
    from: fromMe ? "yo" : "mozo",
    role,
    text: m.body,
    time: this.hhmm(new Date(m.created_at)),
  };
}



  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  async notifyMozosNuevoPedido(mesaNumero: number, totalARS: string, pedidoId: string, mesaId: number): Promise<void> {
    const { data } = await supabase.from("push_tokens").select("token").eq("role", "mozo").eq("active", true).eq("revoked", false);
    const to = Array.from(new Set((data ?? []).map((r: any) => r.token as string).filter(Boolean)));
    if (to.length) await this.push.send(to, "Nuevo pedido", `Mesa ${mesaNumero} • ${totalARS}`, { tipo: "pedido", pedidoId, mesaId });
  }

  // ✅ NUEVO: devolver el “corte” de turno de la mesa
async getMesaSince(mesaId: number): Promise<string> {
  // Usa la fecha de asignación más reciente como corte
  const { data: row } = await supabase
    .from("asignaciones_mesa")
    .select("asignada_en")
    .eq("mesa_id", mesaId)
    .in("estado", ["pendiente","asignada","sentado"])
    .order("asignada_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (row?.asignada_en as string) ?? new Date().toISOString();
}

// ✅ NUEVO: traer mensajes SOLO desde el corte
async loadMessagesSince(chatId: string, sinceISO: string, limit = 200): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("chat_id", chatId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as ChatMessage[];
}



}