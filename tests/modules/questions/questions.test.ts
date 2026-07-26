import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';
import { QuestionStatus } from '@prisma/client';

const buildQuestionPayload = (overrides: Record<string, any> = {}) => ({
  title: 'Where can I find late-night coffee?',
  detail: 'I am looking for a coffee shop open past 11pm near downtown.',
  price: 5,
  acceptanceCriteria: 'A reachable shop with current hours and approximate address.',
  // location omitted by default
  ...overrides,
});

const createCategory = async (slug = 'location') =>
  prisma.category.upsert({
    where: { slug },
    create: { name: slug, slug },
    update: {},
  });

describe('questions', () => {
  let questioner: { id: string; token: string; };
  let responder: { id: string; token: string; };
  let farAwayResponder: { id: string; token: string; };
  let categoryId: string;

  beforeAll(async () => {
    await clearDatabase();
    const q = await createAuthUser({ email: 'q@qp.com', username: 'questioner' });
    const r = await createAuthUser({
      email: 'r@qp.com',
      username: 'responder',
      location: { latitude: 44.6126, longitude: -63.6192 },
    });
    const far = await createAuthUser({
      email: 'far@qp.com',
      username: 'far_away',
      location: { latitude: 45.0, longitude: -64.0 }, // >50km away
    });
    questioner = { id: q.id, token: q.token };
    responder = { id: r.id, token: r.token };
    farAwayResponder = { id: far.id, token: far.token };
    const category = await createCategory();
    categoryId = category.id;
    await createCategory('other');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/questions (create)', () => {
    it('creates a question without location', async () => {
      const res = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${questioner.token}`)
        .send(buildQuestionPayload());

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        title: 'Where can I find late-night coffee?',
        userId: questioner.id,
        status: 'OPEN',
        latitude: null,
        longitude: null,
        address: null,
      });
      expect(res.body.data.category).toMatchObject({ slug: 'other' });
    });

    it('creates a question with location + radius', async () => {
      const res = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${questioner.token}`)
        .send(
          buildQuestionPayload({
            latitude: 44.6126,
            longitude: -63.6192,
            address: '1 Spring Garden Rd, Halifax, NS',
            answerRadiusKm: 3,
          }),
        );

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        latitude: 44.6126,
        longitude: -63.6192,
        address: '1 Spring Garden Rd, Halifax, NS',
        answerRadiusKm: 3,
      });
    });

    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/questions').send(buildQuestionPayload());
      expect(res.status).toBe(401);
    });

    it('rejects missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ title: 'too short detail' });

      expect(res.status).toBe(400);
    });

    it('rejects partial location (missing address)', async () => {
      const res = await request(app)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${questioner.token}`)
        .send(
          buildQuestionPayload({
            latitude: 44.6,
            longitude: -63.6,
          }),
        );

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/location/i);
    });
  });

  describe('GET /api/v1/questions/feed', () => {
    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const u = await createAuthUser({ email: 'author@qp.com', username: 'author' });
      questioner = { id: u.id, token: u.token };

      // 3 OPEN, 2 CLOSED
      for (const title of ['Open One', 'Open Two', 'Open Three']) {
        await prisma.question.create({
          data: {
            title,
            detail: 'detail body',
            categoryId,
            price: 5,
            acceptanceCriteria: 'criteria',
            userId: u.id,
            status: QuestionStatus.OPEN,
          },
        });
      }
      await prisma.question.create({
        data: {
          title: 'Closed Answered One',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: u.id,
          status: QuestionStatus.CLOSED,
          answeredAt: new Date(),
          closedAt: new Date(),
          closeReason: 'Question answered',
        },
      });
      await prisma.question.create({
        data: {
          title: 'Closed Other One',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: u.id,
          status: QuestionStatus.CLOSED,
          closedAt: new Date(),
          closeReason: 'No longer need the information',
        },
      });
    });

    it('returns only OPEN questions by default', async () => {
      const res = await request(app).get('/api/v1/questions/feed');
      expect(res.status).toBe(200);
      const titles = res.body.data.items.map((q: any) => q.title);
      expect(titles).toEqual(expect.arrayContaining(['Open One', 'Open Two', 'Open Three']));
      expect(titles).not.toContain('Answered One');
      expect(titles).not.toContain('Cancelled One');
    });

    it('paginates the feed', async () => {
      const res = await request(app).get('/api/v1/questions/feed?limit=2&page=1');
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.pagination.hasMore).toBe(true);
    });

    it('computes distanceKm + nearMe when viewer coords supplied', async () => {
      const close = await prisma.question.create({
        data: {
          title: 'Geo Close',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          latitude: 44.6126,
          longitude: -63.6192,
          address: 'downtown',
          answerRadiusKm: 3,
        },
      });
      const far = await prisma.question.create({
        data: {
          title: 'Geo Far',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          latitude: 44.7,
          longitude: -63.7,
          address: 'far away',
          answerRadiusKm: 3,
        },
      });

      const res = await request(app).get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192');
      const byTitle = Object.fromEntries(res.body.data.items.map((q: any) => [q.title, q]));
      expect(byTitle['Geo Close'].distanceKm).toBeLessThanOrEqual(3);
      expect(byTitle['Geo Close'].nearMe).toBe(true);
      expect(byTitle['Geo Far'].nearMe).toBe(false);
    });

    it('restricts to radius when radiusKm provided', async () => {
      const res = await request(app).get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192&radiusKm=1');
      for (const q of res.body.data.items) {
        expect(q.distanceKm).toBeLessThanOrEqual(1);
      }
    });

    it('nearMe filter returns incoming questions within NEAR_ME_RADIUS only', async () => {
      const viewer = await createAuthUser({
        email: 'near-filter@qp.com',
        username: 'near_filter',
        location: { latitude: 44.6126, longitude: -63.6192 },
      });
      const closeIncoming = await prisma.question.create({
        data: {
          title: 'Near Filter Close',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          latitude: 44.6126,
          longitude: -63.6192,
          answerRadiusKm: 0.1,
        },
      });
      const edgeIncoming = await prisma.question.create({
        data: {
          title: 'Near Filter Edge',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          latitude: 44.657,
          longitude: -63.6192,
          answerRadiusKm: 5,
        },
      });
      await prisma.question.create({
        data: {
          title: 'Near Filter Own Outgoing',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: viewer.id,
          latitude: 44.6126,
          longitude: -63.6192,
          answerRadiusKm: 5,
        },
      });

      const res = await request(app)
        .get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192&nearMe=true')
        .set('Authorization', `Bearer ${viewer.token}`);

      expect(res.status).toBe(200);
      const titles = res.body.data.items.map((q: any) => q.title);
      expect(titles).toContain('Near Filter Close');
      expect(titles).toContain('Near Filter Edge');
      expect(titles).not.toContain('Near Filter Own Outgoing');

      void closeIncoming;
      void edgeIncoming;
    });
  });

  describe('GET /api/v1/questions/feed (authenticated viewers)', () => {
    let feedResponder: { id: string; token: string; };
    let pendingQuestionId: string;
    let approvedQuestionId: string;
    let answeredQuestionId: string;
    let rejectedQuestionId: string;
    let freshQuestionId: string;

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory('feed-sections');
      categoryId = cat.id;
      const author = await createAuthUser({ email: 'feed-author@qp.com', username: 'feed_author' });
      const viewer = await createAuthUser({
        email: 'feed-viewer@qp.com',
        username: 'feed_viewer',
        location: { latitude: 44.6126, longitude: -63.6192 },
      });
      questioner = { id: author.id, token: author.token };
      feedResponder = { id: viewer.id, token: viewer.token };

      const mk = (title: string, extra: Record<string, any> = {}) =>
        prisma.question.create({
          data: {
            title,
            detail: 'detail body',
            categoryId,
            price: 5,
            acceptanceCriteria: 'criteria',
            userId: author.id,
            status: QuestionStatus.OPEN,
            ...extra,
          },
        });

      const pendingQ = await mk('Pending Section Q');
      const approvedQ = await mk('Approved Section Q');
      const answeredQ = await mk('Answered Section Q');
      const rejectedQ = await mk('Rejected Section Q');
      const freshQ = await mk('Fresh Section Q', {
        latitude: 44.6126,
        longitude: -63.6192,
        answerRadiusKm: 5,
      });
      await mk('New Section Q');
      const answeredStatusQ = await mk('Answered Status Q', {
        status: QuestionStatus.CLOSED,
        answeredAt: new Date(),
        closedAt: new Date(),
        closeReason: 'Question answered',
      });

      pendingQuestionId = pendingQ.id;
      approvedQuestionId = approvedQ.id;
      answeredQuestionId = answeredQ.id;
      rejectedQuestionId = rejectedQ.id;
      freshQuestionId = freshQ.id;

      const pendingReq = await prisma.answerRequest.create({
        data: {
          questionId: pendingQ.id,
          responderId: viewer.id,
          questionerId: author.id,
          status: 'PENDING',
        },
      });
      const approvedReq = await prisma.answerRequest.create({
        data: {
          questionId: approvedQ.id,
          responderId: viewer.id,
          questionerId: author.id,
          status: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });
      const answeredReq = await prisma.answerRequest.create({
        data: {
          questionId: answeredQ.id,
          responderId: viewer.id,
          questionerId: author.id,
          status: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });
      const rejectedReq = await prisma.answerRequest.create({
        data: {
          questionId: rejectedQ.id,
          responderId: viewer.id,
          questionerId: author.id,
          status: 'REJECTED',
          rejectionReason: 'Not a fit',
          respondedAt: new Date(),
        },
      });
      await prisma.questionResponderBlock.create({
        data: {
          questionId: rejectedQ.id,
          responderId: viewer.id,
          answerRequestId: rejectedReq.id,
          rejectionReason: 'Not a fit',
        },
      });
      await prisma.message.create({
        data: {
          questionId: answeredQ.id,
          answerRequestId: answeredReq.id,
          senderId: viewer.id,
          text: 'Here is my answer',
          type: 'USER',
        },
      });

      // silence unused variable warnings for ids used implicitly via titles
      void pendingReq;
      void approvedReq;
      void answeredStatusQ;
    });

    const feedTitles = (res: any) => res.body.data.items.map((q: any) => q.title);

    it('returns flat feed with counts for authenticated viewer', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.counts).toMatchObject({
        all: expect.any(Number),
        incoming: expect.any(Number),
        outgoing: expect.any(Number),
      });
      expect(feedTitles(res)).toContain('Pending Section Q');
      expect(feedTitles(res)).toContain('Approved Section Q');
      expect(feedTitles(res)).toContain('Answered Section Q');
      expect(feedTitles(res)).toContain('Rejected Section Q');
      expect(feedTitles(res)).toContain('Fresh Section Q');
      expect(feedTitles(res)).toContain('New Section Q');
      expect(res.body.data.counts.incoming).toBeGreaterThan(0);
      expect(res.body.data.counts.outgoing).toBe(0);
    });

    it('flags geographically close questions with nearMe when coords are inferred from saved location', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      expect(res.status).toBe(200);
      const fresh = res.body.data.items.find((q: any) => q.title === 'Fresh Section Q');
      expect(fresh).toBeTruthy();
      expect(fresh.nearMe).toBe(true);
    });

    it('includes incomingRequest on questioner own questions with pending requests', async () => {
      const incomingQ = await prisma.question.create({
        data: {
          title: 'Incoming Approval Q',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          status: QuestionStatus.OPEN,
        },
      });
      await prisma.answerRequest.create({
        data: {
          questionId: incomingQ.id,
          responderId: feedResponder.id,
          questionerId: questioner.id,
          status: 'PENDING',
        },
      });

      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${questioner.token}`);

      expect(res.status).toBe(200);
      expect(feedTitles(res)).toContain('Incoming Approval Q');
      const item = res.body.data.items.find((q: any) => q.title === 'Incoming Approval Q');
      expect(item.incomingRequest).toMatchObject({
        status: 'PENDING',
        responder: { id: feedResponder.id },
      });
      expect(res.body.data.counts.outgoing).toBeGreaterThan(0);
    });

    it('groups multiple pending requests into one feed card per question', async () => {
      const incomingQ = await prisma.question.create({
        data: {
          title: 'Grouped Approval Q',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: questioner.id,
          status: QuestionStatus.OPEN,
        },
      });
      const secondResponder = await createAuthUser({
        email: 'grouped-responder@quickpeek.com',
        username: 'grouped_r',
      });
      await prisma.answerRequest.createMany({
        data: [
          {
            questionId: incomingQ.id,
            responderId: feedResponder.id,
            questionerId: questioner.id,
            status: 'PENDING',
          },
          {
            questionId: incomingQ.id,
            responderId: secondResponder.id,
            questionerId: questioner.id,
            status: 'PENDING',
          },
        ],
      });

      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${questioner.token}`);

      expect(res.status).toBe(200);
      const groupedItems = res.body.data.items.filter((q: any) => q.title === 'Grouped Approval Q');
      expect(groupedItems).toHaveLength(1);
      expect(groupedItems[0].incomingRequest).toBeDefined();
    });

    it('excludes CLOSED questions from feed items', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      expect(feedTitles(res)).not.toContain('Answered Status Q');
    });

    it('marks hasResponded on answered items', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      const item = res.body.data.items.find((q: any) => q.id === answeredQuestionId);
      expect(item.viewerRequest.hasResponded).toBe(true);
    });

    it('still returns flat items for unauthenticated viewers', async () => {
      const res = await request(app).get('/api/v1/questions/feed');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.counts).toBeUndefined();
    });
  });

  describe('GET /api/v1/questions/feed priority ordering', () => {
    let priorityViewer: { id: string; token: string; };
    let priorityAuthor: { id: string; token: string; };

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory('priority-sort');
      categoryId = cat.id;
      priorityAuthor = await createAuthUser({
        email: 'priority-author@qp.com',
        username: 'priority_author',
      });
      priorityViewer = await createAuthUser({
        email: 'priority-viewer@qp.com',
        username: 'priority_viewer',
        location: { latitude: 44.6126, longitude: -63.6192 },
      });

      const mkQuestion = (title: string, extra: Record<string, any> = {}) =>
        prisma.question.create({
          data: {
            title,
            detail: 'detail body',
            categoryId,
            price: 5,
            acceptanceCriteria: 'criteria',
            userId: priorityAuthor.id,
            status: QuestionStatus.OPEN,
            ...extra,
          },
        });

      const unreadOlderQ = await mkQuestion('Unread Older');
      const unreadNewerQ = await mkQuestion('Unread Newer');
      const nearbyCloseQ = await mkQuestion('Nearby Close', {
        latitude: 44.6126,
        longitude: -63.6192,
        answerRadiusKm: 5,
      });
      const nearbyFarQ = await mkQuestion('Nearby Far', {
        latitude: 44.62,
        longitude: -63.62,
        answerRadiusKm: 5,
      });
      const incomingOlderQ = await mkQuestion('Incoming Older', {
        latitude: 45.0,
        longitude: -64.0,
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });
      const incomingNewerQ = await mkQuestion('Incoming Newer', {
        latitude: 45.1,
        longitude: -64.1,
        createdAt: new Date('2026-01-02T10:00:00.000Z'),
      });
      await prisma.question.create({
        data: {
          title: 'Outgoing Older',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: priorityViewer.id,
          status: QuestionStatus.OPEN,
          createdAt: new Date('2026-01-01T08:00:00.000Z'),
        },
      });
      await prisma.question.create({
        data: {
          title: 'Outgoing Newer',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: priorityViewer.id,
          status: QuestionStatus.OPEN,
          createdAt: new Date('2026-01-03T08:00:00.000Z'),
        },
      });

      const mkAcceptedRequest = async (questionId: string) =>
        prisma.answerRequest.create({
          data: {
            questionId,
            responderId: priorityViewer.id,
            questionerId: priorityAuthor.id,
            status: 'ACCEPTED',
            respondedAt: new Date(),
          },
        });

      const unreadOlderReq = await mkAcceptedRequest(unreadOlderQ.id);
      const unreadNewerReq = await mkAcceptedRequest(unreadNewerQ.id);
      await mkAcceptedRequest(nearbyCloseQ.id);
      await mkAcceptedRequest(nearbyFarQ.id);
      await mkAcceptedRequest(incomingOlderQ.id);
      await mkAcceptedRequest(incomingNewerQ.id);

      await prisma.message.create({
        data: {
          questionId: unreadOlderQ.id,
          answerRequestId: unreadOlderReq.id,
          senderId: priorityAuthor.id,
          text: 'Older unread',
          type: 'USER',
          createdAt: new Date('2026-07-01T10:00:00.000Z'),
        },
      });
      await prisma.message.create({
        data: {
          questionId: unreadNewerQ.id,
          answerRequestId: unreadNewerReq.id,
          senderId: priorityAuthor.id,
          text: 'Newer unread',
          type: 'USER',
          createdAt: new Date('2026-07-02T10:00:00.000Z'),
        },
      });
    });

    it('orders unread FIFO, then nearby distance, then incoming/outgoing chronology', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192')
        .set('Authorization', `Bearer ${priorityViewer.token}`);

      expect(res.status).toBe(200);
      const titles = res.body.data.items.map((q: any) => q.title);
      expect(titles).toEqual([
        'Unread Older',
        'Unread Newer',
        'Nearby Close',
        'Nearby Far',
        'Incoming Newer',
        'Incoming Older',
        'Outgoing Newer',
        'Outgoing Older',
      ]);
    });
  });

  describe('GET /api/v1/questions/mine', () => {
    it('returns only the authenticated user questions', async () => {
      const other = await createAuthUser({ email: 'other@qp.com', username: 'other_user' });
      await prisma.question.create({
        data: {
          title: 'Other user q',
          detail: 'detail',
          categoryId,
          price: 1,
          acceptanceCriteria: 'criteria',
          userId: other.id,
        },
      });

      const res = await request(app)
        .get('/api/v1/questions/mine')
        .set('Authorization', `Bearer ${questioner.token}`);

      const titles = res.body.data.map((q: any) => q.title);
      expect(titles).not.toContain('Other user q');
      expect(res.body.data[0]).toHaveProperty('requestCounts');
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/questions/mine');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/questions/:id (detail + canRequest)', () => {
    let detailQuestionId: string;
    let ownQuestionId: string;

    beforeAll(async () => {
      // Recreate a controlled scenario
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const q = await createAuthUser({
        email: 'detail-q@qp.com',
        username: 'detail_q',
      });
      const r = await createAuthUser({
        email: 'detail-r@qp.com',
        username: 'detail_r',
        location: { latitude: 44.6126, longitude: -63.6192 },
      });
      const far = await createAuthUser({
        email: 'detail-far@qp.com',
        username: 'detail_far',
        location: { latitude: 45.0, longitude: -64.0 },
      });
      const noLoc = await createAuthUser({
        email: 'detail-noloc@qp.com',
        username: 'detail_noloc',
      });
      questioner = { id: q.id, token: q.token };
      responder = { id: r.id, token: r.token };
      farAwayResponder = { id: far.id, token: far.token };

      const q1 = await prisma.question.create({
        data: {
          title: 'Detail Q',
          detail: 'detail',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: q.id,
          latitude: 44.6126,
          longitude: -63.6192,
          address: 'downtown',
          answerRadiusKm: 3,
        },
      });
      detailQuestionId = q1.id;
      ownQuestionId = q1.id; // own question for the questioner
    });

    it('returns question with questioner rating summary', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${detailQuestionId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('questioner');
      expect(res.body.data.questioner).toHaveProperty('asResponder');
      expect(res.body.data.questioner).toHaveProperty('asQuestioner');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .get('/api/v1/questions/nope')
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(404);
    });

    it('returns canRequest=false with OWN_QUESTION for the questioner', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${ownQuestionId}`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.body.data.canRequest).toBe(false);
      expect(res.body.data.canRequestReason).toBe('OWN_QUESTION');
    });

    it('returns canRequest=true for a responder within radius', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${detailQuestionId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.body.data.canRequest).toBe(true);
      expect(res.body.data.canRequestReason).toBeNull();
    });

    it('returns canRequest=false OUTSIDE_RADIUS for far-away responder', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${detailQuestionId}`)
        .set('Authorization', `Bearer ${farAwayResponder.token}`);
      expect(res.body.data.canRequest).toBe(false);
      expect(res.body.data.canRequestReason).toBe('OUTSIDE_RADIUS');
    });

    it('returns canRequest=false CLOSED when question is closed', async () => {
      await prisma.question.update({
        where: { id: detailQuestionId },
        data: {
          status: QuestionStatus.CLOSED,
          answeredAt: new Date(),
          closedAt: new Date(),
          closeReason: 'Question answered',
        },
      });
      const res = await request(app)
        .get(`/api/v1/questions/${detailQuestionId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.body.data.canRequestReason).toBe('CLOSED');

      // Reset for later tests
      await prisma.question.update({
        where: { id: detailQuestionId },
        data: {
          status: QuestionStatus.OPEN,
          answeredAt: null,
          closedAt: null,
          closeReason: null,
        },
      });
    });
  });

  describe('POST /api/v1/questions/:id/close', () => {
    let targetId: string;
    let pendingRequestIds: string[];

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const q = await createAuthUser({ email: 'close-q@qp.com', username: 'close_q' });
      const r1 = await createAuthUser({ email: 'close-r1@qp.com', username: 'close_r1' });
      const r2 = await createAuthUser({ email: 'close-r2@qp.com', username: 'close_r2' });
      questioner = { id: q.id, token: q.token };
      responder = { id: r1.id, token: r1.token };

      const question = await prisma.question.create({
        data: {
          title: 'To be closed',
          detail: 'detail',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: q.id,
        },
      });
      targetId = question.id;

      const reqs = await Promise.all([
        prisma.answerRequest.create({
          data: { questionId: targetId, responderId: r1.id, questionerId: q.id, status: 'PENDING' },
        }),
        prisma.answerRequest.create({
          data: { questionId: targetId, responderId: r2.id, questionerId: q.id, status: 'PENDING' },
        }),
      ]);
      pendingRequestIds = reqs.map((r) => r.id);
    });

    it('rejects non-questioner', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/close`)
        .set('Authorization', `Bearer ${responder.token}`)
        .send({ reason: 'Question answered' });
      expect(res.status).toBe(403);
    });

    it('requires a close reason', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/close`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ reason: '' });
      expect(res.status).toBe(400);
    });

    it('closes as answered and closes pending requests', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/close`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ reason: 'Question answered' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.closeReason).toBe('Question answered');

      const dbQ = await prisma.question.findUnique({ where: { id: targetId } });
      expect(dbQ?.status).toBe(QuestionStatus.CLOSED);
      expect(dbQ?.answeredAt).not.toBeNull();
      expect(dbQ?.closedAt).not.toBeNull();

      const closed = await prisma.answerRequest.findMany({
        where: { id: { in: pendingRequestIds } },
      });
      expect(closed.every((r) => r.status === 'CLOSED_ANSWERED')).toBe(true);

      const messages = await prisma.message.findMany({
        where: { answerRequestId: { in: pendingRequestIds }, type: 'SYSTEM' },
      });
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('is idempotent on already-closed questions', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/close`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ reason: 'Question answered' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/questions/:id/close (other reason)', () => {
    let closeId: string;

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const q = await createAuthUser({ email: 'close2-q@qp.com', username: 'close2_q' });
      const r = await createAuthUser({ email: 'close2-r@qp.com', username: 'close2_r' });
      questioner = { id: q.id, token: q.token };
      responder = { id: r.id, token: r.token };

      const question = await prisma.question.create({
        data: {
          title: 'To be closed without answered',
          detail: 'detail',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: q.id,
        },
      });
      closeId = question.id;
      await prisma.answerRequest.create({
        data: { questionId: closeId, responderId: r.id, questionerId: q.id, status: 'PENDING' },
      });
    });

    it('closes without setting answeredAt for non-answered reasons', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${closeId}/close`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ reason: 'No longer need the information' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.closeReason).toBe('No longer need the information');

      const dbQ = await prisma.question.findUnique({ where: { id: closeId } });
      expect(dbQ?.status).toBe(QuestionStatus.CLOSED);
      expect(dbQ?.answeredAt).toBeNull();
      expect(dbQ?.closedAt).not.toBeNull();
    });
  });
});
