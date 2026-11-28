export interface FolderChat {
  id: string;
  kind: string;
  unread?: number | string | null;
}
export interface FolderDefinition {
  title: string;
  conversation_ids?: string[] | null;
}
export declare function shouldShowChatInFolder(chat: FolderChat | null | undefined, folder: FolderDefinition | null | undefined): boolean;
