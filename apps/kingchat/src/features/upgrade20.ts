import { supabase } from '../lib/supabase';

/**
 * Typed client-side access layer for Guftin's existing 20-feature schema.
 * All calls rely on Supabase Auth + table RLS; never use a service-role key here.
 */
const db = supabase as any;

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error('Sign in is required.');
  return data.user.id;
}

function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

export const upgrade20 = {
  // 1–3: device keys, encrypted backup metadata, and registered push devices.
  async listEncryptionDevices() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_e2ee_devices').select('id,device_label,platform,created_at,last_active_at,revoked_at').eq('user_id', userId).order('last_active_at', { ascending: false }));
  },
  async revokeEncryptionDevice(deviceId: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_e2ee_devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId).eq('user_id', userId).select().single());
  },
  async listEncryptedBackups() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_encrypted_backups').select('id,object_path,encryption_algorithm,byte_size,app_version,created_at').eq('user_id', userId).order('created_at', { ascending: false }));
  },
  async registerPushDevice(token: string, platform: 'ios' | 'android' | 'web') {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_device_tokens').upsert({ user_id: userId, token, platform }, { onConflict: 'token' }).select().maybeSingle());
  },

  // 5: privacy preferences. Per-person exceptions remain in their dedicated RLS table.
  async getPrivacySettings() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_user_privacy_settings').select('*').eq('user_id', userId).maybeSingle());
  },
  async savePrivacySettings(patch: Record<string, unknown>) {
    const userId = await requireUserId();
    const allowed = ['last_seen_visibility','online_visibility','profile_photo_visibility','about_visibility','read_receipts_enabled','group_invites_visibility'];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
    return unwrap(await db.from('kc_user_privacy_settings').upsert({ user_id: userId, ...safePatch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single());
  },

  // 7–9: scheduled messages, saved items, and chat folders.
  async listScheduledMessages() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_scheduled_messages').select('*').eq('sender_id', userId).order('scheduled_at', { ascending: true }));
  },
  async cancelScheduledMessage(id: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_scheduled_messages').delete().eq('id', id).eq('sender_id', userId).select().maybeSingle());
  },
  async listSavedItems() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
  },
  async saveMessage(conversationId: string, messageId: string, savedNote?: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_saved_items').upsert({ user_id: userId, conversation_id: conversationId, message_id: messageId, saved_note: savedNote ?? null }, { onConflict: 'user_id,message_id' }).select().single());
  },
  async removeSavedItem(id: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_saved_items').delete().eq('id', id).eq('user_id', userId));
  },
  async listChatFolders() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_chat_folders').select('*,kc_chat_folder_items(*)').eq('user_id', userId).order('sort_order'));
  },
  async createChatFolder(title: string, color = '#64748b') {
    const userId = await requireUserId();
    const cleanTitle = title.trim().slice(0, 40);
    if (!cleanTitle) throw new Error('Folder name is required.');
    return unwrap(await db.from('kc_chat_folders').insert({ user_id: userId, title: cleanTitle, color }).select().single());
  },

  // 13–15: group polls, events, and communities.
  async listPolls(conversationId: string) {
    return unwrap(await db.from('kc_polls').select('*,kc_poll_options(*),kc_poll_votes(*)').eq('conversation_id', conversationId).order('created_at', { ascending: false }));
  },
  async listGroupEvents(conversationId: string) {
    return unwrap(await db.from('kc_group_events').select('*,kc_group_event_rsvps(*)').eq('conversation_id', conversationId).is('cancelled_at', null).order('starts_at'));
  },
  async listCommunities() {
    return unwrap(await db.from('kc_communities').select('*,kc_community_groups(*),kc_community_members(*)').order('created_at', { ascending: false }));
  },

  // 16–18: business catalogue, quick replies, and channel analytics.
  async listBusinessProducts(ownerId?: string) {
    let query = db.from('kc_business_products').select('*').eq('is_published', true).order('created_at', { ascending: false });
    if (ownerId) query = query.eq('owner_id', ownerId);
    return unwrap(await query);
  },
  async saveBusinessProduct(product: { title: string; description?: string; price: number; currency_code: string; image_path?: string; availability?: string; is_published?: boolean }) {
    const userId = await requireUserId();
    if (!product.title.trim() || !Number.isFinite(product.price) || product.price < 0) throw new Error('A product title and valid price are required.');
    return unwrap(await db.from('kc_business_products').insert({ ...product, owner_id: userId, title: product.title.trim() }).select().single());
  },
  async listQuickReplies() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_business_quick_replies').select('*').eq('user_id', userId).order('shortcut'));
  },
  async listChannelAnalytics(conversationId: string, since?: string) {
    let query = db.from('kc_channel_analytics_events').select('event_type,created_at,message_id').eq('conversation_id', conversationId).order('created_at', { ascending: false });
    if (since) query = query.gte('created_at', since);
    return unwrap(await query);
  },

  // 10–11: encrypted transcription and translation envelopes.
  async getTranscription(messageId: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_message_transcriptions').select('*').eq('message_id', messageId).eq('user_id', userId).maybeSingle());
  },
  async getTranslation(messageId: string, targetLanguage: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_message_translations').select('*').eq('message_id', messageId).eq('user_id', userId).eq('target_language', targetLanguage).maybeSingle());
  },

  // 20: user reporting and appeal submission.
  async reportMessage(messageId: string, reason: string, details?: string) {
    const reporterId = await requireUserId();
    const cleanReason = reason.trim().slice(0, 80);
    if (!cleanReason) throw new Error('A report reason is required.');
    return unwrap(await db.from('kc_spam_reports').insert({ reporter_id: reporterId, message_id: messageId, reason: cleanReason, details: details?.trim().slice(0, 2000) ?? null }).select().single());
  },
  async listMyReports() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_spam_reports').select('*').eq('reporter_id', userId).order('created_at', { ascending: false }));
  },

  async getFeaturePreferences() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_feature_preferences').select('*').eq('user_id', userId).maybeSingle());
  },
  async saveFeaturePreferences(patch: Record<string, boolean>) {
    const userId = await requireUserId();
    const allowed = ['scheduled_messages_enabled','voice_transcription_enabled','automatic_translation_enabled','biometric_lock_enabled','encrypted_backup_enabled','anti_spam_protection_enabled'];
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => allowed.includes(key) && typeof value === 'boolean'));
    return unwrap(await db.from('kc_feature_preferences').upsert({ user_id: userId, ...safePatch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single());
  },
  async registerEncryptionDevice(input: { public_key: string; device_label: string; platform: 'ios' | 'android' | 'web' }) {
    const userId = await requireUserId();
    if (!input.public_key.trim() || !input.device_label.trim()) throw new Error('A device key and label are required.');
    return unwrap(await db.from('kc_e2ee_devices').insert({ user_id: userId, ...input, last_active_at: new Date().toISOString() }).select().single());
  },
  async createScheduledMessage(input: { conversation_id: string; body_envelope: string; message_type: string; attachment_path?: string | null; scheduled_at: string }) {
    const senderId = await requireUserId();
    const when = new Date(input.scheduled_at);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) throw new Error('Choose a future delivery time.');
    return unwrap(await db.from('kc_scheduled_messages').insert({ ...input, sender_id: senderId, delivery_status: 'pending' }).select().single());
  },
  async createPoll(input: { conversation_id: string; question_envelope: string; options: string[]; allows_multiple?: boolean; is_anonymous?: boolean; expires_at?: string | null }) {
    const creatorId = await requireUserId();
    const options = input.options.map(x => x.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 12) throw new Error('A poll needs 2 to 12 options.');
    const poll = unwrap(await db.from('kc_polls').insert({
      conversation_id: input.conversation_id, creator_id: creatorId, question_envelope: input.question_envelope,
      allows_multiple: input.allows_multiple ?? false, is_anonymous: input.is_anonymous ?? false, expires_at: input.expires_at ?? null
    }).select().single()) as { id: string };
    const rows = options.map((option_envelope, sort_order) => ({ poll_id: poll.id, option_envelope, sort_order }));
    const inserted = await db.from('kc_poll_options').insert(rows);
    if (inserted.error) {
      await db.from('kc_polls').delete().eq('id', poll.id).eq('creator_id', creatorId);
      throw inserted.error;
    }
    return poll;
  },
  async castPollVote(pollId: string, optionId: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_poll_votes').upsert({ poll_id: pollId, option_id: optionId, user_id: userId }, { onConflict: 'poll_id,option_id,user_id' }).select().single());
  },
  async respondToGroupEvent(eventId: string, response: 'yes' | 'no' | 'maybe') {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_group_event_rsvps').upsert({ event_id: eventId, user_id: userId, response, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' }).select().single());
  },
  async createQuickReply(shortcut: string, replyText: string) {
    const userId = await requireUserId();
    const key = shortcut.trim().replace(/^\\//, '').slice(0, 32);
    const value = replyText.trim().slice(0, 2000);
    if (!key || !value) throw new Error('Shortcut and reply text are required.');
    return unwrap(await db.from('kc_business_quick_replies').insert({ user_id: userId, shortcut: key, reply_text: value }).select().single());
  },
  async deleteQuickReply(id: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_business_quick_replies').delete().eq('id', id).eq('user_id', userId));
  },
  async createCommunity(title: string, descriptionEnvelope?: string) {
    const ownerId = await requireUserId();
    const cleanTitle = title.trim().slice(0, 80);
    if (!cleanTitle) throw new Error('Community name is required.');
    return unwrap(await db.from('kc_communities').insert({ owner_id: ownerId, title: cleanTitle, description_envelope: descriptionEnvelope ?? null }).select().single());
  },
  async addGroupToCommunity(communityId: string, conversationId: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_community_groups').insert({ community_id: communityId, conversation_id: conversationId, added_by: userId }).select().single());
  },
};
