export function shouldShowChatInFolder(chat, folder) {
  if (!chat || !folder) return false;

  const title = String(folder.title || '').trim().toLowerCase();
  const conversationIds = Array.isArray(folder.conversation_ids) ? folder.conversation_ids : [];

  if (title === 'unread') return Number(chat.unread) > 0;
  if (title === 'friends') return chat.kind === 'direct';
  if (title === 'groups') return chat.kind === 'group';

  return Boolean(chat.id && conversationIds.includes(chat.id));
}
