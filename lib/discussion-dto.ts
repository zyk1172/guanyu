function replyDto(message: any, includeAdmin: boolean) {
  return discussionMessageDto(message, includeAdmin);
}

export function discussionMessageDto(message: any, includeAdmin = false) {
  const dto: Record<string, unknown> = {
    id: message.id,
    content: message.deletedAt ? '该内容已删除。' : message.content,
    languageCode: message.languageCode,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    isEdited: message.isEdited,
    author: {
      name: message.user?.name || '',
    },
  };
  if (message.replies) {
    dto.replies = message.replies.map((reply: any) => replyDto(reply, includeAdmin));
  }
  if (includeAdmin) {
    dto.userId = message.userId;
    dto.status = message.status;
    dto.deletedAt = message.deletedAt;
    dto.reportVersionAtPost = message.reportVersionAtPost;
  }
  return dto;
}
