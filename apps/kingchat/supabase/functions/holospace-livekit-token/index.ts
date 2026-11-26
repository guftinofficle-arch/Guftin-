import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.19.2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
  const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!url||!key||!jwt)return json({error:"Authentication service is not configured."},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+jwt}}});
  const {data:{user},error:userError}=await db.auth.getUser(jwt);
  if(userError||!user)return json({error:"A valid signed-in account is required."},401);
  let body:any;try{body=await req.json();}catch{return json({error:"A JSON body is required."},400);}
  const roomId=typeof body?.room_id==="string"?body.room_id:"";
  if(!uuid.test(roomId))return json({error:"A valid room_id is required."},400);
  const {data:member,error:memberError}=await db.from("holospace_members").select("role,invitation_status").eq("room_id",roomId).eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.invitation_status!=="active")return json({error:"You are not an active member of this HoloSpace."},403);
  const rawUrl=Deno.env.get("LIVEKIT_URL")||Deno.env.get("LIVEKIT_WEBSOCKET_URL")||"";
  const apiKey=Deno.env.get("LIVEKIT_API_KEY")||"";
  const apiSecret=Deno.env.get("LIVEKIT_API_SECRET")||"";
  if(!rawUrl||!apiKey||!apiSecret)return json({error:"LiveKit server secrets are not configured. Configure LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Supabase Edge Function secrets."},503);
  let serverUrl:string;
  try{
    const normalized=rawUrl.replace(/^https:\/\//i,"wss://").replace(/\/+$/,"");
    const parsed=new URL(normalized);if(parsed.protocol!=="wss:"||!parsed.host)throw new Error();
    serverUrl=parsed.toString().replace(/\/+$/,"");
  }catch{return json({error:"LIVEKIT_URL must be a valid wss:// URL."},503);}
  try{
    const token=new AccessToken(apiKey,apiSecret,{identity:user.id,name:"HoloSpace member",ttl:"10m"});
    token.addGrant({roomJoin:true,room:"holospace-"+roomId,canPublish:true,canSubscribe:true});
    return json({server_url:serverUrl,participant_token:await token.toJwt(),room_name:"holospace-"+roomId},201);
  }catch{return json({error:"Could not create a HoloSpace voice token."},500);}
});
