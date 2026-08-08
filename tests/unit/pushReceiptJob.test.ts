import processPushReceiptJob from '../../src/core/jobs/pushReceiptJob';
import { processPushReceipts } from '../../src/common/utils/push';

jest.mock('../../src/common/utils/push', () => ({
  processPushReceipts: jest.fn().mockResolvedValue(undefined),
}));

const asJob = (data: unknown) => ({ data } as any);

describe('processPushReceiptJob', () => {
  afterEach(() => {
    (processPushReceipts as jest.Mock).mockClear();
  });

  it('forwards the ticket → token mapping to the receipt processor', async () => {
    const tokenByTicketId = { 't1': 'ExponentPushToken[a]' };

    await processPushReceiptJob(asJob({ tokenByTicketId }));

    expect(processPushReceipts).toHaveBeenCalledWith(tokenByTicketId);
  });

  it('ignores jobs with no mapping', async () => {
    await processPushReceiptJob(asJob({}));

    expect(processPushReceipts).not.toHaveBeenCalled();
  });
});
