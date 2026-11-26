import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import * as ExpoCrypto from 'expo-crypto';

export type LiveverseScope = 'chat' | 'group';
export type LiveverseTaskStatus = 'open' | 'completed';
export type LiveverseSpace = {
  id: string; name: string; description: string; scope: LiveverseScope;
  source_chat_id: string | null; owner_id: string; created_at: string; updated_at: string;
};
export type LiveverseTask = {
  id: string; space_id: string; title: string; details: string;
  status: LiveverseTaskStatus; assignee_id: string | null;
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};
export type LiveverseNote = {
  id: string; space_id: string; title: string; content: string; version: number;
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};
const MEDIA_BUCKET = 'liveverse-media';
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MEDIA_MIME_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime'
]);

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}
function assertText(value: string, max: number, label: string) {
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${label} must be between 1 and ${max} characters.`);
  return text;
}
export function createLiveverseClient(db: SupabaseClient) {
  const requireSpace = (spaceId: string) => assertUuid(spaceId, 'space ID');

  async function createSpace(input: {
    name: string; description?: string; scope: LiveverseScope; ownerId: string; sourceChatId?: string | null;
  }): Promise<LiveverseSpace> {
    const name = assertText(input.name, 80, 'Space name');
    assertUuid(input.ownerId, 'owner ID');
    if (input.sourceChatId) assertUuid(input.sourceChatId, 'chat ID');
    const { data, error } = await db.from('liveverse_spaces').insert({
      name, description: (input.description || '').trim().slice(0, 500),
      scope: input.scope, owner_id: input.ownerId, source_chat_id: input.sourceChatId || null
    }).select('*').single();
    if (error) throw error;
    return data as LiveverseSpace;
  }

  async function inviteMember(spaceId: string, userId: string) {
    requireSpace(spaceId); assertUuid(userId, 'user ID');
    const { error } = await db.from('liveverse_members').upsert(
      { space_id: spaceId, user_id: userId, role: 'member' },
      { onConflict: 'space_id,user_id', ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  async function leaveSpace(spaceId: string, userId: string) {
    requireSpace(spaceId); assertUuid(userId, 'user ID');
    const { error } = await db.from('liveverse_members')
      .delete().eq('space_id', spaceId).eq('user_id', userId);
    if (error) throw error;
  }

  async function listSpaces(): Promise<LiveverseSpace[]> {
    const { data, error } = await db.from('liveverse_spaces')
      .select('id,name,description,scope,source_chat_id,owner_id,created_at,updated_at')
      .is('archived_at', null).order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    return (data || []) as LiveverseSpace[];
  }

  async function createNote(spaceId: string, userId: string, title = 'Untitled note') {
    requireSpace(spaceId); assertUuid(userId, 'user ID');
    const { data, error } = await db.from('liveverse_notes').insert({
      space_id: spaceId, title: assertText(title, 120, 'Note title'),
      created_by: userId, updated_by: userId
    }).select('*').single();
    if (error) throw error;
    return data as LiveverseNote;
  }

  async function saveNote(input: {
    id: string; spaceId: string; userId: string; title: string;
    content: string; expectedVersion: number;
  }): Promise<LiveverseNote> {
    assertUuid(input.id, 'note ID'); requireSpace(input.spaceId); assertUuid(input.userId, 'user ID');
    if (input.content.length > 100000) throw new Error('Note is too long.');
    // Optimistic concurrency: stale writers get no row and must reload/merge.
    const { data, error } = await db.from('liveverse_notes').update({
      title: assertText(input.title, 120, 'Note title'),
      content: input.content, updated_by: input.userId,
      version: input.expectedVersion + 1, updated_at: new Date().toISOString()
    }).eq('id', input.id).eq('space_id', input.spaceId)
      .eq('version', input.expectedVersion).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This note changed elsewhere. Reload the latest version before saving.');
    return data as LiveverseNote;
  }

  async function listTasks(spaceId: string): Promise<LiveverseTask[]> {
    requireSpace(spaceId);
    const { data, error } = await db.from('liveverse_tasks').select('*')
      .eq('space_id', spaceId).order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return (data || []) as LiveverseTask[];
  }

  async function createTask(input: {
    spaceId: string; userId: string; title: string; details?: string; assigneeId?: string | null;
  }): Promise<LiveverseTask> {
    requireSpace(input.spaceId); assertUuid(input.userId, 'user ID');
    if (input.assigneeId) assertUuid(input.assigneeId, 'assignee ID');
    const { data, error } = await db.from('liveverse_tasks').insert({
      space_id: input.spaceId, title: assertText(input.title, 240, 'Task title'),
      details: (input.details || '').slice(0, 4000), assignee_id: input.assigneeId || null,
      created_by: input.userId, updated_by: input.userId
    }).select('*').single();
    if (error) throw error;
    return data as LiveverseTask;
  }

  async function updateTask(input: {
    taskId: string; spaceId: string; userId: string; patch: Partial<Pick<LiveverseTask,'title'|'details'|'status'|'assignee_id'>>;
  }) {
    assertUuid(input.taskId, 'task ID'); requireSpace(input.spaceId); assertUuid(input.userId, 'user ID');
    const patch: Record<string, unknown> = { updated_by: input.userId, updated_at: new Date().toISOString() };
    if (input.patch.title !== undefined) patch.title = assertText(input.patch.title, 240, 'Task title');
    if (input.patch.details !== undefined) patch.details = input.patch.details.slice(0, 4000);
    if (input.patch.status !== undefined) patch.status = input.patch.status;
    if (input.patch.assignee_id !== undefined) patch.assignee_id = input.patch.assignee_id;
    const { data, error } = await db.from('liveverse_tasks').update(patch)
      .eq('id', input.taskId).eq('space_id', input.spaceId).select('*').single();
    if (error) throw error;
    return data as LiveverseTask;
  }

  async function deleteTask(spaceId: string, taskId: string) {
    requireSpace(spaceId); assertUuid(taskId, 'task ID');
    const { error } = await db.from('liveverse_tasks').delete().eq('space_id', spaceId).eq('id', taskId);
    if (error) throw error;
  }

  async function saveCanvas(spaceId: string, userId: string, document: unknown, version: number) {
    requireSpace(spaceId); assertUuid(userId, 'user ID');
    if (!Number.isSafeInteger(version) || version < 1) throw new Error('Invalid canvas version.');
    const { data: current, error: readError } = await db.from('liveverse_canvas')
      .select('version').eq('space_id', spaceId).maybeSingle();
    if (readError) throw readError;
    if (!current) {
      const { data, error } = await db.from('liveverse_canvas').insert({
        space_id: spaceId, document, version: 1, updated_by: userId
      }).select('*').single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await db.from('liveverse_canvas').update({
      document, version: version + 1, updated_by: userId, updated_at: new Date().toISOString()
    }).eq('space_id', spaceId).eq('version', version).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Canvas changed elsewhere. Reload before saving.');
    return data;
  }

  async function uploadMedia(input: {
    spaceId: string; userId: string; uri: string; fileName: string;
    mimeType: string; bytes: number; mediaType: 'image'|'video'; body: Blob;
  }) {
    requireSpace(input.spaceId); assertUuid(input.userId, 'user ID');
    if (!MEDIA_MIME_TYPES.has(input.mimeType)) throw new Error('This media format is not supported.');
    if (input.bytes < 1 || input.bytes > MAX_MEDIA_BYTES) throw new Error('Media must be smaller than 100 MB.');
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'upload';
    const path = `${input.spaceId}/${input.userId}/${ExpoCrypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await db.storage.from(MEDIA_BUCKET).upload(path, input.body, {
      contentType: input.mimeType, upsert: false
    });
    if (uploadError) throw uploadError;
    const { data, error } = await db.from('liveverse_media').insert({
      space_id: input.spaceId, object_path: path, media_type: input.mediaType,
      mime_type: input.mimeType, byte_size: input.bytes, created_by: input.userId
    }).select('*').single();
    if (error) {
      await db.storage.from(MEDIA_BUCKET).remove([path]);
      throw error;
    }
    return data;
  }

  async function createSpaceChannel(spaceId: string, userId: string, onDatabaseChange: (payload: any) => void,
    onPresenceChange: (state: Record<string, unknown[]>) => void): Promise<RealtimeChannel> {
    requireSpace(spaceId); assertUuid(userId, 'user ID');
    const channel = db.channel(`liveverse:${spaceId}`, {
      config: { presence: { key: userId }, broadcast: { self: false, ack: true } }
    });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'liveverse_notes', filter: `space_id=eq.${spaceId}` }, onDatabaseChange);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'liveverse_tasks', filter: `space_id=eq.${spaceId}` }, onDatabaseChange);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'liveverse_canvas', filter: `space_id=eq.${spaceId}` }, onDatabaseChange);
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'liveverse_media', filter: `space_id=eq.${spaceId}` }, onDatabaseChange);
    channel.on('presence', { event: 'sync' }, () => onPresenceChange(channel.presenceState()));
    const status = await new Promise<string>((resolve) => {
      channel.subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') resolve(s); });
    });
    if (status !== 'SUBSCRIBED') {
      await db.removeChannel(channel);
      throw new Error(`Liveverse connection failed: ${status}`);
    }
    return channel;
  }

  async function trackPresence(channel: RealtimeChannel, userId: string, displayName: string) {
    assertUuid(userId, 'user ID');
    return channel.track({ user_id: userId, display_name: displayName.slice(0, 60), online_at: new Date().toISOString() });
  }

  async function broadcastPointer(channel: RealtimeChannel, input: {
    userId: string; displayName: string; x: number; y: number;
  }) {
    assertUuid(input.userId, 'user ID');
    if (![input.x, input.y].every(Number.isFinite)) throw new Error('Invalid pointer coordinates.');
    return channel.send({ type: 'broadcast', event: 'pointer', payload: {
      user_id: input.userId, display_name: input.displayName.slice(0, 60),
      x: Math.max(0, Math.min(1, input.x)), y: Math.max(0, Math.min(1, input.y)),
      sent_at: Date.now()
    }});
  }

  return { createSpace, inviteMember, leaveSpace, listSpaces, createNote, saveNote,
    listTasks, createTask, updateTask, deleteTask, saveCanvas, uploadMedia,
    createSpaceChannel, trackPresence, broadcastPointer };
}
