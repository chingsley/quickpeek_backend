import type { QuestionFeedAttention } from './requestViewer.utils';

export type QuestionFeedSortItem = {
  id: string;
  userId: string;
  createdAt: Date | string;
  nearMe?: boolean;
  distanceKm?: number | null;
  feedAttention?: QuestionFeedAttention | null;
};

const tierForItem = (item: QuestionFeedSortItem, viewerId: string): number => {
  const unreadCount = item.feedAttention?.unreadMessageCount ?? 0;
  if (unreadCount > 0) return 1;

  const isIncoming = item.userId !== viewerId;
  if (isIncoming && item.nearMe) return 2;
  if (isIncoming) return 3;
  return 4;
};

const toTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/**
 * Default Home feed order for authenticated viewers with no filters:
 * 1. Unread messages (FIFO by earliest unread)
 * 2. Incoming nearby (distance ascending)
 * 3. Other incoming (createdAt descending)
 * 4. Outgoing (createdAt descending)
 */
export const sortQuestionFeedByDefaultPriority = <T extends QuestionFeedSortItem>(
  items: T[],
  viewerId: string,
): T[] =>
  [...items].sort((a, b) => {
    const tierA = tierForItem(a, viewerId);
    const tierB = tierForItem(b, viewerId);
    if (tierA !== tierB) return tierA - tierB;

    if (tierA === 1) {
      const unreadA =
        toTime(a.feedAttention?.earliestUnreadAt) ?? toTime(a.createdAt) ?? 0;
      const unreadB =
        toTime(b.feedAttention?.earliestUnreadAt) ?? toTime(b.createdAt) ?? 0;
      if (unreadA !== unreadB) return unreadA - unreadB;
    }

    if (tierA === 2) {
      const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (distA !== distB) return distA - distB;
    }

    const createdA = toTime(a.createdAt) ?? 0;
    const createdB = toTime(b.createdAt) ?? 0;
    if (createdA !== createdB) return createdB - createdA;

    return a.id.localeCompare(b.id);
  });
