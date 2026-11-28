export type ChannelAnalyticsEvent = 'view' | 'reaction' | 'share' | 'follow' | 'unfollow';

export async function recordChannelAnalyticsEvent(
  client: any,
  conversationId: string,
  actorId: string,
  eventType: ChannelAnalyticsEvent,
  messageId?: string
): Promise<void> {
  const { error } = await client.from('kc_channel_analytics_events').insert({
    conversation_id: conversationId,
    actor_id: actorId,
    event_type: eventType,
    ...(messageId ? { message_id: messageId } : {})
  });
  if (error) throw error;
}

export async function getChannelAnalytics(client: any, conversationId: string) {
  const [followers, posts, views, shares, follows] = await Promise.all([
    client.from('kc_channel_members').select('user_id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId).neq('role', 'owner'),
    client.from('kc_messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId),
    client.from('kc_channel_analytics_events').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId).eq('event_type', 'view'),
    client.from('kc_channel_analytics_events').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId).eq('event_type', 'share'),
    client.from('kc_channel_analytics_events').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId).eq('event_type', 'follow')
  ]);
  const firstError = [followers, posts, views, shares, follows].find(result => result.error)?.error;
  if (firstError) throw firstError;
  return {
    followers: followers.count || 0,
    posts: posts.count || 0,
    views: views.count || 0,
    shares: shares.count || 0,
    follows: follows.count || 0
  };
}
