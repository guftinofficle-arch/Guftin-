import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function getPublishableKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch { return null; }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 20000) return json({ error: "Request is too large." }, 413);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Please sign in to use King AI." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = getPublishableKey();
    if (!supabaseUrl || !publishableKey) return json({ error: "Supabase server configuration is incomplete." }, 500);
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Session expired. Please sign in again." }, 401);
    let body: { action?: unknown; message?: unknown; chatId?: unknown; mode?: unknown };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (body.action === "list_chats") {
      const { data: chats, error: chatsError } = await supabase.from("chats")
        .select("id,title,updated_at,messages(count)")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
      if (chatsError) return json({ error: "Could not load chat history." }, 500);
      return json({ chats: (chats ?? []).map((chat: any) => ({
        id: chat.id, title: chat.title || "New chat", updated_at: chat.updated_at,
        message_count: Number(chat.messages?.[0]?.count ?? 0),
      })) });
    }
    if (body.action === "load_chat") {
      if (typeof body.chatId !== "string" || !body.chatId) return json({ error: "Chat ID is required." }, 400);
      const { data: chat, error: chatError } = await supabase.from("chats").select("id")
        .eq("id", body.chatId).eq("user_id", user.id).maybeSingle();
      if (chatError) return json({ error: "Could not load this chat." }, 500);
      if (!chat) return json({ error: "Chat not found." }, 404);
      const { data: saved, error: savedError } = await supabase.from("messages")
        .select("role,content").eq("chat_id", body.chatId).eq("user_id", user.id)
        .order("created_at", { ascending: true }).limit(200);
      if (savedError) return json({ error: "Could not load this chat." }, 500);
      return json({ chatId: body.chatId, messages: saved ?? [] });
    }
    if (body.action === "delete_chat") {
      if (typeof body.chatId !== "string" || !body.chatId) return json({ error: "Chat ID is required." }, 400);
      const { data: chat, error: chatError } = await supabase.from("chats").select("id")
        .eq("id", body.chatId).eq("user_id", user.id).maybeSingle();
      if (chatError) return json({ error: "Could not verify chat ownership." }, 500);
      if (!chat) return json({ error: "Chat not found." }, 404);
      const { error: messagesError } = await supabase.from("messages").delete()
        .eq("chat_id", body.chatId).eq("user_id", user.id);
      if (messagesError) return json({ error: "Could not delete chat messages." }, 500);
      const { error: deleteError } = await supabase.from("chats").delete()
        .eq("id", body.chatId).eq("user_id", user.id);
      if (deleteError) return json({ error: "Messages were deleted, but the chat could not be removed." }, 500);
      return json({ success: true });
    }
    if (body.action === "delete_all_chats") {
      const { error: messagesError } = await supabase.from("messages").delete().eq("user_id", user.id);
      if (messagesError) return json({ error: "Could not clear chat messages." }, 500);
      const { error: chatsError } = await supabase.from("chats").delete().eq("user_id", user.id);
      if (chatsError) return json({ error: "Messages were deleted, but chat records could not be removed." }, 500);
      return json({ success: true });
    }
    if (body.action === "resume_latest") {
      const { data: chats, error: chatsError } = await supabase.from("chats")
        .select("id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1);
      if (chatsError) return json({ error: "Could not load chat history." }, 500);
      if (!chats || chats.length === 0) return json({ chatId: null, messages: [] });
      const latestChatId = chats[0].id;
      const { data: saved, error: savedError } = await supabase.from("messages")
        .select("role,content").eq("chat_id", latestChatId).eq("user_id", user.id)
        .order("created_at", { ascending: true }).limit(40);
      if (savedError) return json({ error: "Could not load chat history." }, 500);
      return json({ chatId: latestChatId, messages: saved ?? [] });
    }
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Gemini is not configured yet. Add GEMINI_API_KEY to Supabase Edge Function secrets." }, 503);
    if (typeof body.message !== "string") return json({ error: "Message must be text." }, 400);
    const message = body.message.trim();
    if (!message) return json({ error: "Please enter a message." }, 400);
    if (message.length > 8000) return json({ error: "Message is too long (maximum 8,000 characters)." }, 413);
    let chatId: string;
    if (typeof body.chatId === "string" && body.chatId.length > 0) {
      const { data: chat, error: chatError } = await supabase.from("chats").select("id")
        .eq("id", body.chatId).eq("user_id", user.id).maybeSingle();
      if (chatError) return json({ error: "Could not load this chat." }, 500);
      if (!chat) return json({ error: "Chat not found." }, 404);
      chatId = chat.id;
    } else {
      const title = message.replace(/\s+/g, " ").slice(0, 72) || "New chat";
      const { data: chat, error: createError } = await supabase.from("chats")
        .insert({ user_id: user.id, title }).select("id").single();
      if (createError || !chat) return json({ error: "Could not create chat history." }, 500);
      chatId = chat.id;
    }
    const { data: priorMessages, error: historyError } = await supabase.from("messages")
      .select("role,content").eq("chat_id", chatId).eq("user_id", user.id)
      .order("created_at", { ascending: true }).limit(20);
    if (historyError) return json({ error: "Could not load chat history." }, 500);
    const contents = (priorMessages ?? []).slice(-12).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }],
    }));
    contents.push({ role: "user", parts: [{ text: message }] });
    const allowedModes = ["chat", "write", "translate", "summarize", "reply"];
    const mode = typeof body.mode === "string" && allowedModes.includes(body.mode) ? body.mode : "chat";
    const modeGuidance: Record<string, string> = {
      chat: "Answer questions clearly and helpfully. Match the user's language.",
      write: "Act as a writing assistant. Draft, rewrite, or polish the message the user requests. Preserve their intended meaning and requested tone. Never send a message on the user's behalf.",
      translate: "Translate the user's text accurately while preserving meaning and tone. If the target language is not clear, ask which language they want.",
      summarize: "Summarize the supplied text or conversation accurately and concisely. Do not add information that is not present.",
      reply: "Help the user respond to a message or situation. Suggest three natural reply options with different tones. Never send a reply on the user's behalf."
    };
    const upstream = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are King AI inside Guftin, a helpful and honest multilingual assistant. Respond naturally in the user's language, including Urdu, Roman Urdu, Hindi, or English. Do not invent facts; clearly state uncertainty. Keep answers useful and respectful. " + modeGuidance[mode] }] },
          contents, generationConfig: { maxOutputTokens: 800, thinkingConfig: { thinkingLevel: "LOW" } },
        }),
        signal: AbortSignal.timeout(55000),
      },
    );
    const providerData = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      if (upstream.status === 429) return json({ error: "Gemini free-tier limit reached. Please wait and try again." }, 429);
      console.error("Gemini provider error status:", upstream.status);
      return json({ error: upstream.status === 400 ? "Gemini rejected the request. Please try a shorter message." : "Gemini service is temporarily unavailable." }, 502);
    }
    const replyText = providerData?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "").join("").trim();
    if (!replyText) return json({ error: "Gemini returned an empty response. Please try again." }, 502);
    const { error: saveError } = await supabase.from("messages").insert([
      { chat_id: chatId, user_id: user.id, role: "user", content: message },
      { chat_id: chatId, user_id: user.id, role: "assistant", content: replyText },
    ]);
    if (saveError) {
      console.error("Chat history save failed:", saveError.message);
      return json({ error: "Reply generated, but chat history could not be saved." }, 500);
    }
    await supabase.from("chats").update({ updated_at: new Date().toISOString() })
      .eq("id", chatId).eq("user_id", user.id);
    return json({ reply: replyText, chatId });
  } catch (error) {
    console.error("ai-chat request failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Temporary server error. Please try again." }, 500);
  }
});
