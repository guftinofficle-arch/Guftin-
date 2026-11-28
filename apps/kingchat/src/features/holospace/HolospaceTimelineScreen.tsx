import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, Text,
  TouchableOpacity, View
} from 'react-native';
import { supabase } from '../../lib/supabase';

type TimelineEntry = {
  id: string;
  room_id: string;
  room_name: string;
  kind: 'memory' | 'gallery';
  body?: string | null;
  caption?: string | null;
  media_type?: string | null;
  mime_type?: string | null;
  object_path?: string | null;
  media_path?: string | null;
  signed_url?: string | null;
  created_at: string;
};

const palette = {
  bg: '#090f2d', panel: '#121b42', line: '#34416e',
  gold: '#e8c77a', muted: '#aeb9dc', white: '#ffffff', purple: '#8e70ff'
};

export function HolospaceTimelineScreen({ userId, onClose }: {
  userId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [ownedResult, memberResult] = await Promise.all([
        supabase.from('holospace_rooms')
          .select('id,name')
          .eq('owner_id', userId)
          .is('archived_at', null),
        supabase.from('holospace_members')
          .select('room_id')
          .eq('user_id', userId)
          .eq('invitation_status', 'active')
      ]);
      if (ownedResult.error) throw ownedResult.error;
      if (memberResult.error) throw memberResult.error;

      const roomIds = [...new Set([
        ...(ownedResult.data || []).map((room: any) => room.id),
        ...(memberResult.data || []).map((member: any) => member.room_id)
      ].filter(Boolean))];

      if (!roomIds.length) {
        setEntries([]);
        return;
      }

      const [roomResult, memoryResult, galleryResult] = await Promise.all([
        supabase.from('holospace_rooms')
          .select('id,name')
          .in('id', roomIds)
          .is('archived_at', null),
        supabase.from('holospace_memories')
          .select('id,room_id,body,media_path,author_id,created_at')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false })
          .limit(120),
        supabase.from('holospace_gallery')
          .select('id,room_id,object_path,media_type,mime_type,caption,uploaded_by,created_at')
          .in('room_id', roomIds)
          .order('created_at', { ascending: false })
          .limit(120)
      ]);
      if (roomResult.error) throw roomResult.error;
      if (memoryResult.error) throw memoryResult.error;
      if (galleryResult.error) throw galleryResult.error;

      const roomNames = new Map((roomResult.data || []).map((room: any) => [room.id, room.name]));
      const raw: TimelineEntry[] = [
        ...(memoryResult.data || []).map((row: any) => ({
          id: 'memory-' + row.id,
          room_id: row.room_id,
          room_name: String(roomNames.get(row.room_id) || 'HoloSpace'),
          kind: 'memory' as const,
          body: row.body || '',
          media_path: row.media_path,
          created_at: row.created_at
        })),
        ...(galleryResult.data || []).map((row: any) => ({
          id: 'gallery-' + row.id,
          room_id: row.room_id,
          room_name: String(roomNames.get(row.room_id) || 'HoloSpace'),
          kind: 'gallery' as const,
          caption: row.caption,
          object_path: row.object_path,
          media_type: row.media_type,
          mime_type: row.mime_type,
          created_at: row.created_at
        }))
      ];

      const signedEntries = await Promise.all(raw.map(async entry => {
        const path = entry.object_path || entry.media_path;
        if (!path) return entry;
        const { data, error } = await supabase.storage
          .from('holospace-gallery')
          .createSignedUrl(path, 60 * 60);
        if (error) {
          console.warn('HoloSpace media URL unavailable:', error.message);
          return entry;
        }
        return { ...entry, signed_url: data?.signedUrl || null };
      }));

      signedEntries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setEntries(signedEntries);
    } catch (error: any) {
      Alert.alert('HoloSpace timeline', error?.message || 'Could not load saved memories.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }}>
    <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={onClose} style={{ padding: 8, marginRight: 5 }}>
        <Text style={{ color: palette.gold, fontSize: 25 }}>‹</Text>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.white, fontSize: 21, fontWeight: '900' }}>HoloSpace Memories</Text>
        <Text style={{ color: palette.muted, fontSize: 10, marginTop: 3 }}>A timeline of your shared memories and saved media</Text>
      </View>
      <TouchableOpacity onPress={() => { setRefreshing(true); void load(); }} style={{ backgroundColor: palette.panel, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 }}>
        <Text style={{ color: palette.gold, fontWeight: '900' }}>↻</Text>
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ backgroundColor: '#1b2050', borderWidth: 1, borderColor: '#494478', borderRadius: 17, padding: 15, marginBottom: 16 }}>
        <Text style={{ color: palette.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1 }}>YOUR MEMORY TIMELINE</Text>
        <Text style={{ color: palette.white, fontSize: 13, lineHeight: 19, marginTop: 7 }}>Photos and memories from the HoloSpaces you own or have joined appear here, newest first.</Text>
      </View>
      {loading ? <ActivityIndicator color={palette.gold} size="large" style={{ marginTop: 24 }}/> : null}
      {!loading && !entries.length ? <View style={{ backgroundColor: palette.panel, borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 24, alignItems: 'center', marginTop: 5 }}>
        <Text style={{ fontSize: 40 }}>🌌</Text>
        <Text style={{ color: palette.white, fontSize: 16, fontWeight: '900', marginTop: 10 }}>Your timeline is ready</Text>
        <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 7 }}>When you or your HoloSpace members save a memory or add media to a room gallery, it will appear here.</Text>
      </View> : null}
      {entries.map(entry => {
        const isImage = String(entry.mime_type || entry.media_type || '').toLowerCase().includes('image');
        const isVideo = String(entry.mime_type || entry.media_type || '').toLowerCase().includes('video');
        return <View key={entry.id} style={{ backgroundColor: palette.panel, borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 13, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text numberOfLines={1} style={{ color: palette.gold, fontWeight: '900', fontSize: 11, flex: 1 }}>{entry.room_name} · {entry.kind === 'memory' ? 'MEMORY' : 'GALLERY'}</Text>
            <Text style={{ color: palette.muted, fontSize: 9, marginLeft: 8 }}>{new Date(entry.created_at).toLocaleDateString()}</Text>
          </View>
          {entry.signed_url && isImage ? <Image source={{ uri: entry.signed_url }} style={{ width: '100%', height: 210, borderRadius: 12, marginTop: 10, backgroundColor: '#080d22' }} resizeMode="cover"/> : null}
          {entry.signed_url && isVideo ? <View style={{ backgroundColor: '#0a1433', borderRadius: 12, padding: 18, marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: palette.white, fontSize: 30 }}>▶</Text>
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 5 }}>Saved video · open in HoloSpace to play</Text>
          </View> : null}
          {!!entry.body?.trim() ? <Text style={{ color: palette.white, fontSize: 13, lineHeight: 20, marginTop: 10 }}>{entry.body.trim()}</Text> : null}
          {!!entry.caption?.trim() ? <Text style={{ color: palette.white, fontSize: 13, lineHeight: 20, marginTop: 10 }}>{entry.caption.trim()}</Text> : null}
          {entry.signed_url && !isImage && !isVideo ? <Text style={{ color: palette.muted, fontSize: 11, marginTop: 10 }}>Saved media attachment</Text> : null}
          {!entry.signed_url && (entry.object_path || entry.media_path) ? <Text style={{ color: palette.muted, fontSize: 10, marginTop: 8 }}>Media is saved privately but could not be previewed on this device.</Text> : null}
          <Text style={{ color: palette.muted, fontSize: 9, marginTop: 10 }}>{new Date(entry.created_at).toLocaleString()}</Text>
        </View>;
      })}
    </ScrollView>
  </SafeAreaView>;
}
