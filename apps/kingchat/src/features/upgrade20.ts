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
    let query = db.from('kc_business_products').select('*').order('created_at', { ascending: false });
    query = ownerId ? query.eq('owner_id', ownerId) : query.eq('is_published', true);
    return unwrap(await query);
  },
  async updateBusinessProduct(id: string, patch: { title?: string; description?: string; price?: number; currency_code?: string; image_path?: string | null; availability?: 'available' | 'out_of_stock' | 'preorder'; is_published?: boolean }) {
    const userId = await requireUserId();
    const safe: Record<string, unknown> = {};
    if (patch.title !== undefined) safe.title = patch.title.trim().slice(0, 120);
    if (patch.description !== undefined) safe.description = patch.description;
    if (patch.price !== undefined) {
      if (!Number.isFinite(patch.price) || patch.price < 0) throw new Error('Enter a valid non-negative price.');
      safe.price = patch.price;
    }
    if (patch.currency_code !== undefined) {
      if (!/^[A-Z]{3}$/.test(patch.currency_code)) throw new Error('Currency must be a three-letter ISO code.');
      safe.currency_code = patch.currency_code;
    }
    if (patch.image_path !== undefined) safe.image_path = patch.image_path;
    if (patch.availability !== undefined) safe.availability = patch.availability;
    if (patch.is_published !== undefined) safe.is_published = patch.is_published;
    if (safe.title === '') throw new Error('A product title is required.');
    return unwrap(await db.from('kc_business_products').update({ ...safe, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', userId).select().single());
  },
  async deleteBusinessProduct(id: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_business_products').delete().eq('id', id).eq('owner_id', userId));
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
  async saveTranscriptionEnvelope(messageId: string, transcriptEnvelope: string, languageCode?: string) {
    const userId = await requireUserId();
    if (!transcriptEnvelope.trim()) throw new Error('Encrypted transcript is required.');
    return unwrap(await db.from('kc_message_transcriptions').upsert({ message_id: messageId, user_id: userId, transcript_envelope: transcriptEnvelope, language_code: languageCode ?? null }, { onConflict: 'message_id,user_id' }).select().single());
  },
  async saveTranslationEnvelope(messageId: string, targetLanguage: string, translationEnvelope: string) {
    const userId = await requireUserId();
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(targetLanguage) || !translationEnvelope.trim()) throw new Error('A valid target language and encrypted translation are required.');
    return unwrap(await db.from('kc_message_translations').upsert({ message_id: messageId, user_id: userId, target_language: targetLanguage, translation_envelope: translationEnvelope }, { onConflict: 'message_id,user_id,target_language' }).select().single());
  },

  // 20: user reporting and appeal submission.
  async reportMessage(messageId: string, reason: string, details?: string) {
    const reporterId = await requireUserId();
    const cleanReason = reason.trim().slice(0, 80);
    if (!cleanReason) throw new Error('A report reason is required.');
    return unwrap(await db.from('kc_spam_reports').insert({ reporter_id: reporterId, message_id: messageId, reason: cleanReason, details: details?.trim().slice(0, 2000) ?? null }).select().single());
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
  async createScheduledMessage(input: { conversation_id: string; body_envelope?: string | null; message_type: 'text' | 'image' | 'video' | 'audio' | 'file'; attachment_path?: string | null; scheduled_at: string }) {
    const senderId = await requireUserId();
    const when = new Date(input.scheduled_at);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) throw new Error('Choose a future delivery time.');
    if (!input.body_envelope && !input.attachment_path) throw new Error('A scheduled message needs encrypted text or an attachment.');
    return unwrap(await db.from('kc_scheduled_messages').insert({ ...input, sender_id: senderId, delivery_status: 'queued' }).select().single());
  },
  async cancelQueuedMessage(id: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_scheduled_messages').update({ delivery_status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('sender_id', userId).in('delivery_status', ['queued','failed']).select().maybeSingle());
  },
  async listMessageEditHistory(messageId: string) {
    return unwrap(await db.from('kc_message_edit_history').select('id,message_id,editor_id,previous_body_envelope,new_body_envelope,edited_at').eq('message_id', messageId).order('edited_at', { ascending: false }));
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
  async closePoll(pollId: string) {
    return unwrap(await db.from('kc_polls').update({ closed_at: new Date().toISOString() }).eq('id', pollId).is('closed_at', null).select().single());
  },
  async respondToGroupEvent(eventId: string, response: 'going' | 'maybe' | 'not_going') {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_group_event_rsvps').upsert({ event_id: eventId, user_id: userId, response, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' }).select().single());
  },
  async cancelGroupEvent(eventId: string) {
    return unwrap(await db.from('kc_group_events').update({ cancelled_at: new Date().toISOString() }).eq('id', eventId).is('cancelled_at', null).select().single());
  },
  async createGroupEvent(input: { conversation_id: string; title_envelope: string; details_envelope?: string | null; location_envelope?: string | null; starts_at: string; ends_at?: string | null; reminder_minutes?: number }) {
    const creatorId = await requireUserId();
    const start = new Date(input.starts_at);
    const end = input.ends_at ? new Date(input.ends_at) : null;
    if (!input.title_envelope.trim() || !Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start))) {
      throw new Error('Enter a valid event title and start/end time.');
    }
    const reminder = input.reminder_minutes ?? 15;
    if (!Number.isInteger(reminder) || reminder < 0 || reminder > 10080) throw new Error('Reminder must be between 0 and 10080 minutes.');
    return unwrap(await db.from('kc_group_events').insert({
      ...input, creator_id: creatorId, reminder_minutes: reminder
    }).select().single());
  },
  async listMyReports() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_spam_reports').select('id,target_user_id,message_id,reason,details,status,created_at').eq('reporter_id', userId).order('created_at', { ascending: false }));
  },
  async listReportsAboutMe() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_spam_reports').select('id,reporter_id,message_id,reason,status,created_at').eq('target_user_id', userId).order('created_at', { ascending: false }));
  },
  async listMyAppeals() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_spam_appeals').select('*').eq('appellant_id', userId).order('created_at', { ascending: false }));
  },
  async submitAppeal(reportId: string, appealText: string) {
    const userId = await requireUserId();
    const cleanText = appealText.trim().slice(0, 3000);
    if (cleanText.length < 10) throw new Error('An appeal must contain at least 10 characters.');
    return unwrap(await db.from('kc_spam_appeals').insert({ report_id: reportId, appellant_id: userId, appeal_text: cleanText }).select().single());
  },
  async listBlockedUsers() {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_user_blocks').select('blocked_user_id,created_at').eq('blocker_id', userId).order('created_at', { ascending: false }));
  },
  async blockUser(blockedUserId: string) {
    const userId = await requireUserId();
    if (!blockedUserId || blockedUserId === userId) throw new Error('Choose another Guftin user to block.');
    return unwrap(await db.from('kc_user_blocks').upsert({ blocker_id: userId, blocked_user_id: blockedUserId }, { onConflict: 'blocker_id,blocked_user_id' }).select().single());
  },
  async unblockUser(blockedUserId: string) {
    const userId = await requireUserId();
    return unwrap(await db.from('kc_user_blocks').delete().eq('blocker_id', userId).eq('blocked_user_id', blockedUserId));
  },
  async createQuickReply(shortcut: string, replyText: string) {
    const userId = await requireUserId();
    const key = shortcut.trim().replace(/^\/+/, '').slice(0, 32);
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
