import prisma from '../../core/database/prisma/client';
import { pushReceiptQueue, PUSH_RECEIPT_DELAY_MS } from '../../core/queues/pushReceiptQueue';

/**
 * Expo Push API delivery.
 *
 * The app registers an Expo push token (`ExponentPushToken[...]`) at
 * sign-in and cold start; EAS attaches Apple push credentials at build
 * time, so delivery to APNs needs no extra backend config. We call Expo's
 * HTTP API directly rather than a provider SDK so no new env vars are
 * required.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo recommends batching; 100 is the documented max per request. */
const CHUNK_SIZE = 100;

export type PushPayload = {
  title: string;
  body: string;
  /** Opaque payload handed to the app's notification listeners. */
  data?: Record<string, unknown>;
};

type ExpoPushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Ticket returned by Expo for each message in a /send response. */
type ExpoTicket = {
  status: 'ok' | 'error';
  /** Present when status === 'ok' — used to look up the delivery receipt. */
  id?: string;
  /** Present when status === 'error'. */
  message?: string;
  details?: { error?: string; };
};

/** Receipt returned by Expo per ticket id. */
type ExpoReceipt = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string; };
};

/**
 * Errors that mean the device token is permanently invalid and must be
 * pruned — continuing to push to it wastes a network round-trip per send.
 */
const DEAD_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'InvalidAccessToken',
]);

export function isExpoPushToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^ExponentPushToken\[.+\]$/.test(token);
}

/**
 * Clear a dead token so we stop pushing to it.
 *
 * Deliberately does NOT touch `notificationsEnabled`: an empty token already
 * fails `isExpoPushToken`, so clearing it is enough to stop delivery. Turning
 * the flag off as well would be a trap — the cold-start sync only re-syncs the
 * token (never the preference, so it can't override the Settings toggle), so a
 * routine token rotation would leave the user with push disabled forever.
 */
async function pruneTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await prisma.user.updateMany({
      where: { deviceToken: { in: tokens } },
      data: { deviceToken: '' },
    });
  } catch (err) {
    console.error('prune dead tokens failed', err);
  }
}

/** Lowest-level send: posts one batch of messages to Expo and returns their tickets. */
async function postChunk(messages: ExpoPushMessage[]): Promise<ExpoTicket[]> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Expo push HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  const body = await response.json() as { data?: ExpoTicket[]; };
  return body.data ?? [];
}

/**
 * Fetch receipts for a batch of tickets and prune the tokens those tickets
 * map to when Expo flags the device as permanently dead.
 *
 * Tickets don't carry the token back, so `tokenByTicketId` (built at send
 * time) supplies the mapping. Must run on a delay — receipts do not exist
 * at send time, so an immediate lookup returns nothing. `pushReceiptQueue`
 * schedules the call; this function is the queue job's body.
 *
 * Never throws.
 */
export async function processPushReceipts(
  tokenByTicketId: Record<string, string>,
): Promise<void> {
  const ticketIds = Object.keys(tokenByTicketId);
  if (ticketIds.length === 0) return;

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: ticketIds }),
    });
    if (!response.ok) return;
    const body = await response.json() as { data?: Record<string, ExpoReceipt>; };

    const deadTokens = new Set<string>();
    for (const id of Object.keys(body.data ?? {})) {
      const receipt = body.data![id];
      if (
        receipt?.status === 'error' &&
        receipt.details?.error &&
        DEAD_TOKEN_ERRORS.has(receipt.details.error)
      ) {
        const token = tokenByTicketId[id];
        if (token) deadTokens.add(token);
      }
    }
    await pruneTokens([...deadTokens]);
  } catch (err) {
    console.error('processPushReceipts failed', err);
  }
}

/**
 * Send a push to arbitrary Expo tokens. Fire-and-forget safe — callers
 * should not await this in a request hot path unless delivery must be
 * guaranteed. Never throws.
 *
 * Tokens Expo rejects outright are pruned immediately; accepted tickets are
 * handed to `pushReceiptQueue` for a delayed receipt check (receipts don't
 * exist yet at send time).
 */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  const messages: ExpoPushMessage[] = tokens
    .filter(isExpoPushToken)
    .map((to) => ({ to, sound: 'default', title: payload.title, body: payload.body, data: payload.data }));

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    let tickets: ExpoTicket[] = [];
    try {
      tickets = await postChunk(chunk);
    } catch (err) {
      console.error('sendPushToTokens chunk failed', err);
      continue;
    }

    // Tickets line up positionally with the chunk we sent, so map
    // ticket → token by index.
    const immediatelyDead = new Set<string>();
    const tokenByTicketId: Record<string, string> = {};
    tickets.forEach((ticket, idx) => {
      const token = chunk[idx]?.to;
      if (!token) return;
      if (
        ticket.status === 'error' &&
        ticket.details?.error &&
        DEAD_TOKEN_ERRORS.has(ticket.details.error)
      ) {
        immediatelyDead.add(token);
      } else if (ticket.status === 'ok' && ticket.id) {
        tokenByTicketId[ticket.id] = token;
      }
    });

    await pruneTokens([...immediatelyDead]);

    if (Object.keys(tokenByTicketId).length > 0) {
      await pushReceiptQueue
        .add({ tokenByTicketId }, { delay: PUSH_RECEIPT_DELAY_MS, removeOnComplete: true })
        .catch((err) => console.error('pushReceiptQueue.add failed', err));
    }
  }
}

/**
 * Resolve users → their device tokens (notifications on, valid Expo token),
 * then push. Returns the tokens actually attempted. Never throws.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        notificationsEnabled: true,
      },
      select: { deviceToken: true },
    });
    const tokens = users.map((u) => u.deviceToken).filter(isExpoPushToken);
    await sendPushToTokens(tokens, payload);
    return tokens;
  } catch (err) {
    console.error('sendPushToUsers failed', err);
    return [];
  }
}
