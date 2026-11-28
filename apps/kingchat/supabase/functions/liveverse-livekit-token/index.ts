import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.19.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const env = (names: string[]) => {
  for (const name of names) {
    const value = (Deno.env.get(name) || "").trim();
    if (value) return value;
  }
  return "";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let publishableKey = env(["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"]);
  if (!publishableKey) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      publishableKey = typeof keys.default === "string" ? keys.default : "";
    } catch { /* optional key map */ }
  }
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!supabaseUrl || !publishableKey || !jwt) return json({ error: "Authentication service is not configured." }, 503);

  const db = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + jwt } },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(jwt);
  if (authError || !user) return json({ error: "A valid signed-in account is required." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "A JSON body is required." }, 400); }
  const spaceId = typeof body?.space_id === "string" ? body.space_id : "";
  if (!uuid.test(spaceId)) return json({ error: "A valid space_id is required." }, 400);

  const { data: room, error: roomError } = await db.from("liveverse_voice_rooms")
    .select("space_id,source_chat_id,status,host_id")
    .eq("space_id", spaceId).eq("status", "active").maybeSingle();
  if (roomError || !room) return json({ error: "This LIVEVERSE room is no longer active." }, 404);

  const { data: member, error: memberError } = await db.from("liveverse_members")
    .select("role").eq("space_id", spaceId).eq("user_id", user.id).maybeSingle();
  if (memberError || !member) return json({ error: "You are not a member of this LIVEVERSE room." }, 403);

  const rawUrl = env(["LIVEKIT_URL", "LIVEKIT_WEBSOCKET_URL", "WEBSOCKET_URL", "Websocket URL", "WebSocket URL"]);
  const apiKey = env(["LIVEKIT_API_KEY", "LIVEKIT_KEY", "API_KEY", "API key", "API KEY"]);
  const apiSecret = env(["LIVEKIT_API_SECRET", "LIVEKIT_SECRET", "API_SECRET", "API secret", "API SECRET"]);
  if (!rawUrl || !apiKey || !apiSecret) {
    return json({ error: "Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Supabase Edge Function secrets." }, 503);
  }

  let serverUrl: string;
  try {
    const parsed = new URL(rawUrl.replace(/^https:\/\//i, "wss://").replace(/\/+$/, ""));
    if (parsed.protocol !== "wss:" || !parsed.host) throw new Error("invalid");
    serverUrl = parsed.toString().replace(/\/+$/, "");
  } catch { return json({ error: "LIVEKIT_URL must be a valid wss:// URL." }, 503); }

  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id, name: "Guftin LIVEVERSE member", ttl: "10m",
    });
    token.addGrant({
      roomJoin: true, room: "liveverse-" + spaceId,
      canPublish: true, canSubscribe: true,
    });
    return json({
      server_url: serverUrl,
      participant_token: await token.toJwt(),
      room_name: "liveverse-" + spaceId,
      space_id: spaceId,
      role: member.role,
    }, 201);
  } catch {
    return json({ error: "Could not create a LIVEVERSE voice token." }, 500);
  }
});
