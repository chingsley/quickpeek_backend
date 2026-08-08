import {
  isExpoPushToken,
  processPushReceipts,
  sendPushToTokens,
  sendPushToUsers,
} from '../../src/common/utils/push';

jest.mock('../../src/core/database/prisma/client', () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn() },
  },
}));

// Keep the unit test off Redis; assert on the enqueue instead.
jest.mock('../../src/core/queues/pushReceiptQueue', () => ({
  pushReceiptQueue: { add: jest.fn().mockResolvedValue(undefined) },
  PUSH_RECEIPT_DELAY_MS: 900_000,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prisma = require('../../src/core/database/prisma/client').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pushReceiptQueue } = require('../../src/core/queues/pushReceiptQueue');

describe('isExpoPushToken', () => {
  it('accepts valid Expo tokens', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
  });

  it('rejects empty, malformed, and non-Expo tokens', () => {
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken('random-uuid')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
  });
});

describe('sendPushToTokens', () => {
  let fetchSpy: jest.SpyInstance;
  const updateManyMock = jest.fn();

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    // push.ts imports prisma at module load; reach the same instance through
    // the existing module mock from the top of the file.
    prisma.user.updateMany = updateManyMock;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    updateManyMock.mockReset();
    pushReceiptQueue.add.mockClear();
  });

  const okResponse = (tickets: any[] = []) => ({
    ok: true,
    json: async () => ({ data: tickets }),
  });

  it('posts valid tokens to the Expo push API and skips invalid ones', async () => {
    fetchSpy.mockResolvedValue(okResponse([
      { status: 'ok', id: 't1' },
      { status: 'ok', id: 't2' },
    ]));

    await sendPushToTokens(
      ['ExponentPushToken[a]', 'not-a-token', 'ExponentPushToken[b]'],
      { title: 'Hi', body: 'Body', data: { type: 'x' } },
    );

    // One outbound call only — receipts are deferred to the queue, not fetched
    // inline (they don't exist yet at send time).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    const sent = JSON.parse(String(init.body));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ to: 'ExponentPushToken[a]', title: 'Hi', body: 'Body' });
  });

  it('chunks large batches at 100 messages per request', async () => {
    fetchSpy.mockResolvedValue(okResponse());
    const tokens = Array.from({ length: 205 }, (_, i) => `ExponentPushToken[t${i}]`);

    await sendPushToTokens(tokens, { title: 'T', body: 'B' });

    const sendCalls = fetchSpy.mock.calls.filter((c) => c[0] === 'https://exp.host/--/api/v2/push/send');
    expect(sendCalls).toHaveLength(3);
    const sizes = sendCalls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).length);
    expect(sizes).toEqual([100, 100, 5]);
  });

  it('swallows HTTP errors so a failing Expo call never throws into the app', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as unknown as Response);

    await expect(
      sendPushToTokens(['ExponentPushToken[a]'], { title: 'T', body: 'B' }),
    ).resolves.toBeUndefined();
    expect(pushReceiptQueue.add).not.toHaveBeenCalled();
  });

  it('prunes tokens Expo rejects outright at send time, clearing only the token', async () => {
    fetchSpy.mockResolvedValue(okResponse([
      { status: 'error', message: 'bad', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: 'good-ticket' },
    ]));

    await sendPushToTokens(
      ['ExponentPushToken[dead]', 'ExponentPushToken[alive]'],
      { title: 'T', body: 'B' },
    );

    // notificationsEnabled must be left alone: the cold-start sync only
    // restores the token, so flipping the preference off here would leave a
    // rotated-token user with push permanently disabled.
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { deviceToken: { in: ['ExponentPushToken[dead]'] } },
      data: { deviceToken: '' },
    });
  });

  it('defers accepted tickets to the receipt queue with a delay', async () => {
    fetchSpy.mockResolvedValue(okResponse([
      { status: 'ok', id: 'tick-1' },
      { status: 'error', message: 'bad', details: { error: 'DeviceNotRegistered' } },
    ]));

    await sendPushToTokens(
      ['ExponentPushToken[live]', 'ExponentPushToken[dead]'],
      { title: 'T', body: 'B' },
    );

    expect(pushReceiptQueue.add).toHaveBeenCalledTimes(1);
    const [data, opts] = pushReceiptQueue.add.mock.calls[0];
    // Only the accepted ticket carries forward; the rejected one is already pruned.
    expect(data).toEqual({ tokenByTicketId: { 'tick-1': 'ExponentPushToken[live]' } });
    expect(opts.delay).toBe(900_000);
  });

  it('does not enqueue a receipt check when no ticket was accepted', async () => {
    fetchSpy.mockResolvedValue(okResponse([
      { status: 'error', message: 'bad', details: { error: 'MessageTooBig' } },
    ]));

    await sendPushToTokens(['ExponentPushToken[a]'], { title: 'T', body: 'B' });

    expect(pushReceiptQueue.add).not.toHaveBeenCalled();
  });
});

describe('processPushReceipts', () => {
  let fetchSpy: jest.SpyInstance;
  const updateManyMock = jest.fn();

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
    prisma.user.updateMany = updateManyMock;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    updateManyMock.mockReset();
  });

  it('prunes tokens whose receipt reports DeviceNotRegistered', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          'rec-dead': { status: 'error', message: 'uninstalled', details: { error: 'DeviceNotRegistered' } },
          'rec-ok': { status: 'ok' },
        },
      }),
    });

    await processPushReceipts({
      'rec-dead': 'ExponentPushToken[rec-dead-tok]',
      'rec-ok': 'ExponentPushToken[rec-ok-tok]',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/getReceipts',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { deviceToken: { in: ['ExponentPushToken[rec-dead-tok]'] } },
      data: { deviceToken: '' },
    });
  });

  it('does not prune on transient receipt errors', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { t1: { status: 'error', message: 'too big', details: { error: 'MessageRateExceeded' } } },
      }),
    });

    await processPushReceipts({ t1: 'ExponentPushToken[t1]' });

    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('no-ops on an empty mapping and never throws on network failure', async () => {
    await processPushReceipts({});
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(processPushReceipts({ t1: 'ExponentPushToken[t1]' })).resolves.toBeUndefined();
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});

describe('sendPushToUsers', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    prisma.user.findMany.mockReset();
    pushReceiptQueue.add.mockClear();
  });

  it('queries only notification-enabled users and pushes their valid tokens', async () => {
    prisma.user.findMany.mockResolvedValue([
      { deviceToken: 'ExponentPushToken[ok]' },
      { deviceToken: '' },
      { deviceToken: 'garbage' },
    ]);
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 't1' }] }),
    });

    const attempted = await sendPushToUsers(['u1', 'u2'], { title: 'T', body: 'B' });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] }, notificationsEnabled: true },
      select: { deviceToken: true },
    });
    expect(attempted).toEqual(['ExponentPushToken[ok]']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('no-ops on an empty recipient list without hitting the DB or network', async () => {
    const attempted = await sendPushToUsers([], { title: 'T', body: 'B' });

    expect(attempted).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns [] and never throws when the DB read fails', async () => {
    prisma.user.findMany.mockRejectedValue(new Error('db down'));

    await expect(sendPushToUsers(['u1'], { title: 'T', body: 'B' })).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
