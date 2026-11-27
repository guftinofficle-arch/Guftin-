import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';

type MomentKind='birthday'|'capsule'|'future_message'|'secret_surprise'|'together'|'anniversary';
type Moment=any;
const KINDS:{id:MomentKind;title:string;subtitle:string;emoji:string}[]=[
 {id:'birthday',title:'Magic Birthday',subtitle:'Collect wishes, photos and videos for a birthday reveal',emoji:'🎂'},
 {id:'capsule',title:'Memory Capsule',subtitle:'Keep a private collection of memories for later',emoji:'🕰️'},
 {id:'future_message',title:'Future Message',subtitle:'Send an encrypted message to a future date',emoji:'💌'},
 {id:'secret_surprise',title:'Secret Surprise',subtitle:'Hide a surprise until its reveal time',emoji:'🎁'},
 {id:'together',title:'Together Moments',subtitle:'Build a shared memory with friends',emoji:'✨'},
 {id:'anniversary',title:'Friendship Anniversary',subtitle:'Celebrate a friendship with consent',emoji:'💜'}
];
const REACTIONS=['❤️','🎉','✨','👏','😊','💜'];
const colors={bg:'#090f2d',panel:'#121b42',panel2:'#1a2856',gold:'#e8c77a',muted:'#aeb9dc',white:'#fff',purple:'#8e70ff',line:'#34416e'};
const Button=({children,onPress,disabled,style}:any)=><TouchableOpacity disabled={disabled} activeOpacity={0.8} onPress={onPress} style={[{paddingVertical:12,paddingHorizontal:15,borderRadius:13,backgroundColor:colors.panel2,alignItems:'center',justifyContent:'center',opacity:disabled?.55:1},style]}>{children}</TouchableOpacity>;
const Label=({children}:any)=><Text style={{fontSize:11,color:colors.gold,fontWeight:'900',letterSpacing:1,marginBottom:7}}>{children}</Text>;
const Field=({value,onChangeText,placeholder,multiline=false}:any)=><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8290bd" multiline={multiline} maxLength={multiline?8000:140} style={{backgroundColor:'#0b1435',borderWidth:1,borderColor:colors.line,borderRadius:12,padding:13,color:colors.white,minHeight:multiline?92:46,textAlignVertical:multiline?'top':'center',marginBottom:12}}/>;

export function MagicMomentsScreen({userId,chats=[],getDeviceIdentity,onBack,onOpenChat}:any){
 const [moments,setMoments]=useState<Moment[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [selected,setSelected]=useState<Moment|null>(null);
 const [items,setItems]=useState<any[]>([]);
 const [comments,setComments]=useState<any[]>([]);
 const [comment,setComment]=useState('');
 const [busy,setBusy]=useState(false);
 const [createOpen,setCreateOpen]=useState(false);
 const [kind,setKind]=useState<MomentKind>('birthday');
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [revealAt,setRevealAt]=useState('');
 const [recipient,setRecipient]=useState('');
 const [username,setUsername]=useState('');
 const [contribution,setContribution]=useState('');
 const [futureText,setFutureText]=useState('');
 const [futureChat,setFutureChat]=useState('');
 const [futureDate,setFutureDate]=useState('');
 const [mediaBusy,setMediaBusy]=useState(false);
 const [members,setMembers]=useState<any[]>([]);
 const [myMembership,setMyMembership]=useState<any>(null);
 const [notifications,setNotifications]=useState<any[]>([]);
 const kindInfo=useMemo(()=>KINDS.find(k=>k.id===kind)!,[kind]);

 const load=useCallback(async()=>{
  if(!userId)return;
  const {data:memberRows,error:memberError}=await supabase.from('magic_moment_members').select('moment_id,role,accepted_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(250);
  if(memberError)throw memberError;
  const ids=(memberRows||[]).map((x:any)=>x.moment_id);
  if(!ids.length){setMoments([]);return;}
  const {data,error}=await supabase.from('magic_moments').select('id,creator_id,kind,title,description,conversation_id,recipient_id,reveal_at,scheduled_at,timezone,status,cover_object_path,settings,created_at,revealed_at,magic_moment_members(user_id,role,accepted_at)').in('id',ids).order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  setMoments(data||[]);
  const {data:notes,error:noteError}=await supabase.from('magic_moment_notifications').select('id,moment_id,notification_type,title,body,created_at,read_at').eq('recipient_id',userId).is('read_at',null).order('created_at',{ascending:false}).limit(20);
  if(!noteError)setNotifications(notes||[]);
 },[userId]);

 useEffect(()=>{let live=true;setLoading(true);load().catch((e:any)=>Alert.alert('Magic Moments',e.message||'Could not load moments.')).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[load]);
 useEffect(()=>{
  if(!userId)return;
  const channel=supabase.channel('magic-moments-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'magic_moments'},()=>void load())
   .on('postgres_changes',{event:'*',schema:'public',table:'magic_moment_items'},()=>{if(selected)void openMoment(selected);})
   .on('postgres_changes',{event:'*',schema:'public',table:'magic_moment_notifications',filter:'recipient_id=eq.'+userId},()=>void load())
   .subscribe();
  return()=>{void supabase.removeChannel(channel);};
 },[userId,load,selected]);

 const openMoment=async(moment:Moment)=>{
  setSelected(moment);setBusy(true);
  try{
   const [itemResult,commentResult,memberResult]=await Promise.all([
    supabase.from('magic_moment_items').select('*').eq('moment_id',moment.id).order('created_at',{ascending:true}).limit(150),
    supabase.from('magic_moment_comments').select('*').eq('moment_id',moment.id).order('created_at',{ascending:true}).limit(100),
    supabase.from('magic_moment_members').select('user_id,role,accepted_at').eq('moment_id',moment.id).limit(100)
   ]);
   if(itemResult.error)throw itemResult.error;
   if(commentResult.error)throw commentResult.error;
   if(memberResult.error)throw memberResult.error;
   const signed=await Promise.all((itemResult.data||[]).map(async(item:any)=>{
    if(!item.object_path)return item;
    const {data}=await supabase.storage.from('magic-moments').createSignedUrl(item.object_path,3600);
    return {...item,signed_url:data?.signedUrl||null};
   }));
   setItems(signed);setComments(commentResult.data||[]);setMembers(memberResult.data||[]);setMyMembership((memberResult.data||[]).find((m:any)=>m.user_id===userId)||null);
  }catch(e:any){Alert.alert('Could not open memory',e.message||'Please try again.');}
  finally{setBusy(false);}
 };

 const createMoment=async()=>{
  if(!title.trim())return Alert.alert('Add a title','Enter a name for this moment.');
  setBusy(true);
  try{
   const date=revealAt.trim()?new Date(revealAt.trim()):null;
   if(revealAt.trim()&&(!date||Number.isNaN(date.getTime())))throw new Error('Enter reveal date/time in ISO format, e.g. 2027-01-01T09:00:00+05:00.');
   if(date&&date.getTime()<=Date.now())throw new Error('Reveal time must be in the future.');
   let recipientId:string|null=null;
   if(recipient.trim()){
    const {data:recipientProfile,error:recipientError}=await supabase.from('kc_profiles').select('id').eq('username',recipient.trim().toLowerCase().replace(/^@/, '')).maybeSingle();
    if(recipientError)throw recipientError;
    if(!recipientProfile)throw new Error('No Guftin account was found for that recipient username.');
    recipientId=recipientProfile.id;
   }
   const {data,error}=await supabase.from('magic_moments').insert({
    creator_id:userId,kind,title:title.trim(),description:description.trim(),
    recipient_id:recipientId,reveal_at:date?.toISOString()||null,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',
    status:date&&['secret_surprise','birthday','capsule','anniversary'].includes(kind)?'scheduled':'draft',
    settings:{reveal_requires_owner:true,created_from:'guftin_mobile'}
   }).select().single();
   if(error)throw error;
   if(recipientId){
    const {error:memberError}=await supabase.from('magic_moment_members').insert({moment_id:data.id,user_id:recipientId,role:'recipient',invited_by:userId});
    if(memberError&&memberError.code!=='23505')throw memberError;
    await supabase.from('magic_moment_notifications').insert({recipient_id:recipientId,moment_id:data.id,notification_type:'invite',title:'A Magic Moment invitation',body:'You have been invited to share a memory in Guftin.',safe_payload:{moment_id:data.id}});
   }
   setCreateOpen(false);setTitle('');setDescription('');setRevealAt('');setRecipient('');
   await load();await openMoment(data);
  }catch(e:any){Alert.alert('Moment not created',e.message||'Please try again.');}
  finally{setBusy(false);}
 };

 const inviteMember=async()=>{
  if(!selected||!username.trim())return;
  setBusy(true);
  try{
   const {data:profile,error}=await supabase.from('kc_profiles').select('id,username,display_name').eq('username',username.trim().toLowerCase().replace(/^@/, '')).maybeSingle();
   if(error)throw error;
   if(!profile)throw new Error('No Guftin account was found for that username.');
   if(profile.id===userId)throw new Error('You are already the owner of this moment.');
   const {error:insertError}=await supabase.from('magic_moment_members').insert({moment_id:selected.id,user_id:profile.id,role:selected.kind==='birthday'||selected.kind==='together'?'contributor':'recipient',invited_by:userId});
   if(insertError&&insertError.code!=='23505')throw insertError;
   await supabase.from('magic_moment_notifications').insert({recipient_id:profile.id,moment_id:selected.id,notification_type:'invite',title:'A Magic Moment invitation',body:'You have been invited to contribute to a Guftin memory.',safe_payload:{moment_id:selected.id}});
   setUsername('');await openMoment(selected);Alert.alert('Invitation sent','The member has been invited to this moment.');
  }catch(e:any){Alert.alert('Invitation failed',e.message||'Please try again.');}
  finally{setBusy(false);}
 };

 const addText=async()=>{
  if(!selected||!contribution.trim())return;
  setBusy(true);
  try{
   const {error}=await supabase.from('magic_moment_items').insert({moment_id:selected.id,author_id:userId,item_type:'text',body:contribution.trim(),metadata:{source:'mobile'}});
   if(error)throw error;
   setContribution('');await openMoment(selected);
  }catch(e:any){Alert.alert('Could not add memory',e.message||'Please try again.');}
  finally{setBusy(false);}
 };

 const addMedia=async()=>{
  if(!selected)return;
  try{
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],allowsEditing:false,quality:0.88});
   if(result.canceled||!result.assets?.[0])return;
   const asset=result.assets[0];setMediaBusy(true);
   const response=await fetch(asset.uri);const blob=await response.blob();
   if(blob.size>50*1024*1024)throw new Error('Media must be 50 MB or smaller.');
   const ext=(asset.fileName?.split('.').pop()||(asset.type==='video'?'mp4':'jpg')).replace(/[^a-z0-9]/gi,'').toLowerCase();
   const path=userId+'/'+selected.id+'/'+Date.now()+'.'+ext;
   const mime=asset.mimeType||(asset.type==='video'?'video/mp4':'image/jpeg');
   const {error:uploadError}=await supabase.storage.from('magic-moments').upload(path,blob,{contentType:mime,upsert:false});
   if(uploadError)throw uploadError;
   const {error}=await supabase.from('magic_moment_items').insert({moment_id:selected.id,author_id:userId,item_type:asset.type==='video'?'video':'image',body:'',object_path:path,mime_type:mime,byte_size:blob.size,metadata:{file_name:asset.fileName||null,width:asset.width||null,height:asset.height||null}});
   if(error){await supabase.storage.from('magic-moments').remove([path]);throw error;}
   await openMoment(selected);
  }catch(e:any){Alert.alert('Media upload failed',e.message||'Please try again.');}
  finally{setMediaBusy(false);}
 };

 const postComment=async()=>{
  if(!selected||!comment.trim())return;
  try{
   const {error}=await supabase.from('magic_moment_comments').insert({moment_id:selected.id,author_id:userId,body:comment.trim()});
   if(error)throw error;setComment('');await openMoment(selected);
  }catch(e:any){Alert.alert('Comment failed',e.message||'Please try again.');}
 };
 const react=async(item:any,emoji:string)=>{
  if(!selected)return;
  try{
   const {data:existing,error:findError}=await supabase.from('magic_moment_reactions').select('id').eq('moment_id',selected.id).eq('user_id',userId).eq('reaction',emoji).eq(item?'item_id':'moment_id',item?.id||selected.id).maybeSingle();
   if(findError)throw findError;
   if(existing){const {error}=await supabase.from('magic_moment_reactions').delete().eq('id',existing.id);if(error)throw error;}
   else{const {error}=await supabase.from('magic_moment_reactions').insert({moment_id:selected.id,item_id:item?.id||null,user_id:userId,reaction:emoji});if(error)throw error;}
   await openMoment(selected);
  }catch(e:any){Alert.alert('Reaction failed',e.message||'Please try again.');}
 };

 const scheduleFuture=async()=>{
  if(!selected||selected.kind!=='future_message'||!futureText.trim()||!futureChat||!futureDate.trim())return;
  setBusy(true);
  try{
   const scheduledAt=new Date(futureDate);
   if(Number.isNaN(scheduledAt.getTime())||scheduledAt.getTime()<=Date.now())throw new Error('Enter a future date/time, e.g. 2027-01-01T09:00:00+05:00.');
   const identity=await getDeviceIdentity();
   const {data:membersData,error:membersError}=await supabase.from('kc_conversation_members').select('user_id').eq('conversation_id',futureChat);
   if(membersError)throw membersError;
   const memberIds=(membersData||[]).map((x:any)=>x.user_id);
   const {data:devices,error:devicesError}=await supabase.from('kc_e2ee_devices').select('id,user_id,public_key').in('user_id',memberIds).is('revoked_at',null);
   if(devicesError)throw devicesError;
   const {encryptMessageForDevices}=require('../../lib/e2ee');
   const envelope=encryptMessageForDevices(futureText.trim(),devices||[],identity);
   const {data,error}=await supabase.rpc('kc_schedule_magic_moment_message',{p_moment_id:selected.id,p_conversation_id:futureChat,p_body_envelope:envelope,p_scheduled_at:scheduledAt.toISOString()});
   if(error)throw error;
   setFutureText('');setFutureDate('');setFutureChat('');
   await openMoment(selected);
   Alert.alert('Future message scheduled','Guftin will deliver this end-to-end encrypted message at the selected time.');
  }catch(e:any){Alert.alert('Could not schedule message',e.message||'Please try again.');}
  finally{setBusy(false);}
 };

 const markRead=async(id:string)=>{
  try{await supabase.from('magic_moment_notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('recipient_id',userId);}catch{}
  void load();
 };

 const acceptInvitation=async()=>{
  if(!selected||!myMembership||myMembership.accepted_at)return;
  setBusy(true);
  try{
   const {error}=await supabase.from('magic_moment_members').update({accepted_at:new Date().toISOString()}).eq('moment_id',selected.id).eq('user_id',userId);
   if(error)throw error;
   setMyMembership({...myMembership,accepted_at:new Date().toISOString()});
   await supabase.from('magic_moment_notifications').insert({recipient_id:selected.creator_id,moment_id:selected.id,notification_type:'contribution',title:'Magic Moment invitation accepted',body:'A member accepted your invitation.',safe_payload:{moment_id:selected.id}});
  }catch(e:any){Alert.alert('Could not accept invitation',e.message||'Please try again.');}
  finally{setBusy(false);}
 };
 const closeMoment=()=>{setSelected(null);setItems([]);setComments([]);setMembers([]);setMyMembership(null);};
 const statusColor=(s:string)=>s==='revealed'?'#64d6a1':s==='scheduled'?'#e8c77a':s==='cancelled'?'#e58b99':colors.muted;

 return <View style={{flex:1,backgroundColor:colors.bg}}>
  <View style={{paddingHorizontal:18,paddingTop:12,paddingBottom:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:colors.line}}>
   <TouchableOpacity onPress={selected?closeMoment:onBack} style={{padding:8}}><Text style={{color:colors.gold,fontSize:24}}>‹</Text></TouchableOpacity>
   <View style={{flex:1,marginLeft:6}}><Text style={{color:colors.white,fontSize:22,fontWeight:'900'}}>Magic Moments</Text><Text style={{color:colors.muted,fontSize:10,marginTop:2}}>Make memories that last</Text></View>
   {!selected?<Button onPress={()=>setCreateOpen(true)} style={{backgroundColor:colors.purple}}><Text style={{color:'#fff',fontWeight:'900'}}>＋ Create</Text></Button>:null}
  </View>
  {selected?<ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}>
   <View style={{backgroundColor:colors.panel,borderRadius:20,padding:18,borderWidth:1,borderColor:colors.line}}>
    <Text style={{fontSize:12,color:colors.gold,fontWeight:'900'}}>{KINDS.find(k=>k.id===selected.kind)?.emoji} {KINDS.find(k=>k.id===selected.kind)?.title?.toUpperCase()}</Text>
    <Text style={{fontSize:24,color:colors.white,fontWeight:'900',marginTop:7}}>{selected.title}</Text>
    {!!selected.description&&<Text style={{color:colors.muted,lineHeight:20,marginTop:8}}>{selected.description}</Text>}
    <Text style={{color:statusColor(selected.status),fontSize:11,fontWeight:'900',marginTop:12}}>{String(selected.status||'draft').toUpperCase()} {selected.reveal_at?'· Reveal '+new Date(selected.reveal_at).toLocaleString():''}</Text>
    <Text style={{color:colors.muted,fontSize:11,marginTop:6}}>{members.length} members · {items.length} memories</Text>
    {myMembership&&!myMembership.accepted_at&&myMembership.role!=='owner'?<Button disabled={busy} onPress={()=>void acceptInvitation()} style={{backgroundColor:colors.purple,marginTop:12}}><Text style={{color:'#fff',fontWeight:'900'}}>Accept invitation</Text></Button>:null}
   </View>
   {selected.kind==='future_message'?<View style={{marginTop:15,backgroundColor:colors.panel,borderRadius:18,padding:15}}>
    <Label>ENCRYPTED FUTURE MESSAGE</Label><Field value={futureText} onChangeText={setFutureText} placeholder="Write the message to your future self or a friend…" multiline/>
    <Label>DELIVERY CHAT</Label>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>{chats.filter((c:any)=>c.kind!=='channel').map((c:any)=><Button key={c.id} onPress={()=>setFutureChat(c.id)} style={{marginRight:7,backgroundColor:futureChat===c.id?colors.purple:colors.panel2}}><Text style={{color:'#fff',fontSize:11}}>{c.name}</Text></Button>)}</ScrollView>
    <Label>DELIVERY DATE & TIME</Label><Field value={futureDate} onChangeText={setFutureDate} placeholder="2027-01-01T09:00:00+05:00"/>
    <Button disabled={busy||!futureText.trim()||!futureChat||!futureDate.trim()} onPress={()=>void scheduleFuture()} style={{backgroundColor:colors.purple}}><Text style={{color:'#fff',fontWeight:'900'}}>Schedule encrypted delivery</Text></Button>
   </View>:null}
   <View style={{marginTop:15,backgroundColor:colors.panel,borderRadius:18,padding:15}}>
    <Label>INVITE A GUFTIN MEMBER</Label><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Field value={username} onChangeText={setUsername} placeholder="@username"/></View><Button disabled={busy||!username.trim()} onPress={()=>void inviteMember()} style={{backgroundColor:colors.purple}}><Text style={{color:'#fff',fontWeight:'900'}}>Invite</Text></Button></View>
   </View>
   <View style={{marginTop:15,backgroundColor:colors.panel,borderRadius:18,padding:15}}>
    <Label>ADD A MEMORY</Label><Field value={contribution} onChangeText={setContribution} placeholder="Write a wish, memory or note…" multiline/>
    <View style={{flexDirection:'row',gap:8}}><Button disabled={busy||!contribution.trim()} onPress={()=>void addText()} style={{flex:1,backgroundColor:colors.purple}}><Text style={{color:'#fff',fontWeight:'900'}}>Add text</Text></Button><Button disabled={mediaBusy} onPress={()=>void addMedia()} style={{flex:1}}><Text style={{color:colors.white,fontWeight:'900'}}>{mediaBusy?'Uploading…':'＋ Photo / Video'}</Text></Button></View>
   </View>
   <Text style={{color:colors.white,fontSize:16,fontWeight:'900',marginTop:20,marginBottom:10}}>Shared memories</Text>
   {busy&&!items.length?<ActivityIndicator color={colors.gold}/>:items.map(item=><View key={item.id} style={{backgroundColor:colors.panel,borderRadius:16,padding:13,marginBottom:10,borderWidth:1,borderColor:colors.line}}>
    {item.item_type==='text'?<Text style={{color:colors.white,lineHeight:21}}>{item.body}</Text>:item.signed_url?<Image source={{uri:item.signed_url}} style={{width:'100%',height:220,borderRadius:12,backgroundColor:'#080d22'}} resizeMode="cover"/>:<Text style={{color:colors.muted}}>{item.item_type} media</Text>}
    <Text style={{color:colors.muted,fontSize:10,marginTop:8}}>{new Date(item.created_at).toLocaleString()}</Text>
    <View style={{flexDirection:'row',gap:8,marginTop:8}}>{REACTIONS.map(emoji=><TouchableOpacity key={emoji} onPress={()=>void react(item,emoji)}><Text style={{fontSize:18}}>{emoji}</Text></TouchableOpacity>)}</View>
   </View>)}
   <Text style={{color:colors.white,fontSize:16,fontWeight:'900',marginTop:12,marginBottom:10}}>Comments</Text>
   {comments.map(row=><View key={row.id} style={{backgroundColor:colors.panel,borderRadius:12,padding:12,marginBottom:7}}><Text style={{color:colors.white}}>{row.body}</Text><Text style={{color:colors.muted,fontSize:10,marginTop:5}}>{new Date(row.created_at).toLocaleString()}</Text></View>)}
   <Field value={comment} onChangeText={setComment} placeholder="Write a comment…"/>
   <Button disabled={!comment.trim()} onPress={()=>void postComment()} style={{backgroundColor:colors.purple}}><Text style={{color:'#fff',fontWeight:'900'}}>Post comment</Text></Button>
  </ScrollView>:<ScrollView contentContainerStyle={{padding:16,paddingBottom:30}}>
   {notifications.length?<View style={{backgroundColor:'#29234e',borderRadius:15,padding:13,marginBottom:14}}><Label>NEW NOTIFICATIONS</Label>{notifications.map(n=><TouchableOpacity key={n.id} onPress={()=>{void markRead(n.id);const m=moments.find(x=>x.id===n.moment_id);if(m)void openMoment(m);}} style={{paddingVertical:8,borderBottomWidth:1,borderColor:'#554d7a'}}><Text style={{color:colors.white,fontWeight:'800'}}>{n.title}</Text><Text style={{color:colors.muted,fontSize:11,marginTop:3}}>{n.body}</Text></TouchableOpacity>)}</View>:null}
   <Text style={{color:colors.white,fontSize:18,fontWeight:'900',marginBottom:4}}>Create a moment worth keeping</Text><Text style={{color:colors.muted,fontSize:12,lineHeight:18,marginBottom:15}}>Choose a memory space, invite the people involved, then add words, photos or videos.</Text>
   {KINDS.map(k=><TouchableOpacity key={k.id} onPress={()=>{setKind(k.id);setTitle('');setDescription('');setRevealAt('');setRecipient('');setCreateOpen(true);}} style={{backgroundColor:colors.panel,borderWidth:1,borderColor:colors.line,borderRadius:17,padding:15,marginBottom:10,flexDirection:'row',alignItems:'center',gap:12}}>
    <View style={{width:48,height:48,borderRadius:15,backgroundColor:'#2a2b62',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:25}}>{k.emoji}</Text></View><View style={{flex:1}}><Text style={{color:colors.white,fontSize:14,fontWeight:'900'}}>{k.title}</Text><Text style={{color:colors.muted,fontSize:11,marginTop:4,lineHeight:16}}>{k.subtitle}</Text></View><Text style={{color:colors.gold,fontSize:20}}>›</Text>
   </TouchableOpacity>)}
   <Text style={{color:colors.white,fontWeight:'900',fontSize:17,marginTop:14,marginBottom:9}}>My Memories & Shared With Me</Text>
   {loading?<ActivityIndicator color={colors.gold}/>:moments.length?moments.map(m=><TouchableOpacity key={m.id} onPress={()=>void openMoment(m)} style={{backgroundColor:colors.panel,borderRadius:15,padding:14,marginBottom:9,borderWidth:1,borderColor:colors.line}}><Text style={{color:colors.white,fontWeight:'900',fontSize:14}}>{KINDS.find(k=>k.id===m.kind)?.emoji} {m.title}</Text><Text style={{color:colors.muted,fontSize:11,marginTop:5}}>{KINDS.find(k=>k.id===m.kind)?.title} · {m.status} · {new Date(m.created_at).toLocaleDateString()}</Text></TouchableOpacity>):<Text style={{color:colors.muted,textAlign:'center',padding:25}}>Your Magic Moments will appear here.</Text>}
   <Button onPress={()=>void load()} style={{marginTop:8}}><Text style={{color:colors.white}}>Refresh moments</Text></Button>
  </ScrollView>}
  <Modal visible={createOpen} transparent animationType="slide" onRequestClose={()=>setCreateOpen(false)}>
   <View style={{flex:1,backgroundColor:'#000b',justifyContent:'flex-end'}}><View style={{backgroundColor:colors.panel,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,maxHeight:'88%'}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{color:colors.white,fontSize:20,fontWeight:'900'}}>Create {kindInfo.title}</Text><TouchableOpacity onPress={()=>setCreateOpen(false)}><Text style={{color:colors.gold,fontSize:25}}>×</Text></TouchableOpacity></View>
    <ScrollView keyboardShouldPersistTaps="handled" style={{marginTop:15}}>
     <Label>MOMENT TYPE</Label><ScrollView horizontal showsHorizontalScrollIndicator={false}>{KINDS.map(k=><Button key={k.id} onPress={()=>setKind(k.id)} style={{marginRight:7,backgroundColor:kind===k.id?colors.purple:colors.panel2}}><Text style={{color:'#fff',fontSize:11}}>{k.emoji} {k.title}</Text></Button>)}</ScrollView>
     <View style={{height:14}}/><Label>TITLE</Label><Field value={title} onChangeText={setTitle} placeholder="Give this moment a title"/>
     <Label>DESCRIPTION / MESSAGE</Label><Field value={description} onChangeText={setDescription} placeholder="Add a description…" multiline/>
     {['birthday','capsule','secret_surprise','anniversary'].includes(kind)?<><Label>OPTIONAL REVEAL DATE & TIME</Label><Field value={revealAt} onChangeText={setRevealAt} placeholder="2027-01-01T09:00:00+05:00"/></>:null}
     <Label>RECIPIENT USERNAME (OPTIONAL)</Label><Field value={recipient} onChangeText={setRecipient} placeholder="@username"/>
     <Button disabled={busy||!title.trim()} onPress={()=>void createMoment()} style={{backgroundColor:colors.purple,marginTop:5}}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'Creating…':'Create Magic Moment'}</Text></Button>
    </ScrollView>
   </View></View>
  </Modal>
 </View>;
}
