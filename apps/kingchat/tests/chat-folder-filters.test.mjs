import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldShowChatInFolder } from '../src/features/chat/chatFolderFilters.mjs';

describe('default chat folder filtering', () => {
  it('shows all direct conversations in Friends without manual membership', () => {
    assert.equal(shouldShowChatInFolder({ id: 'd1', kind: 'direct' }, { title: 'Friends', conversation_ids: [] }), true);
  });

  it('does not show groups, channels, or announcements in Friends', () => {
    const folder = { title: 'Friends', conversation_ids: [] };
    assert.equal(shouldShowChatInFolder({ id: 'g1', kind: 'group' }, folder), false);
    assert.equal(shouldShowChatInFolder({ id: 'c1', kind: 'channel' }, folder), false);
    assert.equal(shouldShowChatInFolder({ id: 'a1', kind: 'announcement' }, folder), false);
  });

  it('shows all group conversations in Groups without manual membership', () => {
    assert.equal(shouldShowChatInFolder({ id: 'g1', kind: 'group' }, { title: 'Groups', conversation_ids: [] }), true);
  });

  it('shows only conversations with unread messages in Unread', () => {
    const folder = { title: 'Unread', conversation_ids: [] };
    assert.equal(shouldShowChatInFolder({ id: 'd1', kind: 'direct', unread: 2 }, folder), true);
    assert.equal(shouldShowChatInFolder({ id: 'd2', kind: 'direct', unread: 0 }, folder), false);
  });

  it('keeps Important and custom folders explicitly curated', () => {
    assert.equal(shouldShowChatInFolder({ id: 'd1', kind: 'direct' }, { title: 'Important', conversation_ids: [] }), false);
    assert.equal(shouldShowChatInFolder({ id: 'd1', kind: 'direct' }, { title: 'Important', conversation_ids: ['d1'] }), true);
    assert.equal(shouldShowChatInFolder({ id: 'd2', kind: 'direct' }, { title: 'Work', conversation_ids: ['d1'] }), false);
  });
});
