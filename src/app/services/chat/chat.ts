// src/app/services/chat/chat.ts
import { Injectable } from "@angular/core";
import { supabase } from "src/supabase.client";
import { ChatMessage } from "src/app/interfaces/chat-message";

type Role = "cliente" | "mozo";

export interface Chat {
  id: string;
  mesa_id: number;
  created_at: string;
}

@Injectable({ providedIn: "root" })
export class Chat {
  private channel?: ReturnType<typeof supabase.channel>;

  async getMyUserId(): Promise<string> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id) throw new Error("Sin sesión.");
    return data.user.id;
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
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ chat_id: chatId, user_id: userId, body: text })
      .select("*")
      .single();
    if (error) throw error;
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
}