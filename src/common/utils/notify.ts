import { emitToUser } from '../../core/socket/socket.server';
import { sendPushToUsers, PushPayload } from './push';

/**
 * Single choke point for "tell a user something happened": emits the socket
 * event for an online user and mirrors it with a push for an offline one.
 *
 * Keeping both in one place means every event stays mirrored — new events
 * can't drift socket-only or push-only. Push is fire-and-forget so a slow
 * or failing Expo request never blocks the underlying action.
 */

export type NotifyInput = {
  userId: string;
  event: string;
  /** Socket payload (typed loosely — each event has its own shape). */
  payload: unknown;
  /** Push copy. Omit to stay socket-only (e.g. high-frequency internal events). */
  push?: PushPayload;
};

export function notifyUser({ userId, event, payload, push }: NotifyInput): void {
  emitToUser(userId, event, payload);
  if (push) {
    void sendPushToUsers([userId], push);
  }
}

/** Fan-out variant for events that target many users (e.g. a new nearby question). */
export function notifyUsers(userIds: string[], event: string, payload: unknown, push?: PushPayload): void {
  for (const userId of userIds) {
    emitToUser(userId, event, payload);
  }
  if (push && userIds.length > 0) {
    void sendPushToUsers(userIds, push);
  }
}
