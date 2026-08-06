import { sortQuestionFeedByDefaultPriority } from '../../src/common/utils/questionFeedSort.utils';

const viewerId = 'viewer-1';
const otherId = 'author-1';

const baseItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'q-default',
  userId: otherId,
  createdAt: '2026-01-01T10:00:00.000Z',
  eligible: false,
  distanceKm: null,
  feedAttention: {
    hasAttention: false,
    unreadMessageCount: 0,
    earliestUnreadAt: null,
    pendingIncomingCount: 0,
    acceptedChatCount: 0,
    primaryChatRequestId: null,
  },
  ...overrides,
});

describe('sortQuestionFeedByDefaultPriority', () => {
  it('orders tiers: unread FIFO, nearby no-request, other no-request, interacted read, outgoing', () => {
    const items = [
      baseItem({ id: 'out-old', userId: viewerId, createdAt: '2026-01-01T08:00:00.000Z' }),
      baseItem({ id: 'out-new', userId: viewerId, createdAt: '2026-01-03T08:00:00.000Z' }),
      baseItem({
        id: 'interacted-old',
        viewerRequest: { id: 'r1', status: 'ACCEPTED', rejectionReason: null, hasResponded: true, unreadCount: 0, isBlocked: false },
        createdAt: '2026-01-01T09:00:00.000Z',
      }),
      baseItem({
        id: 'interacted-new',
        viewerRequest: { id: 'r2', status: 'ACCEPTED', rejectionReason: null, hasResponded: true, unreadCount: 0, isBlocked: false },
        createdAt: '2026-01-02T09:00:00.000Z',
      }),
      baseItem({
        id: 'incoming-far-old',
        latitude: 45,
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
      baseItem({
        id: 'incoming-far-new',
        latitude: 45.1,
        createdAt: '2026-01-02T10:00:00.000Z',
      }),
      baseItem({
        id: 'near-far',
        nearMe: true,
        eligible: true,
        distanceKm: 1.2,
        latitude: 44.62,
        longitude: -63.62,
      }),
      baseItem({
        id: 'near-close',
        nearMe: true,
        eligible: true,
        distanceKm: 0.1,
        latitude: 44.6126,
        longitude: -63.6192,
      }),
      baseItem({
        id: 'unread-new',
        viewerRequest: { id: 'r3', status: 'ACCEPTED', rejectionReason: null, hasResponded: false, unreadCount: 2, isBlocked: false },
        feedAttention: {
          hasAttention: true,
          unreadMessageCount: 2,
          earliestUnreadAt: '2026-07-02T10:00:00.000Z',
          pendingIncomingCount: 0,
          acceptedChatCount: 1,
          primaryChatRequestId: 'r3',
        },
      }),
      baseItem({
        id: 'unread-old',
        viewerRequest: { id: 'r4', status: 'ACCEPTED', rejectionReason: null, hasResponded: false, unreadCount: 1, isBlocked: false },
        feedAttention: {
          hasAttention: true,
          unreadMessageCount: 1,
          earliestUnreadAt: '2026-07-01T10:00:00.000Z',
          pendingIncomingCount: 0,
          acceptedChatCount: 1,
          primaryChatRequestId: 'r4',
        },
      }),
    ];

    const sorted = sortQuestionFeedByDefaultPriority(items, viewerId).map((q) => q.id);

    expect(sorted).toEqual([
      'unread-old',
      'unread-new',
      'near-close',
      'near-far',
      'incoming-far-new',
      'incoming-far-old',
      'interacted-new',
      'interacted-old',
      'out-new',
      'out-old',
    ]);
  });

  it('places incoming with a request but no unread above outgoing and below no-request incoming', () => {
    const items = [
      baseItem({ id: 'out', userId: viewerId }),
      baseItem({
        id: 'with-req',
        viewerRequest: { id: 'r1', status: 'PENDING', rejectionReason: null, hasResponded: false, unreadCount: 0, isBlocked: false },
      }),
      baseItem({ id: 'no-req', eligible: false }),
    ];

    const sorted = sortQuestionFeedByDefaultPriority(items, viewerId).map((q) => q.id);
    expect(sorted).toEqual(['no-req', 'with-req', 'out']);
  });
});
