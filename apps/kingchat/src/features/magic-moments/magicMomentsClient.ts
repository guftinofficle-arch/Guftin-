import type { SupabaseClient } from '@supabase/supabase-js';

export type MagicMomentKind = 'birthday'|'capsule'|'future_message'|'secret_surprise'|'together'|'anniversary';
export type MagicMoment = {
  id:string; creator_id:string; kind:MagicMomentKind; title:string; description:string;
  conversation_id:string|null; recipient_id:string|null; reveal_at:string|null; scheduled_at:string|null;
  timezone:string; status:string; cover_object_path:string|null; settings:Record<string,unknown>;
  created_at:string; updated_at:string; revealed_at:string|null; scheduled_message_id?:string|null;
};
export type MagicMomentItem = {
  id:string; moment_id:string; author_id:string; item_type:'text'|'image'|'video'|'audio'|'voice_note'|'card';
  body:string; object_path:string|null; mime_type:string|null; byte_size:number; metadata:Record<string,unknown>;
  created_at:string; signedUrl?:string|null;
};

const MAX_UPLOAD_BYTES=50*1024*1024;
const MIME_ALLOWED=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/webm']);

export function createMagicMomentsClient(supabase:SupabaseClient){
 return {
  async list(userId:string){
   const {data,error}=await supabase.from('magic_moments').select('*').order('updated_at',{ascending:false}).limit(100);
   if(error)throw error; return (data||[]) as MagicMoment[];
  },
  async create(input:{creatorId:string;kind:MagicMomentKind;title:string;description?:string;conversationId?:string|null;recipientId?:string|null;revealAt?:string|null;scheduledAt?:string|null;timezone?:string;settings?:Record<string,unknown>}){
   const {data,error}=await supabase.from('magic_moments').insert({
    creator_id:input.creatorId,kind:input.kind,title:input.title.trim(),description:input.description||'',
    conversation_id:input.conversationId||null,recipient_id:input.recipientId||null,reveal_at:input.revealAt||null,
    scheduled_at:input.scheduledAt||null,timezone:input.timezone||'UTC',settings:input.settings||{},status:(input.scheduledAt||input.revealAt)?'scheduled':'draft'
   }).select('*').single();
   if(error)throw error;
   // The database trigger creates the creator's accepted owner membership atomically.
   return data as MagicMoment;
  },
  async invite(momentId:string,userId:string,inviterId:string,role:'contributor'|'recipient'|'viewer'='contributor'){
   const {data:existing,error:lookupError}=await supabase.from('magic_moment_members').select('id,accepted_at,role').eq('moment_id',momentId).eq('user_id',userId).maybeSingle();
   if(lookupError)throw lookupError;
   if(existing)return existing;
   const {data,error}=await supabase.from('magic_moment_members').insert({moment_id:momentId,user_id:userId,role,invited_by:inviterId}).select('*').single();
   if(error)throw error;
   const {error:notifyError}=await supabase.functions.invoke('invite-magic-moment-member',{body:{moment_id:momentId,user_id:userId}});
   if(notifyError)throw notifyError;
   return data;
  },
  async acceptInvite(momentId:string){
   const {data:member,error:lookupError}=await supabase.from('magic_moment_members').select('id,role,accepted_at').eq('moment_id',momentId).eq('user_id',(await supabase.auth.getUser()).data.user?.id||'').maybeSingle();
   if(lookupError)throw lookupError;
   if(!member)throw new Error('You are not invited to this Magic Moment.');
   if(member.role==='owner'||member.accepted_at)return member;
   const {data,error}=await supabase.from('magic_moment_members').update({accepted_at:new Date().toISOString()}).eq('id',member.id).select('*').single();
   if(error)throw error; return data;
  },
  async members(momentId:string){
   const {data,error}=await supabase.from('magic_moment_members').select('*').eq('moment_id',momentId).order('created_at');
   if(error)throw error;return data||[];
  },
  async addText(momentId:string,authorId:string,body:string){
   const {data,error}=await supabase.from('magic_moment_items').insert({moment_id:momentId,author_id:authorId,item_type:'text',body}).select('*').single();
   if(error)throw error;return data as MagicMomentItem;
  },
  async listItems(momentId:string){
   const {data,error}=await supabase.from('magic_moment_items').select('*').eq('moment_id',momentId).order('created_at',{ascending:true}).limit(300);
   if(error)throw error;return (data||[]) as MagicMomentItem[];
  },
  async upload(input:{momentId:string;authorId:string;fileName:string;mimeType:string;body:Blob;bytes:number;itemType:'image'|'video'|'audio'|'voice_note'}){
   if(!MIME_ALLOWED.has(input.mimeType))throw new Error('This media type is not supported.');
   if(input.bytes<=0||input.bytes>MAX_UPLOAD_BYTES)throw new Error('Media must be smaller than 50 MB.');
   const safeName=input.fileName.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'upload';
   const path=input.momentId+'/'+crypto.randomUUID()+'-'+safeName;
   const {error:uploadError}=await supabase.storage.from('magic-moments').upload(path,input.body,{contentType:input.mimeType,upsert:false});
   if(uploadError)throw uploadError;
   const {data,error}=await supabase.from('magic_moment_items').insert({moment_id:input.momentId,author_id:input.authorId,item_type:input.itemType,object_path:path,mime_type:input.mimeType,byte_size:input.bytes}).select('*').single();
   if(error){await supabase.storage.from('magic-moments').remove([path]);throw error;}
   const {data:signed,error:signedError}=await supabase.storage.from('magic-moments').createSignedUrl(path,300);
   if(signedError)throw signedError;
   return {...data,signedUrl:signed.signedUrl} as MagicMomentItem;
  },
  async signedUrl(path:string){
   const {data,error}=await supabase.storage.from('magic-moments').createSignedUrl(path,300);
   if(error)throw error;return data.signedUrl;
  },
  async comment(momentId:string,authorId:string,body:string){
   const {data,error}=await supabase.from('magic_moment_comments').insert({moment_id:momentId,author_id:authorId,body}).select('*').single();
   if(error)throw error;return data;
  },
  async comments(momentId:string){
   const {data,error}=await supabase.from('magic_moment_comments').select('*').eq('moment_id',momentId).order('created_at');
   if(error)throw error;return data||[];
  },
  async react(momentId:string,itemId:string|null,userId:string,reaction:string){
   const {data,error}=await supabase.from('magic_moment_reactions').upsert({moment_id:momentId,item_id:itemId,user_id:userId,reaction},{onConflict:'moment_id,item_id,user_id'}).select('*').single();
   if(error)throw error;return data;
  },
  async scheduleMessage(input:{momentId:string;senderId:string;recipientId:string;conversationId:string;content:string;scheduledAt:string;timezone:string;attachments?:unknown[]}){
   if(!input.content.startsWith('KC-E2EE1:'))throw new Error('Future messages must be end-to-end encrypted before scheduling.');
   const {data,error}=await supabase.rpc('kc_schedule_magic_moment_message',{
    p_moment_id:input.momentId,p_conversation_id:input.conversationId,
    p_body_envelope:input.content,p_scheduled_at:input.scheduledAt
   });
   if(error)throw error;return {id:data,delivery_status:'queued',scheduled_at:input.scheduledAt};
  },
  async scheduledMessages(){
   const {data,error}=await supabase.from('kc_scheduled_messages').select('id,conversation_id,sender_id,body_envelope,message_type,scheduled_at,delivery_status,sent_message_id,last_error,created_at,updated_at').order('scheduled_at');
   if(error)throw error;return data||[];
  },
  async updateScheduled(id:string,patch:{scheduled_at?:string;delivery_status?:'queued'|'cancelled'}){
   const {data,error}=await supabase.from('kc_scheduled_messages').update(patch).eq('id',id).eq('delivery_status','queued').select('*').single();
   if(error)throw error;return data;
  },
  async notifications(){
   const {data,error}=await supabase.from('magic_moment_notifications').select('*').order('created_at',{ascending:false}).limit(100);
   if(error)throw error;return data||[];
  },
  async markNotificationRead(id:string){
   const {error}=await supabase.from('magic_moment_notifications').update({read_at:new Date().toISOString()}).eq('id',id);
   if(error)throw error;
  },
  async updateMoment(id:string,patch:Partial<Pick<MagicMoment,'title'|'description'|'reveal_at'|'scheduled_at'|'timezone'|'status'|'settings'>>){
   const {data,error}=await supabase.from('magic_moments').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
   if(error)throw error;return data as MagicMoment;
  },
  async deleteMoment(id:string){
   const {error}=await supabase.from('magic_moments').delete().eq('id',id);
   if(error)throw error;
  },
 };
}
