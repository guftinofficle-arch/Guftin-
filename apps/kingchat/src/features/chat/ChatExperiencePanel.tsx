import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, Switch,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { upgrade20 } from '../upgrade20';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id?: string | null;
  body?: string | null;
  message_type: string;
  attachment_url?: string | null;
  created_at: string;
  mine?: boolean;
  pending?: boolean;
  deleted_at?: string | null;
};
type StickerRow = { id: string; pack_name: string; sticker_name: string; object_path: string; is_animated?: boolean; signed_url?: string | null };
type MemberRow = { user_id: string; role: string; display_name?: string; username?: string; avatar_url?: string | null };
type Props = {
  visible: boolean;
  conversationId: string;
  conversationTitle: string;
  conversationKind: string;
  userId: string;
  messages: MessageRow[];
  onClose: () => void;
  onSendSticker?: (sticker: { url?: string; name: string; emoji?: string }) => void;
  onChooseEffect?: (effect: 'confetti'|'hearts'|'sparkle'|'fireworks'|'reveal') => void;
};

const ink = '#17352d';
const green = '#079b5b';
const muted = '#81918a';
const paper = '#fbf7f0';
const line = '#e8eee8';
const panel = '#ffffff';
const REACTIONS = ['❤️','😂','👍','😮','🔥','👏','🎉','✨','🥳','💯'];
const EFFECTS = [
  { key: 'confetti', label: 'Confetti', emoji: '🎊' },
  { key: 'hearts', label: 'Hearts', emoji: '💗' },
  { key: 'sparkle', label: 'Sparkle', emoji: '✨' },
  { key: 'fireworks', label: 'Fireworks', emoji: '🎆' },
  { key: 'reveal', label: 'Reveal', emoji: '🎁' }
] as const;
const urlPattern = /https?:\/\/[^\s<>()]+/i;
const card = { backgroundColor: panel, borderRadius: 16, borderWidth: 1, borderColor: line, padding: 13, marginBottom: 10 } as const;

function Action({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: primary ? green : '#edf6f0', opacity: disabled ? 0.45 : 1, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: primary ? '#fff' : green, fontSize: 11, fontWeight: '900' }}>{label}</Text>
  </TouchableOpacity>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: ink, fontWeight: '900', fontSize: 14, marginTop: 9, marginBottom: 9 }}>{children}</Text>;
}

export function ChatExperiencePanel({
  visible, conversationId, conversationTitle, conversationKind, userId, messages,
  onClose, onSendSticker, onChooseEffect
}: Props) {
  const [section, setSection] = useState('Search');
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('messages');
  const [libraryType, setLibraryType] = useState('all');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [tagMember, setTagMember] = useState('');
  const [tagText, setTagText] = useState('');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [preferences, setPreferences] = useState<any>({
    notifications_enabled: true, sound_key: 'default', vibration_enabled: true, show_preview: true
  });
  const [stickers, setStickers] = useState<StickerRow[]>([]);
  const [reactions, setReactions] = useState<any[]>([]);
  const [effects, setEffects] = useState<any[]>([]);
  const [libraryRows, setLibraryRows] = useState<any[]>([]);

  const isGroup = conversationKind === 'group';
  const activeMessages = useMemo(() => messages.filter(m => !m.pending && !m.deleted_at), [messages]);
  const selectedSearchResults = useMemo(() => activeMessages.filter(item => {
    const body = String(item.body || '');
    const matches = !query.trim() || body.toLowerCase().includes(query.trim().toLowerCase());
    if (!matches) return false;
    if (searchType === 'photos') return item.message_type === 'image';
    if (searchType === 'videos') return item.message_type === 'video';
    if (searchType === 'links') return urlPattern.test(body);
    if (searchType === 'files') return item.message_type === 'file';
    return item.message_type === 'text' || item.message_type === 'image' || item.message_type === 'video' || item.message_type === 'file' || item.message_type === 'audio';
  }), [activeMessages, query, searchType]);
  const mediaMessages = useMemo(() => activeMessages.filter(item => {
    if (libraryType === 'photos') return item.message_type === 'image';
    if (libraryType === 'videos') return item.message_type === 'video';
    if (libraryType === 'documents') return item.message_type === 'file';
    if (libraryType === 'audio') return item.message_type === 'audio';
    if (libraryType === 'links') return urlPattern.test(String(item.body || ''));
    return ['image','video','file','audio'].includes(item.message_type) || urlPattern.test(String(item.body || ''));
  }), [activeMessages, libraryType]);

  const loadAll = useCallback(async () => {
    if (!visible || !conversationId || !userId || conversationId.startsWith('pending:')) return;
    setBusy(true);
    try {
      const [savedResult, reminderResult, preferenceResult, reactionResult, effectResult, libraryResult] = await Promise.allSettled([
        upgrade20.listSavedItems(),
        supabase.from('kc_message_reminders').select('id,message_id,remind_at,note,created_at').eq('user_id', userId).eq('conversation_id', conversationId).is('notified_at', null).order('remind_at'),
        upgrade20.getChatPreferences(conversationId),
        supabase.from('kc_message_reactions').select('id,message_id,user_id,reaction,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(500),
        supabase.from('kc_message_effects').select('message_id,effect_key').eq('conversation_id', conversationId),
        upgrade20.listChatLibrary(conversationId)
      ]);
      if (savedResult.status === 'fulfilled') {
        const rows = Array.isArray(savedResult.value) ? savedResult.value as any[] : [];
        setSavedIds(rows.filter(row => row.conversation_id === conversationId).map(row => row.message_id));
      }
      if (reminderResult.status === 'fulfilled' && !reminderResult.value.error) setReminders(reminderResult.value.data || []);
      if (preferenceResult.status === 'fulfilled' && preferenceResult.value) setPreferences((p: any) => ({ ...p, ...preferenceResult.value }));
      if (reactionResult.status === 'fulfilled' && !reactionResult.value.error) setReactions(reactionResult.value.data || []);
      if (effectResult.status === 'fulfilled' && !effectResult.value.error) setEffects(effectResult.value.data || []);
      if (libraryResult.status === 'fulfilled') setLibraryRows(Array.isArray(libraryResult.value) ? libraryResult.value as any[] : []);
      if (isGroup) {
        const { data: membership, error: memberError } = await supabase.from('kc_conversation_members')
          .select('user_id,role').eq('conversation_id', conversationId).order('joined_at', { ascending: true });
        if (memberError) throw memberError;
        const ids = [...new Set((membership || []).map((row: any) => row.user_id))] as string[];
        const { data: people, error: peopleError } = ids.length
          ? await supabase.from('kc_profiles').select('id,display_name,username,avatar_url').in('id', ids)
          : { data: [], error: null };
        if (peopleError) throw peopleError;
        const byId = new Map((people || []).map((person: any) => [person.id, person]));
        setMembers((membership || []).map((row: any) => {
          const person: any = byId.get(row.user_id) || {};
          return { user_id: row.user_id, role: row.role, display_name: person.display_name, username: person.username, avatar_url: person.avatar_url };
        }));
        const loadedTags = await upgrade20.listGroupMemberTags(conversationId);
        setTags(Array.isArray(loadedTags) ? loadedTags as any[] : []);
      } else {
        setMembers([]);
        setTags([]);
      }
      const packs = await upgrade20.listCustomStickers();
      const stickerRows = await Promise.all((Array.isArray(packs) ? packs as any[] : []).map(async item => {
        const { data } = await supabase.storage.from('chat-media').createSignedUrl(item.object_path, 60 * 60);
        return { ...item, signed_url: data?.signedUrl || null } as StickerRow;
      }));
      setStickers(stickerRows);
    } catch (error: any) {
      Alert.alert('Chat tools', error?.message || 'Some chat details could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [visible, conversationId, userId, isGroup]);

  useEffect(() => {
    if (visible) {
      setSection('Search');
      setQuery('');
      void loadAll();
    }
  }, [visible, conversationId, loadAll]);

  const indexLibrary = async () => {
    const candidates = activeMessages.filter(item => item.message_type !== 'text' || urlPattern.test(String(item.body || '')));
    if (!candidates.length) return;
    setBusy(true);
    try {
      for (const item of candidates) {
        const body = String(item.body || '');
        const kind = item.message_type === 'image' ? 'image' :
          item.message_type === 'video' ? 'video' :
          item.message_type === 'file' ? 'document' :
          item.message_type === 'audio' ? 'audio' :
          urlPattern.test(body) ? 'link' : 'other';
        const link = body.match(urlPattern)?.[0];
        await upgrade20.addChatLibraryItem({
          conversation_id: conversationId, message_id: item.id, media_kind: kind as any,
          display_name: body.slice(0, 100) || undefined, link_url: link || undefined
        });
      }
      const rows = await upgrade20.listChatLibrary(conversationId, libraryType === 'all' ? undefined : libraryType === 'photos' ? 'image' : libraryType === 'documents' ? 'document' : libraryType as any);
      setLibraryRows(Array.isArray(rows) ? rows as any[] : []);
      Alert.alert('Shared library updated', 'The attachments and links from this chat have been indexed.');
    } catch (error: any) {
      Alert.alert('Library update failed', error?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSaved = async (item: MessageRow) => {
    try {
      if (savedIds.includes(item.id)) {
        const { data, error } = await supabase.from('kc_saved_items').delete().eq('user_id', userId).eq('message_id', item.id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('This saved item could not be removed.');
        setSavedIds(current => current.filter(id => id !== item.id));
      } else {
        await upgrade20.saveMessage(conversationId, item.id);
        setSavedIds(current => [...current, item.id]);
      }
    } catch (error: any) {
      Alert.alert('Saved message', error?.message || 'Could not update this important message.');
    }
  };

  const addTag = async () => {
    if (!tagMember || !tagText.trim()) return;
    try {
      await upgrade20.tagGroupMember(conversationId, tagMember, tagText.trim());
      setTagText('');
      setTags(await upgrade20.listGroupMemberTags(conversationId) as any[]);
    } catch (error: any) {
      Alert.alert('Member tag', error?.message || 'Could not save this tag.');
    }
  };

  const savePreferences = async (patch: Record<string, unknown>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      await upgrade20.saveChatPreferences(conversationId, patch as any);
    } catch (error: any) {
      setPreferences(preferences);
      Alert.alert('Notification settings', error?.message || 'Could not save these settings.');
    }
  };

  const createReminder = async () => {
    if (!reminderMessage || !reminderAt.trim()) return;
    const date = new Date(reminderAt.trim());
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      Alert.alert('Reminder time', 'Enter a future date and time, for example 2026-12-01T18:30:00+05:00.');
      return;
    }
    try {
      const row = await upgrade20.saveMessageReminder(conversationId, reminderMessage, date.toISOString(), reminderNote);
      const identifier = await Notifications.scheduleNotificationAsync({
        content: { title: 'Guftin · Reply reminder', body: reminderNote.trim() || 'A message is waiting for your reply.', data: { conversation_id: conversationId, message_id: reminderMessage } },
        trigger: date as any
      });
      setReminders(current => [...current, { ...row, local_notification_id: identifier }]);
      setReminderMessage('');
      setReminderNote('');
      setReminderAt('');
      Alert.alert('Reminder saved', 'Guftin will remind you on this phone at the selected time.');
    } catch (error: any) {
      Alert.alert('Reminder not saved', error?.message || 'Please try again.');
    }
  };

  const uploadSticker = async () => {
    if (!userId || busy) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo access to select a sticker image.');
      const picker = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
      if (picker.canceled || !picker.assets?.[0]) return;
      const asset = picker.assets[0];
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Could not read this sticker image.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Sticker image must be 8 MB or smaller.');
      const path = userId + '/stickers/' + Date.now() + '-' + Crypto.randomUUID() + '.png';
      setBusy(true);
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, bytes, { contentType: 'image/png', upsert: false });
      bytes.fill(0);
      if (uploadError) throw uploadError;
      await upgrade20.saveCustomSticker({ pack_name: 'My stickers', sticker_name: (asset.fileName || 'Custom sticker').replace(/\.[^.]+$/, '').slice(0, 48), object_path: path, is_animated: false });
      const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 60 * 60);
      setStickers(current => [{ id: path, pack_name: 'My stickers', sticker_name: asset.fileName || 'Custom sticker', object_path: path, signed_url: data?.signedUrl || null }, ...current]);
    } catch (error: any) {
      Alert.alert('Custom sticker', error?.message || 'Could not add this sticker.');
    } finally {
      setBusy(false);
    }
  };

  const react = async (messageId: string, emoji: string) => {
    try {
      await upgrade20.reactToMessage(conversationId, messageId, emoji);
      const { data, error } = await supabase.from('kc_message_reactions').select('id,message_id,user_id,reaction,created_at')
        .eq('conversation_id', conversationId).eq('message_id', messageId).order('created_at');
      if (error) throw error;
      setReactions(current => [...current.filter(row => row.message_id !== messageId), ...(data || [])]);
    } catch (error: any) {
      Alert.alert('Reaction', error?.message || 'Could not add reaction.');
    }
  };

  const chooseMessageEffect = async (item: MessageRow, effect: typeof EFFECTS[number]['key']) => {
    if (!item.mine) {
      Alert.alert('Message effects', 'You can add a send effect to a message you sent.');
      return;
    }
    try {
      await upgrade20.setMessageEffect(conversationId, item.id, effect);
      setEffects(current => [...current.filter(row => row.message_id !== item.id), { message_id: item.id, effect_key: effect }]);
    } catch (error: any) {
      Alert.alert('Message effect', error?.message || 'Could not add this effect.');
    }
  };

  const pickMessageForReminder = (item: MessageRow) => {
    setReminderMessage(item.id);
    setSection('Reminders');
  };

  const sectionNames = ['Search','Library', ...(isGroup ? ['Members','Tags'] : []), 'Important','Reminders','Stickers','Effects','Settings'];

  const renderMessage = (item: MessageRow) => {
    const grouped = reactions.filter(row => row.message_id === item.id);
    const effect = effects.find(row => row.message_id === item.id);
    const body = String(item.body || (item.message_type === 'image' ? 'Photo' : item.message_type === 'video' ? 'Video' : item.message_type === 'file' ? 'Document' : 'Message'));
    return <View key={item.id} style={card}>
      <Text style={{ color: muted, fontSize: 10, fontWeight: '800' }}>{item.mine ? 'You' : 'MEMBER'} · {new Date(item.created_at).toLocaleString()}</Text>
      {item.message_type === 'image' && item.attachment_url
        ? <Image source={{ uri: item.attachment_url }} style={{ width: '100%', height: 175, borderRadius: 12, marginTop: 8 }} resizeMode="cover"/>
        : item.message_type === 'video'
          ? <Text style={{ color: ink, fontWeight: '800', marginTop: 8 }}>▶ {body}</Text>
          : <Text style={{ color: ink, lineHeight: 20, marginTop: 7 }}>{body.slice(0, 500)}</Text>}
      {effect ? <Text style={{ color: green, fontSize: 11, marginTop: 6, fontWeight: '900' }}>{EFFECTS.find(option => option.key === effect.effect_key)?.emoji} {effect.effect_key} effect</Text> : null}
      {grouped.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>{grouped.map(row => <Text key={row.id} style={{ backgroundColor: '#f2f7f3', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, color: ink, fontSize: 12 }}>{row.reaction}</Text>)}</View> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
        {REACTIONS.slice(0, 6).map(emoji => <TouchableOpacity key={emoji} onPress={() => void react(item.id, emoji)} style={{ backgroundColor: '#f4f8f5', borderRadius: 18, padding: 7 }}><Text style={{ fontSize: 16 }}>{emoji}</Text></TouchableOpacity>)}
        <Action label={savedIds.includes(item.id) ? '★ Saved' : '☆ Important'} onPress={() => void toggleSaved(item)}/>
        <Action label="↗ Remind me" onPress={() => pickMessageForReminder(item)}/>
      </View>
    </View>;
  };

  const renderContent = () => {
    if (section === 'Search') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Find anything in this chat</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 10 }}>Messages, photos, videos, links and files have separate filters.</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search this conversation…" placeholderTextColor={muted} style={{ backgroundColor: '#f3f7f3', borderRadius: 12, padding: 13, color: ink, marginBottom: 10 }}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 12 }}>
        {['messages','photos','videos','links','files'].map(type => <Action key={type} label={type[0].toUpperCase()+type.slice(1)} primary={searchType === type} onPress={() => setSearchType(type)}/>)}
      </ScrollView>
      {selectedSearchResults.length ? selectedSearchResults.slice(0, 100).map(renderMessage) : <Text style={{ color: muted, textAlign: 'center', padding: 26 }}>No matching items in the messages loaded on this device.</Text>}
    </View>;

    if (section === 'Library') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Shared chat library</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 10 }}>This chat’s photos, videos, documents, audio and links, kept separate from other chats.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 12 }}>
        {[['all','All'],['photos','Photos'],['videos','Videos'],['documents','Documents'],['links','Links'],['audio','Audio']].map(([key,label]) => <Action key={key} label={label} primary={libraryType === key} onPress={() => setLibraryType(key)}/>)}
      </ScrollView>
      <Action label={busy ? 'Refreshing…' : '↻ Build / refresh shared library'} disabled={busy} onPress={() => void indexLibrary()}/>
      <Text style={{ color: muted, fontSize: 10, marginTop: 8, marginBottom: 8 }}>{libraryRows.length} indexed shared items · {mediaMessages.length} matching items in loaded chat history</Text>
      {mediaMessages.length ? mediaMessages.slice(0, 100).map(renderMessage) : <Text style={{ color: muted, textAlign: 'center', padding: 24 }}>No matching shared media yet.</Text>}
    </View>;

    if (section === 'Members') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Group members · {members.length}</Text>
      {members.map(member => <View key={member.user_id} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {member.avatar_url ? <Image source={{ uri: member.avatar_url }} style={{ width: 38, height: 38, borderRadius: 19 }}/> : <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#e3f5e9', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: green, fontWeight: '900' }}>{(member.display_name || member.username || 'G').slice(0,1).toUpperCase()}</Text></View>}
        <View style={{ flex: 1 }}><Text style={{ color: ink, fontWeight: '800' }}>{member.display_name || 'Guftin member'}{member.user_id === userId ? ' · You' : ''}</Text><Text style={{ color: muted, fontSize: 10 }}>@{member.username || 'member'} · {member.role || 'member'}</Text></View>
      </View>)}
    </View>;

    if (section === 'Tags') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Member tags</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>Personal labels only you can see, such as “Work”, “Family” or “Admin”.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 10 }}>
        {members.filter(member => member.user_id !== userId).map(member => <Action key={member.user_id} label={member.display_name || member.username || 'Member'} primary={tagMember === member.user_id} onPress={() => setTagMember(member.user_id)}/>)}
      </ScrollView>
      <TextInput value={tagText} onChangeText={setTagText} placeholder="Tag name (up to 32 characters)" maxLength={32} placeholderTextColor={muted} style={{ backgroundColor: '#f3f7f3', borderRadius: 12, padding: 12, color: ink, marginBottom: 10 }}/>
      <Action primary label="Save member tag" disabled={!tagMember || !tagText.trim()} onPress={() => void addTag()}/>
      <SectionTitle>Saved tags</SectionTitle>
      {tags.length ? tags.map(row => <View key={row.id} style={{ ...card, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: ink, fontWeight: '800' }}>{members.find(member => member.user_id === row.member_user_id)?.display_name || 'Member'}</Text><Text style={{ color: green, fontWeight: '900' }}>{row.tag}</Text></View>) : <Text style={{ color: muted, padding: 12 }}>No member tags yet.</Text>}
    </View>;

    if (section === 'Important') {
      const important = activeMessages.filter(item => savedIds.includes(item.id));
      return <View><Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Important & saved messages</Text><Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>Keep the messages you need to find again quickly.</Text>
        {important.length ? important.map(renderMessage) : <Text style={{ color: muted, textAlign: 'center', padding: 26 }}>No important messages saved from this chat yet.</Text>}
      </View>;
    }

    if (section === 'Reminders') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Reply later reminders</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>Choose a message, then enter a future local date/time in ISO format.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingBottom: 10 }}>
        {activeMessages.slice(-20).reverse().map(item => <Action key={item.id} label={String(item.body || item.message_type).slice(0, 20)} primary={reminderMessage === item.id} onPress={() => setReminderMessage(item.id)}/>)}
      </ScrollView>
      <TextInput value={reminderAt} onChangeText={setReminderAt} placeholder="2026-12-01T18:30:00+05:00" placeholderTextColor={muted} style={{ backgroundColor: '#f3f7f3', borderRadius: 12, padding: 12, color: ink, marginBottom: 9 }}/>
      <TextInput value={reminderNote} onChangeText={setReminderNote} placeholder="Reminder note (optional)" placeholderTextColor={muted} style={{ backgroundColor: '#f3f7f3', borderRadius: 12, padding: 12, color: ink, marginBottom: 9 }}/>
      <Action label="Save reply reminder" primary disabled={!reminderMessage || !reminderAt.trim()} onPress={() => void createReminder()}/>
      <SectionTitle>Upcoming reminders</SectionTitle>
      {reminders.length ? reminders.map(row => <View key={row.id} style={card}><Text style={{ color: ink, fontWeight: '800' }}>{row.note || 'Reply to this message'}</Text><Text style={{ color: muted, fontSize: 11, marginTop: 4 }}>{new Date(row.remind_at).toLocaleString()}</Text></View>) : <Text style={{ color: muted, padding: 12 }}>No reply reminders scheduled.</Text>}
    </View>;

    if (section === 'Stickers') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Sticker library</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>Add your own transparent image stickers and send them in this chat or group.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 12 }}>
        {['😊','❤️','😂','🥳','✨','🎉'].map(emoji => <TouchableOpacity key={emoji} onPress={() => onSendSticker?.({ emoji, name: 'Emoji sticker' })} style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#edf6f0', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28 }}>{emoji}</Text></TouchableOpacity>)}
      </View>
      <Action primary label={busy ? 'Adding…' : '＋ Add custom sticker'} disabled={busy} onPress={() => void uploadSticker()}/>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 13 }}>
        {stickers.map(sticker => <TouchableOpacity key={sticker.id} onPress={() => sticker.signed_url && onSendSticker?.({ url: sticker.signed_url, name: sticker.sticker_name })} style={{ width: 100, backgroundColor: '#f5f8f5', borderRadius: 14, padding: 7, alignItems: 'center' }}>
          {sticker.signed_url ? <Image source={{ uri: sticker.signed_url }} style={{ width: 76, height: 76 }} resizeMode="contain"/> : <Text style={{ color: muted }}>Sticker</Text>}
          <Text numberOfLines={1} style={{ color: ink, fontSize: 10, marginTop: 4 }}>{sticker.sticker_name}</Text>
        </TouchableOpacity>)}
      </View>
      {!stickers.length ? <Text style={{ color: muted, padding: 12 }}>Your custom sticker packs will appear here.</Text> : null}
    </View>;

    if (section === 'Effects') return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Message send effects</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>Pick an effect for your next text message. Everyone in this conversation can see the effect attached to the message.</Text>
      {EFFECTS.map(effect => <TouchableOpacity key={effect.key} onPress={() => { onChooseEffect?.(effect.key); onClose(); }} style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ fontSize: 25 }}>{effect.emoji}</Text><View style={{ flex: 1 }}><Text style={{ color: ink, fontWeight: '900' }}>{effect.label}</Text><Text style={{ color: muted, fontSize: 10, marginTop: 2 }}>Apply to next sent message</Text></View><Text style={{ color: green, fontWeight: '900' }}>Choose ›</Text></TouchableOpacity>)}
      <SectionTitle>Effects already used in this chat</SectionTitle>
      {effects.length ? effects.map(row => <Text key={row.message_id} style={{ color: muted, fontSize: 11, paddingVertical: 5 }}>{row.effect_key} · {row.message_id.slice(0,8)}</Text>) : <Text style={{ color: muted, padding: 12 }}>No send effects used yet.</Text>}
    </View>;

    return <View>
      <Text style={{ color: ink, fontWeight: '900', fontSize: 17 }}>Chat notification preferences</Text>
      <Text style={{ color: muted, fontSize: 11, marginTop: 4, marginBottom: 14 }}>These settings are saved separately for this conversation.</Text>
      {[
        ['Notifications','notifications_enabled'],
        ['Vibration','vibration_enabled'],
        ['Show message preview','show_preview']
      ].map(([label,key]) => <View key={key} style={{ ...card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: ink, fontWeight: '800' }}>{label}</Text><Switch value={preferences[key]} onValueChange={value => void savePreferences({ [key]: value })} trackColor={{ false: '#d9e3dc', true: '#9bd8b2' }} thumbColor={preferences[key] ? green : '#f5f5f5'}/></View>)}
      <SectionTitle>Notification sound</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {['default','soft','bright','chime','silent'].map(sound => <Action key={sound} label={sound[0].toUpperCase()+sound.slice(1)} primary={preferences.sound_key === sound} onPress={() => void savePreferences({ sound_key: sound })}/>)}
      </View>
      <Text style={{ color: muted, fontSize: 10, marginTop: 11, lineHeight: 16 }}>The selected sound preference is stored per chat. Device-specific custom sound playback depends on the notification channel supported by the installed app build.</Text>
    </View>;
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: paper }}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 13, backgroundColor: panel, borderBottomWidth: 1, borderColor: line, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Text style={{ color: ink, fontSize: 19, fontWeight: '900' }}>Chat Experience</Text><Text numberOfLines={1} style={{ color: muted, fontSize: 11, marginTop: 3 }}>{conversationTitle}</Text></View>
        <TouchableOpacity onPress={onClose} style={{ padding: 9 }}><Text style={{ color: ink, fontSize: 25 }}>×</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: panel }} contentContainerStyle={{ gap: 7, paddingHorizontal: 12, paddingVertical: 10 }}>
        {sectionNames.map(name => <Action key={name} label={name} primary={section === name} onPress={() => setSection(name)}/>)}
      </ScrollView>
      {busy ? <View style={{ paddingVertical: 8 }}><ActivityIndicator color={green}/></View> : null}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, paddingBottom: 36 }}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
