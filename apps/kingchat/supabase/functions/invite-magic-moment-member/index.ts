import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!anon||!service)return json({error:"Server configuration is incomplete"},503);
 const auth=req.headers.get("Authorization")||"",token=auth.replace(/^Bearer\s+/i,"");
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:userError}=await userClient.auth.getUser(token);
 if(userError||!user)return json({error:"Authentication required"},401);
 let body:any;try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
 const momentId=String(body?.moment_id||""),targetId=String(body?.user_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(momentId)||!/^[0-9a-f-]{36}$/i.test(targetId))return json({error:"Invalid identifiers"},400);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:moment,error}=await admin.from("magic_moments").select("id,creator_id,kind").eq("id",momentId).maybeSingle();
 if(error||!moment)return json({error:"Moment not found"},404);
 if(moment.creator_id!==user.id)return json({error:"Only the creator can invite members"},403);
 const {data:member}=await admin.from("magic_moment_members").select("id,role").eq("moment_id",momentId).eq("user_id",targetId).maybeSingle();
 if(!member)return json({error:"Create the invitation membership first"},409);
 const title=member.role==="recipient"?"You have a private surprise":"You were invited to a Magic Moment";
 const bodyText="Open Guftin to accept the invitation and view shared memories.";
 const {error:notifyError}=await admin.from("magic_moment_notifications").insert({recipient_id:targetId,moment_id:momentId,notification_type:"invite",title,body:bodyText,safe_payload:{moment_id:momentId}});
 if(notifyError)return json({error:"Invitation notification could not be saved"},500);
 try {
  const pushResponse=await fetch(url+"/functions/v1/guftin-push",{
   method:"POST",
   headers:{"Authorization":auth,"apikey":anon,"Content-Type":"application/json"},
   body:JSON.stringify({kind:"magic_moment",moment_id:momentId,notification_type:"invite",recipient_id:targetId})
  });
  if(!pushResponse.ok)console.warn("Magic Moment invite push returned",pushResponse.status);
 } catch(pushError) { console.warn("Magic Moment invite push unavailable",String(pushError)); }
 return json({ok:true});
});
