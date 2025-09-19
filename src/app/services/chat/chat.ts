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

  async getMyUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error("Sin sesión.");
    return data.user.id;
  }

  private async getMyRole(): Promise<Role> {
    const id = await this.getMyUserId();
    const { data } = await supabase.from("usuarios").select("perfil").eq("id", id).single();
    return data?.perfil === "mozo" ? "mozo" : "cliente";
  }

  private async getMyDisplayName(): Promise<string> {
    const id = await this.getMyUserId();
    const { data } = await supabase.from("usuarios").select("nombres, apellidos").eq("id", id).single();
    const n = (data?.nombres ?? "").trim();
    const a = (data?.apellidos ?? "").trim();
    return (n || a) ? `${n} ${a}`.trim() : "Usuario";
  }

  async getOrCreateForMesa(mesaId: number, role: Role = "cliente"): Promise<Chat> {
    let { data: chats, error } = await supabase.from("chats").select("*").eq("mesa_id", mesaId).limit(1);
    if (error) throw error;

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
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ChatMessage[];
  }

  subscribeToMessages(chatId: string, onInsert: (m: ChatMessage) => void): void {
    this.unsubscribe();
    this.channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => onInsert(payload.new as ChatMessage)
      )
      .subscribe();
  }

  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = undefined;
    }
  }

  async sendMessage(chatId: string, text: string): Promise<ChatMessage> {
    const userId = await this.getMyUserId();
    const role = await this.getMyRole();
    const fromName = await this.getMyDisplayName();

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ chat_id: chatId, user_id: userId, body: text })
      .select("*")
      .single();
    if (error) throw error;

    const chat = await supabase.from("chats").select("mesa_id").eq("id", chatId).single();
    const mesaId = chat.data?.mesa_id as number;

    try {
      const preview = text.slice(0, 80);
      if (role === "cliente") {
        const tokens = await this.getMozosTokens();
        if (tokens.length) {
          await this.push.send(tokens, "Consulta al mozo", `Mesa ${mesaId}: ${text}`, {
            tipo: "chat",
            mesaId,
            chatId,
            fromRole: "cliente",
            fromName,
            preview
          });
        } else if ((this.push as any).sendToTopic) {
          await (this.push as any).sendToTopic("mozos", "Consulta al mozo", `Mesa ${mesaId}: ${text}`, {
            tipo: "chat",
            mesaId,
            chatId,
            fromRole: "cliente",
            fromName,
            preview
          });
        }
      } else {
        const tokens = await this.getClienteTokenByMesa(mesaId);
        if (tokens.length) {
          await this.push.send(tokens, "Respuesta del mozo", text, {
            tipo: "chat",
            mesaId,
            chatId,
            fromRole: "mozo",
            fromName,
            preview
          });
        }
      }
    } catch (e) {
      console.warn("[chat][push][error]", e);
    }

    return data as ChatMessage;
  }

  toViewMessage(m: ChatMessage, myUserId: string): { id: string; from: "yo" | "mozo"; text: string; time: string } {
    return {
      id: m.id,
      from: m.user_id === myUserId ? "yo" : "mozo",
      text: m.body,
      time: this.hhmm(new Date(m.created_at))
    };
  }

  private hhmm(d: Date): string {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  async getMozosTokens(): Promise<string[]> {
    const { data, error } = await supabase
      .from("push_tokens")
      .select("token, usuarios!inner(perfil)")
      .eq("active", true)
      .eq("revoked", false)
      .eq("usuarios.perfil", "mozo");
    if (error || !data?.length) return [];
    return data.map((r: any) => r.token as string);
  }

  async getClienteTokenByMesa(mesaId: number): Promise<string[]> {
    const { data: chats, error: e1 } = await supabase.from("chats").select("id").eq("mesa_id", mesaId).limit(1);
    if (e1 || !chats?.length) return [];

    const chatId = chats[0].id as string;

    const { data: parts, error: e2 } = await supabase
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("role", "cliente")
      .limit(1);
    if (e2 || !parts?.length) return [];

    const clienteId = parts[0].user_id as string;

    const { data: toks, error: e3 } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("usuario_id", clienteId)
      .eq("active", true)
      .eq("revoked", false);
    if (e3 || !toks?.length) return [];
    return toks.map((t: any) => t.token as string);
  }

  async notifyMozosNuevoPedido(mesaNumero: number, totalARS: string, pedidoId: string, mesaId: number): Promise<void> {
    const tokens = await this.getMozosTokens();
    if (tokens.length) {
      await this.push.send(tokens, "Nuevo pedido", `Mesa ${mesaNumero} • ${totalARS}`, {
        tipo: "pedido",
        pedidoId,
        mesaId
      });
    } else if ((this.push as any).sendToTopic) {
      await (this.push as any).sendToTopic("mozos", "Nuevo pedido", `Mesa ${mesaNumero} • ${totalARS}`, {
        tipo: "pedido",
        pedidoId,
        mesaId
      });
    }
  }
}