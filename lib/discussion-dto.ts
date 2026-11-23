import { createHash } from 'node:crypto';

export const discussionAuthorSelect = { name: true, image: true } as const;

type DiscussionRow = {
  id: string;
  userId: string;
  parentMessageId: string | null;
  replyToMessageId: string | null;
  content: string;
  status: string;
  createdAt: Date;
  isEdited: boolean;
  deletedAt: Date | null;
  user?: { name: string | null; image: string | null };
  replies?: DiscussionRow[];
};

export type DiscussionMessage = {
  id: string;
  parentMessageId: string | null;
  replyToMessageId: string | null;
  content: string;
  status: string;
  createdAt: string;
  isEdited: boolean;
  author: { name: string; image: string | null; alias: string } | null;
  replies?: DiscussionMessage[];
};

export function discussionMessageDto(message: DiscussionRow): DiscussionMessage {
  const deleted = message.status === 'DELETED' || Boolean(message.deletedAt);
  const image = message.user?.image ?? '';
  return {
    id: message.id,
    parentMessageId: message.parentMessageId,
    replyToMessageId: message.replyToMessageId || message.parentMessageId,
    content: deleted ? '' : message.content,
    status: deleted ? 'DELETED' : message.status,
    createdAt: message.createdAt.toISOString(),
    isEdited: !deleted && message.isEdited,
    author: deleted ? null : {
      name: message.user?.name?.trim() || '',
      image: image.length <= 120_000 && /^data:image\/webp;base64,[a-z\d+/]+=*$/i.test(image) ? image : null,
      alias: createHash('sha256').update(message.userId).digest('hex').slice(0, 5).toUpperCase(),
    },
    ...(message.replies ? { replies: message.replies.map(discussionMessageDto) } : {}),
  };
}
