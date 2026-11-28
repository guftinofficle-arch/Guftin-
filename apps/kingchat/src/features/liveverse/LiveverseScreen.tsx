import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ActivityIndicator, Animated, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Audio } from 'expo-av';
import { LiveKitRoom, useLocalParticipant, useParticipants, useRoomContext } from '@livekit/react-native';
import { supabase } from '../../lib/supabase';
import { upgrade20 } from '../upgrade20';

type VoiceRoom = {
  id: string;
  space_id: string;
  title: string;
  host_id: string;
  status: 'active' | 'ended';
  created_at: string;
};
type Connection = { serverUrl: string; token: string; roomId: string; host: boolean };

const palette = {
  bg: '#07131f', panel: '#102536', panel2: '#153246', line: '#24475c',
  mint: '#73f0c0', white: '#f4fbff', muted: '#9bb4c3', red: '#ff6f7e'
};

function Action({ label, onPress, tone = 'normal', disabled = false }: any) {
  const backgroundColor = tone === 'danger' ? '#8d263c' : tone === 'primary' ? '#087e65' : palette.panel2;
  return (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={{ minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center', backgroundColor, borderWidth: 1,
        borderColor: tone === 'primary' ? '#39c99e' : palette.line, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: palette.white, fontWeight: '900', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ConnectedRoom({ connection, onLeave, onEnd }: {
  connection: Connection; onLeave: () => void; onEnd: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const room = useRoomContext();
  const [busy, setBusy] = useState(false);
  const [micError, setMicError] = useState('');
  const [reactions, setReactions] = useState<any[]>([]);
  const [reactionBusy, setReactionBusy] = useState(false);
  const reactionScale = React.useRef(new Animated.Value(1)).current;
  const loadReactions = useCallback(async () => {
    try { setReactions(await upgrade20.listLiveverseReactions(connection.roomId) as any[]); }
    catch (error: any) { console.warn('LIVEVERSE reactions could not load:', error?.message || error); }
  }, [connection.roomId]);
  useEffect(() => {
    void loadReactions();
    const channel = supabase.channel('liveverse-reactions-' + connection.roomId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'liveverse_reactions', filter: 'space_id=eq.' + connection.roomId }, payload => {
        const row = payload.new as any;
        setReactions(current => [row, ...current.filter(item => item.id !== row.id)].slice(0, 100));
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [connection.roomId, loadReactions]);
  const sendReaction = async (emoji: string) => {
    if (reactionBusy) return;
    setReactionBusy(true);
    try {
      const saved = await upgrade20.sendLiveverseReaction(connection.roomId, emoji);
      setReactions(current => [saved, ...current].slice(0, 100));
      reactionScale.setValue(0.72);
      Animated.spring(reactionScale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
    } catch (error: any) {
      Alert.alert('LIVEVERSE reaction', error?.message || 'Could not send your reaction.');
    } finally { setReactionBusy(false); }
  };
  const reactionEmojis = ['❤️','👏','🔥','🎉','😂','✨','🙌','💯'];

  const toggleMic = async () => {
    if (busy) return;
    setBusy(true);
    setMicError('');
    try {
      if (!isMicrophoneEnabled) {
        const permission = await Audio.getPermissionsAsync();
        if (!permission.granted) {
          const requested = await Audio.requestPermissionsAsync();
          if (!requested.granted) throw new Error('Microphone permission is required to speak.');
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
      }
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (error: any) {
      setMicError(error?.message || 'Could not change microphone state.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    try { await room.disconnect(); } finally { onLeave(); }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', paddingTop: 42 }}>
        <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: '#0b765f',
          borderWidth: 2, borderColor: palette.mint, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 42 }}>♫</Text>
        </View>
        <Text style={{ color: palette.white, fontSize: 23, fontWeight: '900', marginTop: 20 }}>آپ LIVEVERSE میں ہیں</Text>
        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 8 }}>
          {participants.length} connected · Live voice room
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 24 }}>
          {participants.map((participant: any) => (
            <View key={participant.identity} style={{ backgroundColor: palette.panel2, borderRadius: 20,
              paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: palette.line }}>
              <Text style={{ color: palette.white, fontSize: 11, fontWeight: '800' }}>
                {participant.name || participant.identity.slice(0, 8)}
                {participant.isLocal ? ' · You' : ''}
              </Text>
            </View>
          ))}
        </View>
        {micError ? <Text style={{ color: palette.red, marginTop: 14, textAlign: 'center' }}>{micError}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 4, marginBottom: 14 }}>
        <Text style={{ color: palette.white, fontWeight: '900', fontSize: 13, marginBottom: 9 }}>Live reactions</Text>
        <Animated.View style={{ transform: [{ scale: reactionScale }], flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {reactionEmojis.map(emoji => <TouchableOpacity key={emoji} disabled={reactionBusy} onPress={() => void sendReaction(emoji)} style={{ minWidth: 42, paddingHorizontal: 9, paddingVertical: 9, borderRadius: 14, backgroundColor: palette.panel2, borderWidth: 1, borderColor: palette.line, alignItems: 'center', opacity: reactionBusy ? 0.6 : 1 }}><Text style={{ fontSize: 19 }}>{emoji}</Text></TouchableOpacity>)}
        </Animated.View>
        <Text style={{ color: palette.muted, fontSize: 10, marginTop: 8 }}>Recent reactions · {reactions.length}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{reactions.slice(0, 12).map((item:any,index:number)=><Text key={item.id||String(index)} style={{ backgroundColor: palette.panel2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, color: palette.white }}>{item.reaction}</Text>)}</View>
      </View>
      <View style={{ paddingBottom: 28, gap: 12 }}>
        <Action label={isMicrophoneEnabled ? '🎙  مائیک بند کریں' : '🎙  مائیک آن کریں'}
          onPress={() => void toggleMic()} disabled={busy} tone={isMicrophoneEnabled ? 'primary' : 'normal'} />
        {connection.host
          ? <Action label="End room for everyone" onPress={onEnd} tone="danger" />
          : <Action label="Leave room" onPress={() => void leave()} tone="danger" />}
      </View>
    </View>
  );
}

export function LiveverseScreen({ chatId, chatTitle, chatKind, userId, onClose }: {
  chatId: string; chatTitle: string; chatKind: string; userId: string; onClose: () => void;
}) {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [title, setTitle] = useState(chatTitle ? chatTitle + ' Voice Room' : 'Guftin Voice Room');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const mounted = useRef(true);

  const loadRooms = useCallback(async () => {
    const { data, error } = await supabase.from('liveverse_voice_rooms')
      .select('id,space_id,title,host_id,status,created_at')
      .eq('source_chat_id', chatId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    if (mounted.current) setRooms((data || []) as VoiceRoom[]);
  }, [chatId]);

  useEffect(() => {
    mounted.current = true;
    void loadRooms().catch((error: any) => Alert.alert('LIVEVERSE', error?.message || 'Could not load rooms.'))
      .finally(() => { if (mounted.current) setLoading(false); });
    const channel = supabase.channel('liveverse-rooms-' + chatId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liveverse_voice_rooms', filter: 'source_chat_id=eq.' + chatId },
        () => { void loadRooms().catch(() => {}); })
      .subscribe();
    return () => { mounted.current = false; void supabase.removeChannel(channel); };
  }, [chatId, loadRooms]);

  const connectToSpace = async (spaceId: string, host: boolean) => {
    const permission = await Audio.getPermissionsAsync();
    if (!permission.granted) {
      const requested = await Audio.requestPermissionsAsync();
      if (!requested.granted) throw new Error('LIVEVERSE needs microphone permission to join a voice room.');
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true, playsInSilentModeIOS: true,
      shouldDuckAndroid: true, playThroughEarpieceAndroid: false
    });
    const { data, error } = await supabase.functions.invoke('liveverse-livekit-token', { body: { space_id: spaceId } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!data?.server_url || !data?.participant_token) throw new Error('Voice service returned an incomplete connection token.');
    if (mounted.current) setConnection({
      serverUrl: data.server_url, token: data.participant_token, roomId: spaceId, host
    });
  };

  const createRoom = async () => {
    const roomTitle = title.trim();
    if (!roomTitle || busy) return;
    setBusy(true);
    try {
      const { data: space, error: spaceError } = await supabase.from('liveverse_spaces').insert({
        name: roomTitle, description: 'Live voice room', scope: chatKind === 'group' ? 'group' : 'chat',
        source_chat_id: chatId, owner_id: userId
      }).select('id').single();
      if (spaceError) throw spaceError;
      const { error: roomError } = await supabase.from('liveverse_voice_rooms').insert({
        space_id: space.id, source_chat_id: chatId, title: roomTitle, host_id: userId, status: 'active'
      });
      if (roomError) throw roomError;
      const { error: hostMemberError } = await supabase.from('liveverse_members').upsert({ space_id: space.id, user_id: userId, role: 'owner' }, { onConflict: 'space_id,user_id' });
      if (hostMemberError) throw hostMemberError;
      await connectToSpace(space.id, true);
    } catch (error: any) {
      Alert.alert('LIVEVERSE room not started', error?.message || 'Please try again.');
      await loadRooms().catch(() => {});
    } finally { if (mounted.current) setBusy(false); }
  };

  const joinRoom = async (room: VoiceRoom) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('liveverse_members').upsert({
        space_id: room.space_id, user_id: userId, role: 'member'
      }, { onConflict: 'space_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
      await connectToSpace(room.space_id, room.host_id === userId);
    } catch (error: any) {
      Alert.alert('Could not join LIVEVERSE', error?.message || 'Please try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  const leaveRoom = async () => {
    if (connection && !connection.host) {
      await supabase.from('liveverse_members').delete().eq('space_id', connection.roomId).eq('user_id', userId);
    }
    if (mounted.current) setConnection(null);
    await loadRooms().catch(() => {});
  };

  const endRoom = async () => {
    if (!connection || !connection.host || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('liveverse_voice_rooms')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('space_id', connection.roomId).eq('host_id', userId);
      if (error) throw error;
      const { error: archiveError } = await supabase.from('liveverse_spaces')
        .update({ archived_at: new Date().toISOString() }).eq('id', connection.roomId);
      if (archiveError) throw archiveError;
      await supabase.from('liveverse_members').delete().eq('space_id', connection.roomId).eq('user_id', userId);
      setConnection(null);
      await loadRooms();
    } catch (error: any) {
      Alert.alert('Could not end room', error?.message || 'Please try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  if (connection) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: 20 }}>
        <LiveKitRoom serverUrl={connection.serverUrl} token={connection.token} connect={true} audio={true} video={false}
          onDisconnected={() => { if (mounted.current) void leaveRoom(); }}>
          <ConnectedRoom connection={connection} onLeave={() => void leaveRoom()} onEnd={() => void endRoom()} />
        </LiveKitRoom>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg, paddingHorizontal: 18, paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.mint, fontSize: 11, fontWeight: '900', letterSpacing: 2 }}>GUFTIN · LIVEVERSE</Text>
          <Text style={{ color: palette.white, fontSize: 25, fontWeight: '900', marginTop: 5 }}>Voice Rooms</Text>
          <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>{chatTitle}</Text>
        </View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" style={{ padding: 11, borderRadius: 13, backgroundColor: palette.panel2 }}>
          <Text style={{ color: palette.white, fontSize: 20, fontWeight: '900' }}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={{ backgroundColor: palette.panel, borderColor: palette.line, borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 18 }}>
        <Text style={{ color: palette.white, fontSize: 15, fontWeight: '900' }}>Start a voice room</Text>
        <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="Room name"
          placeholderTextColor={palette.muted} style={{ color: palette.white, backgroundColor: palette.bg,
            borderRadius: 12, borderWidth: 1, borderColor: palette.line, padding: 13, marginTop: 12 }} />
        <View style={{ marginTop: 12 }}>
          <Action label={busy ? 'Starting…' : '＋  Create Voice Room'} onPress={() => void createRoom()}
            tone="primary" disabled={busy || !title.trim()} />
        </View>
      </View>
      <Text style={{ color: palette.white, fontSize: 16, fontWeight: '900', marginBottom: 10 }}>Active rooms</Text>
      {loading ? <ActivityIndicator color={palette.mint} style={{ marginTop: 24 }} /> : (
        <ScrollView contentContainerStyle={{ paddingBottom: 30, gap: 10 }}>
          {rooms.length === 0 ? <View style={{ backgroundColor: palette.panel, borderRadius: 16, padding: 18 }}>
            <Text style={{ color: palette.muted, textAlign: 'center', lineHeight: 20 }}>ابھی کوئی فعال روم نہیں۔ پہلا Voice Room بنائیں۔</Text>
          </View> : rooms.map(room => (
            <View key={room.id} style={{ backgroundColor: palette.panel, borderColor: palette.line, borderWidth: 1,
              borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#0b765f', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 21 }}>♫</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: palette.white, fontWeight: '900' }}>{room.title}</Text>
                <Text style={{ color: palette.muted, fontSize: 10, marginTop: 3 }}>LIVE · {room.host_id === userId ? 'Your room' : 'Tap to join'}</Text>
              </View>
              <TouchableOpacity disabled={busy} onPress={() => void joinRoom(room)}
                style={{ backgroundColor: '#087e65', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, opacity: busy ? 0.5 : 1 }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>Join</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
