import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import * as ExpoCrypto from 'expo-crypto';

export type HoloPrivacy = 'private' | 'public';
export type HoloRoom = {
  id:string; name:string; description:string; privacy:HoloPrivacy; owner_id:string;
  timezone:string; created_at:string; updated_at:string;
};
export type HoloMemory = {
  id:string; room_id:string; body:string; media_path:string|null; author_id:string;
  created_at:string; updated_at:string;
};
export type HoloEvent = {
  id:string; room_id:string; title:string; description:string;
  event_type:'birthday'|'special_date'|'countdown'; starts_at:string;
  timezone:string; created_by:string; created_at:string; updated_at:string;
};
export type HoloGalleryItem = {
  id:string; room_id:string; object_path:string; media_type:'image'|'video';
  mime_type:string; byte_size:number; caption:string; uploaded_by:string; created_at:string;
};
const GALLERY='holospace-gallery';
const AVATARS='holospace-avatars';
const BACKGROUNDS='holospace-backgrounds';
const MAX_BYTES=100*1024*1024;
const MIME=new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function id(value:string,label:string){if(!UUID.test(value))throw new Error('Invalid '+label+'.');}
function clean(value:string,max:number,label:string){const v=value.trim();if(!v||v.length>max)throw new Error(label+' is required and must be under '+max+' characters.');return v;}

export function createHoloSpaceClient(db:SupabaseClient){
  async function createRoom(input:{name:string;description?:string;privacy:HoloPrivacy;ownerId:string;timezone:string}):Promise<HoloRoom>{
    id(input.ownerId,'owner'); const name=clean(input.name,80,'Room name');
    const {data,error}=await db.from('holospace_rooms').insert({
      name,description:(input.description||'').trim().slice(0,600),privacy:input.privacy,
      owner_id:input.ownerId,timezone:clean(input.timezone,64,'Timezone')
    }).select('*').single();
    if(error)throw error; return data as HoloRoom;
  }
  async function listMyRooms():Promise<HoloRoom[]>{
    const {data,error}=await db.from('holospace_rooms').select('*').is('archived_at',null).order('updated_at',{ascending:false}).limit(100);
    if(error)throw error; return (data||[]) as HoloRoom[];
  }
  async function listInvitations(){
    const {data,error}=await db.from('holospace_members').select('room_id,invited_by,created_at,holospace_rooms(id,name,description,privacy,owner_id,timezone,created_at,updated_at)').eq('invitation_status','invited').order('created_at',{ascending:false}).limit(100);
    if(error)throw error; return data||[];
  }
  async function invite(roomId:string,userId:string,inviterId:string){
    id(roomId,'room');id(userId,'user');id(inviterId,'inviter');
    const {error}=await db.from('holospace_members').insert({
      room_id:roomId,user_id:userId,role:'member',invitation_status:'invited',invited_by:inviterId
    });
    if(error)throw error;
  }
  async function acceptInvitation(roomId:string){
    id(roomId,'room');
    const {data,error}=await db.from('holospace_members').update({
      invitation_status:'active',joined_at:new Date().toISOString()
    }).eq('room_id',roomId).eq('invitation_status','invited').select('*').single();
    if(error)throw error;return data;
  }
  async function leaveRoom(roomId:string,userId:string){
    id(roomId,'room');id(userId,'user');
    const {error}=await db.from('holospace_members').delete().eq('room_id',roomId).eq('user_id',userId).eq('role','member');
    if(error)throw error;
  }
  async function listMembers(roomId:string){
    id(roomId,'room');
    const {data,error}=await db.from('holospace_members').select('room_id,user_id,role,invitation_status,invited_by,joined_at').eq('room_id',roomId).order('created_at');
    if(error)throw error;return data||[];
  }
  async function updateRoom(roomId:string,patch:{name?:string;description?:string;privacy?:HoloPrivacy;timezone?:string}){
    id(roomId,'room');const update:Record<string,unknown>={updated_at:new Date().toISOString()};
    if(patch.name!==undefined)update.name=clean(patch.name,80,'Room name');
    if(patch.description!==undefined)update.description=patch.description.trim().slice(0,600);
    if(patch.privacy!==undefined)update.privacy=patch.privacy;
    if(patch.timezone!==undefined)update.timezone=clean(patch.timezone,64,'Timezone');
    const {data,error}=await db.from('holospace_rooms').update(update).eq('id',roomId).select('*').single();
    if(error)throw error;return data as HoloRoom;
  }
  async function deleteRoom(roomId:string){
    id(roomId,'room');const {error}=await db.from('holospace_rooms').delete().eq('id',roomId);
    if(error)throw error;
  }
  async function addMemory(input:{roomId:string;authorId:string;body:string;mediaPath?:string|null}):Promise<HoloMemory>{
    id(input.roomId,'room');id(input.authorId,'author');
    const {data,error}=await db.from('holospace_memories').insert({
      room_id:input.roomId,author_id:input.authorId,body:clean(input.body,5000,'Memory'),
      media_path:input.mediaPath||null
    }).select('*').single();
    if(error)throw error;return data as HoloMemory;
  }
  async function editMemory(memoryId:string,body:string){
    id(memoryId,'memory');const {data,error}=await db.from('holospace_memories').update({
      body:clean(body,5000,'Memory'),updated_at:new Date().toISOString()
    }).eq('id',memoryId).select('*').single();
    if(error)throw error;return data as HoloMemory;
  }
  async function deleteMemory(memoryId:string){
    id(memoryId,'memory');const {error}=await db.from('holospace_memories').delete().eq('id',memoryId);
    if(error)throw error;
  }
  async function listMemories(roomId:string){
    id(roomId,'room');const {data,error}=await db.from('holospace_memories').select('*').eq('room_id',roomId).order('created_at',{ascending:false}).limit(250);
    if(error)throw error;return (data||[]) as HoloMemory[];
  }
  async function uploadGallery(input:{roomId:string;userId:string;fileName:string;mimeType:string;bytes:number;mediaType:'image'|'video';body:Blob;caption?:string}):Promise<HoloGalleryItem>{
    id(input.roomId,'room');id(input.userId,'user');
    if(!MIME.has(input.mimeType)||input.bytes<1||input.bytes>MAX_BYTES)throw new Error('Unsupported media type or file size (maximum 100 MB).');
    const safe=input.fileName.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-90)||'media';
    const path=input.roomId+'/'+input.userId+'/'+ExpoCrypto.randomUUID()+'-'+safe;
    const {error:upErr}=await db.storage.from(GALLERY).upload(path,input.body,{contentType:input.mimeType,upsert:false});
    if(upErr)throw upErr;
    const {data,error}=await db.from('holospace_gallery').insert({
      room_id:input.roomId,object_path:path,media_type:input.mediaType,mime_type:input.mimeType,
      byte_size:input.bytes,caption:(input.caption||'').trim().slice(0,500),uploaded_by:input.userId
    }).select('*').single();
    if(error){await db.storage.from(GALLERY).remove([path]);throw error;}
    return data as HoloGalleryItem;
  }
  async function listGallery(roomId:string){
    id(roomId,'room');const {data,error}=await db.from('holospace_gallery').select('*').eq('room_id',roomId).order('created_at',{ascending:false}).limit(250);
    if(error)throw error;return (data||[]) as HoloGalleryItem[];
  }
  async function gallerySignedUrl(path:string,expiresIn=300){
    if(path.split('/').length!==3||!UUID.test(path.split('/')[0])||!UUID.test(path.split('/')[1]))throw new Error('Invalid media path.');
    const {data,error}=await db.storage.from(GALLERY).createSignedUrl(path,expiresIn);
    if(error)throw error;return data.signedUrl;
  }
  async function deleteGalleryItem(itemId:string,path:string){
    id(itemId,'gallery item');
    const {error}=await db.from('holospace_gallery').delete().eq('id',itemId);
    if(error)throw error;
    const {error:storageError}=await db.storage.from(GALLERY).remove([path]);
    if(storageError)throw storageError;
  }
  async function saveAvatar(roomId:string,userId:string,avatarKey:string,colorKey:string){
    id(roomId,'room');id(userId,'user');
    const avatars=['orbit','comet','nova','planet','moon','star','nebula','rocket','flower','spark'];
    const colors=['emerald','ocean','violet','sunset','gold','rose'];
    if(!avatars.includes(avatarKey)||!colors.includes(colorKey))throw new Error('Invalid avatar choice.');
    const {data,error}=await db.from('holospace_avatars').upsert({
      room_id:roomId,user_id:userId,avatar_key:avatarKey,color_key:colorKey,updated_at:new Date().toISOString()
    },{onConflict:'room_id,user_id'}).select('*').single();
    if(error)throw error;return data;
  }
  async function saveTheme(input:{roomId:string;userId:string;themeKey:string;accentColor:string;backgroundPath?:string|null}){
    id(input.roomId,'room');id(input.userId,'user');
    const themes=['aurora','midnight','ocean','sunset','forest','starlight'];
    if(!themes.includes(input.themeKey)||!/^#[0-9a-f]{6}$/i.test(input.accentColor))throw new Error('Invalid room theme.');
    const {data,error}=await db.from('holospace_themes').upsert({
      room_id:input.roomId,updated_by:input.userId,theme_key:input.themeKey,
      accent_color:input.accentColor,background_path:input.backgroundPath||null,updated_at:new Date().toISOString()
    },{onConflict:'room_id'}).select('*').single();
    if(error)throw error;return data;
  }
  async function createEvent(input:{roomId:string;userId:string;title:string;description?:string;type:'birthday'|'special_date'|'countdown';startsAt:string;timezone:string}):Promise<HoloEvent>{
    id(input.roomId,'room');id(input.userId,'user');
    if(!Number.isFinite(Date.parse(input.startsAt)))throw new Error('Invalid event date.');
    const {data,error}=await db.from('holospace_events').insert({
      room_id:input.roomId,created_by:input.userId,title:clean(input.title,120,'Event title'),
      description:(input.description||'').trim().slice(0,1000),event_type:input.type,
      starts_at:new Date(input.startsAt).toISOString(),timezone:clean(input.timezone,64,'Timezone')
    }).select('*').single();
    if(error)throw error;return data as HoloEvent;
  }
  async function listEvents(roomId:string){
    id(roomId,'room');const {data,error}=await db.from('holospace_events').select('*').eq('room_id',roomId).order('starts_at').limit(100);
    if(error)throw error;return (data||[]) as HoloEvent[];
  }
  async function subscribeRoom(roomId:string,onChange:(payload:any)=>void,onPresence:(state:Record<string,unknown[]>)=>void){
    id(roomId,'room');
    const channel=db.channel('holospace:'+roomId,{config:{presence:{key:'member'},broadcast:{self:false,ack:true}}});
    for(const table of ['holospace_rooms','holospace_members','holospace_memories','holospace_gallery','holospace_avatars','holospace_themes','holospace_events','holospace_activity']){
      channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'room_id=eq.'+roomId},onChange);
    }
    channel.on('presence',{event:'sync'},()=>onPresence(channel.presenceState()));
    const status=await new Promise<string>(resolve=>channel.subscribe(s=>{
      if(s==='SUBSCRIBED'||s==='CHANNEL_ERROR'||s==='TIMED_OUT'||s==='CLOSED')resolve(s);
    }));
    if(status!=='SUBSCRIBED'){await db.removeChannel(channel);throw new Error('HoloSpace connection failed: '+status);}
    return channel as RealtimeChannel;
  }
  async function trackPresence(channel:RealtimeChannel,userId:string,displayName:string,avatarKey:string){
    id(userId,'user');return channel.track({user_id:userId,display_name:displayName.slice(0,60),avatar_key:avatarKey,online_at:new Date().toISOString()});
  }
  return {createRoom,listMyRooms,listInvitations,invite,acceptInvitation,leaveRoom,listMembers,updateRoom,deleteRoom,
    addMemory,editMemory,deleteMemory,listMemories,uploadGallery,listGallery,gallerySignedUrl,deleteGalleryItem,
    saveAvatar,saveTheme,createEvent,listEvents,subscribeRoom,trackPresence};
}
