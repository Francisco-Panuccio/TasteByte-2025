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
    if (anonimoId) {
      const { data } = await supabase.from("clientes_anonimos").select("nombre").eq("id", anonimoId).single();
      return data?.nombre || "Cliente Anónimo";
    }
    const id = await this.getMyUserId();
    const { data } = await supabase.from("usuarios").select("nombres, apellidos").eq("id", id).single();
    const n = (data?.nombres ?? "").trim();
    const a = (data?.apellidos ?? "").trim();
    return (n || a) ? `${n} ${a}`.trim() : "Usuario";
  }

  async getOrCreateForMesa(mesaId: number, role: Role = "cliente"): Promise<Chat> {
    let { data: chats } = await supabase.from("chats").select("*").eq("mesa_id", mesaId).limit(1);
    let chat: Chat | null = chats?.[0] ?? null;
    if (!chat) {
      const ins = await supabase.from("chats").insert({ mesa_id: mesaId }).select("*").single();
      if (ins.error) throw ins.error;
      chat = ins.data as Chat;
    }
    const userId = await this.getMyUserId();
    const part = await supabase.from("chat_participants").select("*").eq("chat_id", chat.id).eq("user_id", userId).limit(1);
    if (part.error) throw part.error;
    if (!part.data?.length) {
      const insPart = await supabase.from("chat_participants").insert({ chat_id: chat.id, user_id: userId, role });
      if (insPart.error) throw insPart.error;
    }
    return chat;
  }

  async listByClient(userId?: string): Promise<Chat[]> {
    const uid = userId || (await this.getMyUserId());
    const { data: cps, error } = await supabase.from("chat_participants").select("chat_id").eq("user_id", uid);
    if (error) throw error;
    const ids = (cps ?? []).map((r: any) => r.chat_id);
    if (!ids.length) return [];
    const { data: chats, error: e2 } = await supabase.from("chats").select("*").in("id", ids).order("created_at", { ascending: false });
    if (e2) throw e2;
    return (chats ?? []) as Chat[];
  }

  async loadMessages(chatId: string, limit = 200): Promise<ChatMessage[]> {
    const { data, error } = await supabase.from("chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(limit);
    if (error) throw error;
    return (data ?? []) as ChatMessage[];
  }

  subscribeToMessages(chatId: string, onInsert: (m: ChatMessage) => void): void {
    this.unsubscribe();
    this.channel = supabase
      .channel(`chat:${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => onInsert(payload.new as ChatMessage))
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = undefined;
    }
  }

  async sendMessage(chatId: string, text: string, anonimoId?: string): Promise<ChatMessage> {
    const myUserId = await this.getMyUserId(anonimoId);
    const fromName = await this.getMyDisplayName(anonimoId);
    const { data: pr } = await supabase.from("chat_participants").select("role").eq("chat_id", chatId).eq("user_id", myUserId).maybeSingle();
    const role: Role = pr?.role === "mozo" ? "mozo" : "cliente";

    const { data, error } = await supabase.from("chat_messages").insert({ chat_id: chatId, user_id: myUserId, body: text }).select("*").single();
    if (error) throw error;

    const { data: c } = await supabase.from("chats").select("mesa_id").eq("id", chatId).single();
    const mesaId = c?.mesa_id as number;
    const preview = text.slice(0, 80);

    try {
      if (role === "cliente") {
        const mozoTokens = await this.getMozosTokens();
        const uniq = Array.from(new Set(mozoTokens));
        if (uniq.length) {
          await this.push.send(uniq, `Nuevo mensaje del cliente de la mesa ${mesaId}`, text, { tipo: "chat", mesaId, chatId, fromRole: "cliente", fromName, preview });
        }
      } else {
        let to = await this.getClienteTokenByMesa(mesaId);
        if (!to.length) {
          const { data: ped } = await supabase.from("pedidos").select("cliente_uid").eq("mesa_id", mesaId).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (ped?.cliente_uid) {
            const { data: toks } = await supabase.from("push_tokens").select("token").eq("usuario_id", ped.cliente_uid).eq("active", true).eq("revoked", false);
            to = (toks ?? []).map((t: any) => t.token as string);
          }
        }
        const uniq = Array.from(new Set(to));
        if (uniq.length) {
          await this.push.send(uniq, "Nuevo mensaje del mozo", text, { tipo: "chat", mesaId, chatId, fromRole: "mozo", fromName, preview });
        }
      }
    } catch { }

    return data as ChatMessage;
  }

  toViewMessage(m: ChatMessage, myUserId: string): { id: string; from: "yo" | "mozo"; text: string; time: string } {
    return { id: m.id, from: m.user_id === myUserId ? "yo" : "mozo", text: m.body, time: this.hhmm(new Date(m.created_at)) };
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  async getMozosTokens(): Promise<string[]> {
    const { data } = await supabase.from("push_tokens").select("token").eq("role", "mozo").eq("active", true).eq("revoked", false);
    return (data ?? []).map((r: any) => r.token as string);
  }

  async getClienteTokenByMesa(mesaId: number): Promise<string[]> {
    const { data: chats } = await supabase.from("chats").select("id").eq("mesa_id", mesaId).limit(1);
    if (!chats?.length) return [];
    const chatId = chats[0].id as string;
    const { data: parts } = await supabase.from("chat_participants").select("user_id").eq("chat_id", chatId).eq("role", "cliente").limit(1);
    if (!parts?.length) return [];
    const clienteId = parts[0].user_id as string;
    const { data: toks } = await supabase.from("push_tokens").select("token").eq("usuario_id", clienteId).eq("active", true).eq("revoked", false);
    return (toks ?? []).map((t: any) => t.token as string);
  }

  async notifyMozosNuevoPedido(mesaNumero: number, totalARS: string, pedidoId: string, mesaId: number): Promise<void> {
    const tokens = await this.getMozosTokens();
    const uniq = Array.from(new Set(tokens));
    if (uniq.length) {
      await this.push.send(uniq, "Nuevo pedido", `Mesa ${mesaNumero} • ${totalARS}`, { tipo: "pedido", pedidoId, mesaId });
    }
  }
}