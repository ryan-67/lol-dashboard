import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
}

export interface ConversationContext {
  conversationId: string;
  history: ChatMessage[];
}

function titleFromMessage(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  return clean.slice(0, 30) || "new chat";
}

export async function resolveConversation(
  client: SupabaseClient,
  userId: string,
  message: string,
  conversationId?: string,
): Promise<ConversationContext> {
  let id = conversationId;

  if (!id) {
    const { data, error } = await client
      .from("conversations")
      .insert({ user_id: userId, title: titleFromMessage(message) })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create conversation: ${error?.message ?? "unknown"}`);
    }
    id = data.id as string;
  }

  const { data: historyRows, error: historyError } = await client
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (historyError) {
    throw new Error(`Failed to load conversation history: ${historyError.message}`);
  }

  const history = [...(historyRows ?? [])]
    .reverse()
    .map((row) => ({ role: row.role as ChatMessage["role"], content: String(row.content ?? "") }));

  return { conversationId: id, history };
}

export async function persistMessages(
  client: SupabaseClient,
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const payload = [
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: userMessage,
    },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: assistantMessage,
    },
  ];

  const { error } = await client.from("messages").insert(payload);
  if (error) {
    throw new Error(`Failed to persist chat messages: ${error.message}`);
  }
}