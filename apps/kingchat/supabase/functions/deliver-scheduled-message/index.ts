import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return json({error:"Server configuration is incomplete"},503);
 // This worker is cron-only. The service-role bearer must be stored in Supabase Vault, never in the app.
 if(req.headers.get("Authorization")!==`Bearer ${service}`)return json({error:"Forbidden"},403);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const now=new Date().toISOString();
 const {data:due,error}=await admin.from("scheduled_messages").select("*").eq("status","pending").lte("scheduled_at",now).order("scheduled_at").limit(100);
 if(error)return json({error:"Could not load due messages"},500);
 let sent=0,failed=0,skipped=0;
 for(const row of due||[]){
  const {data:claimed,error:claimError}=await admin.from("scheduled_messages").update({status:"processing",attempts:(row.attempts||0)+1,updated_at:now}).eq("id",row.id).eq("status","pending").lte("scheduled_at",now).select("*").maybeSingle();
  if(claimError||!claimed){skipped++;continue;}
  try{
   if(typeof claimed.content!=="string"||!claimed.content.startsWith("KC-E2EE1:"))throw new Error("Scheduled payload is not a valid end-to-end encrypted message.");
   const {data:members,error:memberError}=await admin.from("kc_conversation_members").select("user_id").eq("conversation_id",claimed.conversation_id);
   if(memberError)throw memberError;
   const ids=new Set((members||[]).map((m:any)=>m.user_id));
   if(!ids.has(claimed.sender_id)||!ids.has(claimed.recipient_id))throw new Error("Sender or recipient is no longer a member of this conversation.");
   const {error:insertError}=await admin.from("kc_messages").insert({id:claimed.id,conversation_id:claimed.conversation_id,sender_id:claimed.sender_id,body:claimed.content,message_type:"text"});
   if(insertError&&insertError.code!=="23505")throw insertError;
   if(insertError?.code==="23505"){
    const {data:existing,error:existingError}=await admin.from("kc_messages").select("id,sender_id,conversation_id").eq("id",claimed.id).maybeSingle();
    if(existingError||!existing||existing.sender_id!==claimed.sender_id||existing.conversation_id!==claimed.conversation_id)throw new Error("Idempotency check failed for scheduled message.");
   }
   await admin.from("scheduled_messages").update({status:"sent",delivered_at:now,updated_at:now,last_error:null}).eq("id",claimed.id);
   await admin.from("magic_moment_notifications").insert({recipient_id:claimed.recipient_id,scheduled_message_id:claimed.id,notification_type:"scheduled_delivery",title:"A scheduled message has arrived",body:"Open Guftin to read your message.",safe_payload:{conversation_id:claimed.conversation_id}});
   sent++;
  }catch(error){
   const message=String((error as Error)?.message||error).slice(0,500);
   await admin.from("scheduled_messages").update({status:"failed",last_error:message,updated_at:now}).eq("id",claimed.id);
   failed++;
  }
 }
 return json({ok:true,checked:due?.length||0,sent,failed,skipped,server_time:now});
});
