export interface SelectedMessage {
  text: string;
  authorName: string;
  authorAvatarUrl: string | null;
  guildName?: string;
}

// Stores the most recently selected message per user (in-memory)
export const selectedMessages = new Map<string, SelectedMessage>();
