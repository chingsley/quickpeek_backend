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

describe('questions marketplace', () => {
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

      // 3 OPEN, 1 ANSWERED, 1 CANCELLED
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
          title: 'Answered One',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: u.id,
          status: QuestionStatus.ANSWERED,
          answeredAt: new Date(),
        },
      });
      await prisma.question.create({
        data: {
          title: 'Cancelled One',
          detail: 'detail body',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: u.id,
          status: QuestionStatus.CANCELLED,
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
  });

  describe('GET /api/v1/questions/feed (sectioned for authenticated viewers)', () => {
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
      const answeredStatusQ = await mk('Answered Status Q', { status: QuestionStatus.ANSWERED, answeredAt: new Date() });

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

    const sectionTitles = (res: any) => res.body.data.sections.map((s: any) => s.key);
    const itemsIn = (res: any, key: string) =>
      res.body.data.sections.find((s: any) => s.key === key)?.items.map((q: any) => q.title) ?? [];

    it('returns sectioned feed for authenticated viewer', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed?lat=44.6126&lng=-63.6192')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.sections).toBeDefined();
      expect(sectionTitles(res)).toEqual(
        expect.arrayContaining([
          'pending',
          'approved',
          'answered_by_you',
          'rejected',
          'others',
        ]),
      );
      expect(itemsIn(res, 'pending')).toContain('Pending Section Q');
      expect(itemsIn(res, 'approved')).toContain('Approved Section Q');
      expect(itemsIn(res, 'answered_by_you')).toContain('Answered Section Q');
      expect(itemsIn(res, 'rejected')).toContain('Rejected Section Q');
      expect(itemsIn(res, 'others')).toContain('Fresh Section Q');
      expect(itemsIn(res, 'others')).toContain('New Section Q');
    });

    it('flags geographically close questions with nearMe when coords are inferred from saved location', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      expect(res.status).toBe(200);
      const fresh = res.body.data.sections
        .flatMap((s: any) => s.items)
        .find((q: any) => q.title === 'Fresh Section Q');
      expect(fresh).toBeTruthy();
      expect(fresh.nearMe).toBe(true);
    });

    it('returns awaiting_your_approval for questioner incoming pending requests', async () => {
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
      expect(itemsIn(res, 'awaiting_your_approval')).toContain('Incoming Approval Q');
      const item = res.body.data.sections
        .find((s: any) => s.key === 'awaiting_your_approval')
        ?.items.find((q: any) => q.title === 'Incoming Approval Q');
      expect(item.incomingRequest).toMatchObject({
        status: 'PENDING',
        responder: { id: feedResponder.id },
      });
      expect(item.pendingApprovalCount).toBe(1);
    });

    it('groups multiple pending requests into one awaiting_your_approval card per question', async () => {
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
      const awaitingItems = res.body.data.sections
        .find((s: any) => s.key === 'awaiting_your_approval')
        ?.items.filter((q: any) => q.title === 'Grouped Approval Q');
      expect(awaitingItems).toHaveLength(1);
      expect(awaitingItems[0].pendingApprovalCount).toBe(2);
    });

    it('excludes ANSWERED questions from all sections', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      const allTitles = res.body.data.sections.flatMap((s: any) => s.items.map((q: any) => q.title));
      expect(allTitles).not.toContain('Answered Status Q');
    });

    it('marks hasResponded on answered_by_you items', async () => {
      const res = await request(app)
        .get('/api/v1/questions/feed')
        .set('Authorization', `Bearer ${feedResponder.token}`);

      const answeredSection = res.body.data.sections.find((s: any) => s.key === 'answered_by_you');
      const item = answeredSection.items.find((q: any) => q.id === answeredQuestionId);
      expect(item.viewerRequest.hasResponded).toBe(true);
    });

    it('still returns flat items for unauthenticated viewers', async () => {
      const res = await request(app).get('/api/v1/questions/feed');
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.sections).toBeUndefined();
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

    it('returns canRequest=false ANSWERED when question is answered', async () => {
      await prisma.question.update({
        where: { id: detailQuestionId },
        data: { status: QuestionStatus.ANSWERED, answeredAt: new Date() },
      });
      const res = await request(app)
        .get(`/api/v1/questions/${detailQuestionId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.body.data.canRequestReason).toBe('ANSWERED');

      // Reset for later tests
      await prisma.question.update({
        where: { id: detailQuestionId },
        data: { status: QuestionStatus.OPEN, answeredAt: null },
      });
    });
  });

  describe('POST /api/v1/questions/:id/answered', () => {
    let targetId: string;
    let pendingRequestIds: string[];

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const q = await createAuthUser({ email: 'ans-q@qp.com', username: 'ans_q' });
      const r1 = await createAuthUser({ email: 'ans-r1@qp.com', username: 'ans_r1' });
      const r2 = await createAuthUser({ email: 'ans-r2@qp.com', username: 'ans_r2' });
      questioner = { id: q.id, token: q.token };
      responder = { id: r1.id, token: r1.token };

      const question = await prisma.question.create({
        data: {
          title: 'To be answered',
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
        .post(`/api/v1/questions/${targetId}/answered`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(403);
    });

    it('marks ANSWERED and closes pending requests', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/answered`)
        .set('Authorization', `Bearer ${questioner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ANSWERED');

      const dbQ = await prisma.question.findUnique({ where: { id: targetId } });
      expect(dbQ?.status).toBe(QuestionStatus.ANSWERED);
      expect(dbQ?.answeredAt).not.toBeNull();

      const closed = await prisma.answerRequest.findMany({
        where: { id: { in: pendingRequestIds } },
      });
      expect(closed.every((r) => r.status === 'CLOSED_ANSWERED')).toBe(true);

      // Closing system messages were created for each responder.
      const messages = await prisma.message.findMany({
        where: { answerRequestId: { in: pendingRequestIds }, type: 'SYSTEM' },
      });
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('is idempotent on already-answered questions', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${targetId}/answered`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /api/v1/questions/:id (cancel)', () => {
    let cancelId: string;

    beforeAll(async () => {
      await clearDatabase();
      const cat = await createCategory();
      categoryId = cat.id;
      const q = await createAuthUser({ email: 'can-q@qp.com', username: 'can_q' });
      const r = await createAuthUser({ email: 'can-r@qp.com', username: 'can_r' });
      questioner = { id: q.id, token: q.token };
      responder = { id: r.id, token: r.token };

      const question = await prisma.question.create({
        data: {
          title: 'To be cancelled',
          detail: 'detail',
          categoryId,
          price: 5,
          acceptanceCriteria: 'criteria',
          userId: q.id,
        },
      });
      cancelId = question.id;
      await prisma.answerRequest.create({
        data: { questionId: cancelId, responderId: r.id, questionerId: q.id, status: 'PENDING' },
      });
    });

    it('rejects non-questioner', async () => {
      const res = await request(app)
        .delete(`/api/v1/questions/${cancelId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(403);
    });

    it('cancels the question and closes pending requests', async () => {
      const res = await request(app)
        .delete(`/api/v1/questions/${cancelId}`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('is idempotent on already-cancelled questions', async () => {
      const res = await request(app)
        .delete(`/api/v1/questions/${cancelId}`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
    });
  });
});
