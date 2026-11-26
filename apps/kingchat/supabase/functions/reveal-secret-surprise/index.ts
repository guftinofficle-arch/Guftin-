import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!anon||!service)return json({error:"Server configuration is incomplete"},503);
 const auth=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const token=auth.replace(/^Bearer\s+/i,"");
 const {data:{user},error:userError}=await userClient.auth.getUser(token);
 if(userError||!user)return json({error:"Authentication required"},401);
 let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
 const momentId=String(body?.moment_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(momentId))return json({error:"Invalid moment id"},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:moment,error}=await admin.from("magic_moments").select("id,creator_id,kind,recipient_id,reveal_at,status").eq("id",momentId).maybeSingle();
 if(error)return json({error:"Could not load moment"},500);
 if(!moment)return json({error:"Moment not found"},404);
 if(moment.creator_id!==user.id)return json({error:"Only the creator can reveal this moment"},403);
 if(!["secret_surprise","birthday"].includes(moment.kind))return json({error:"This moment does not use a reveal flow"},400);
 if(!moment.reveal_at||new Date(moment.reveal_at).getTime()>Date.now())return json({error:"The scheduled reveal time has not arrived"},409);
 if(moment.status==="revealed")return json({revealed:true,already_revealed:true});
 const now=new Date().toISOString();
 const {data:updated,error:updateError}=await admin.from("magic_moments").update({status:"revealed",revealed_at:now,updated_at:now}).eq("id",momentId).neq("status","revealed").select("id").maybeSingle();
 if(updateError)return json({error:"Could not reveal moment"},500);
 if(updated){
  const {data:members}=await admin.from("magic_moment_members").select("user_id").eq("moment_id",momentId);
  const recipients=[...new Set([moment.recipient_id,...(members||[]).map((m:any)=>m.user_id)].filter(Boolean))];
  if(recipients.length)await admin.from("magic_moment_notifications").insert(recipients.map(recipient_id=>({recipient_id,moment_id:momentId,notification_type:"reveal",title:"A Magic Moment is ready",body:"Open Guftin to see the moment shared with you.",safe_payload:{moment_id:momentId}})));
 }
 return json({revealed:true});
});
