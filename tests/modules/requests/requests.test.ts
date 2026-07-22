import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';
import { AnswerRequestStatus, QuestionStatus } from '@prisma/client';

const buildQuestion = async (userId: string, categoryId: string, overrides: any = {}) => {
  const q = await prisma.question.create({
    data: {
      title: overrides.title ?? 'Test question',
      detail: overrides.detail ?? 'Test detail body',
      categoryId,
      price: overrides.price ?? 5,
      acceptanceCriteria: overrides.acceptanceCriteria ?? 'Reasonable criteria',
      userId,
      status: overrides.status ?? QuestionStatus.OPEN,
      latitude: overrides.latitude ?? null,
      longitude: overrides.longitude ?? null,
      address: overrides.address ?? null,
      answerRadiusKm: overrides.answerRadiusKm ?? null,
    },
  });
  return q;
};

describe('requests lifecycle', () => {
  let questioner: { id: string; token: string };
  let responder: { id: string; token: string };
  let farResponder: { id: string; token: string };
  let categoryId: string;

  beforeAll(async () => {
    await clearDatabase();
    categoryId = (await prisma.category.upsert({
      where: { slug: 'location' },
      create: { name: 'location', slug: 'location' },
      update: {},
    })).id;
    const q = await createAuthUser({ email: 'q@qp.com', username: 'q' });
    const r = await createAuthUser({
      email: 'r@qp.com',
      username: 'r',
      location: { latitude: 44.6126, longitude: -63.6192 },
    });
    const far = await createAuthUser({
      email: 'far@qp.com',
      username: 'far',
      location: { latitude: 45.0, longitude: -64.0 },
    });
    questioner = { id: q.id, token: q.token };
    responder = { id: r.id, token: r.token };
    farResponder = { id: far.id, token: far.token };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/questions/:id/requests (create)', () => {
    let openQuestionId: string;
    let geoQuestionId: string;

    beforeAll(async () => {
      await prisma.question.deleteMany({});
      const open = await buildQuestion(questioner.id, categoryId, { title: 'Open Q' });
      openQuestionId = open.id;
      const geo = await buildQuestion(questioner.id, categoryId, {
        title: 'Geo Q',
        latitude: 44.6126,
        longitude: -63.6192,
        address: 'downtown',
        answerRadiusKm: 3,
      });
      geoQuestionId = geo.id;
    });

    it('creates a PENDING request and seeds 2 role-specific system messages', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${openQuestionId}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');

      const messages = await prisma.message.findMany({
        where: { answerRequestId: res.body.data.id, type: 'SYSTEM' },
      });
      // 2 system messages: one for responder, one for questioner
      expect(messages).toHaveLength(2);
      const visibleTo = messages.map((m) => m.visibleToUserId).sort();
      expect(visibleTo).toEqual([questioner.id, responder.id].sort());
    });

    it('rejects own question', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${openQuestionId}/requests`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(400);
    });

    it('rejects duplicate request', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${openQuestionId}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(409);
      expect(res.body.existingStatus).toBe('PENDING');
    });

    it('rejects when question is ANSWERED', async () => {
      const answered = await buildQuestion(questioner.id, categoryId, {
        title: 'Answered',
        status: QuestionStatus.ANSWERED,
        answeredAt: new Date(),
      });
      const res = await request(app)
        .post(`/api/v1/questions/${answered.id}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(409);
    });

    it('rejects when question is CANCELLED', async () => {
      const cancelled = await buildQuestion(questioner.id, categoryId, {
        title: 'Cancelled',
        status: QuestionStatus.CANCELLED,
      });
      const res = await request(app)
        .post(`/api/v1/questions/${cancelled.id}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(409);
    });

    it('rejects far-away responder with OUTSIDE_RADIUS', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${geoQuestionId}/requests`)
        .set('Authorization', `Bearer ${farResponder.token}`);
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('OUTSIDE_RADIUS');
    });

    it('allows within-radius responder', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${geoQuestionId}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(201);
    });

    it('requires authentication', async () => {
      const res = await request(app).post(`/api/v1/questions/${openQuestionId}/requests`);
      expect(res.status).toBe(401);
    });

    it('returns 404 for unknown question', async () => {
      const res = await request(app)
        .post('/api/v1/questions/unknown/requests')
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/requests/:id/accept', () => {
    let pendingRequestId: string;

    beforeAll(async () => {
      await prisma.question.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.questionResponderBlock.deleteMany({});
      const q = await buildQuestion(questioner.id, categoryId, { title: 'Accept test' });
      const r = await prisma.answerRequest.create({
        data: {
          questionId: q.id,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.PENDING,
        },
      });
      pendingRequestId = r.id;
    });

    it('rejects non-questioner', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/accept`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated', async () => {
      const res = await request(app).post(`/api/v1/requests/${pendingRequestId}/accept`);
      expect(res.status).toBe(401);
    });

    it('accepts a PENDING request and posts role-specific system messages', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/accept`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACCEPTED');

      const questionerMsg = await prisma.message.findFirst({
        where: {
          answerRequestId: pendingRequestId,
          type: 'SYSTEM',
          visibleToUserId: questioner.id,
          text: { contains: 'You approved' },
        },
      });
      const responderMsg = await prisma.message.findFirst({
        where: {
          answerRequestId: pendingRequestId,
          type: 'SYSTEM',
          visibleToUserId: responder.id,
          text: 'Request accepted. Send your response.',
        },
      });
      expect(questionerMsg).not.toBeNull();
      expect(responderMsg).not.toBeNull();
    });

    it('rejects already-accepted requests', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/accept`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(409);
    });

    it('returns 404 for unknown request', async () => {
      const res = await request(app)
        .post('/api/v1/requests/nope/accept')
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/requests/:id/accept — briefing messages', () => {
    let briefingRequestId: string;
    let questionerUserId: string;
    let responderUserId: string;

    beforeAll(async () => {
      await prisma.message.deleteMany({});
      await prisma.questionResponderBlock.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.question.deleteMany({});

      const q = await buildQuestion(questioner.id, categoryId, {
        title: 'Briefing test',
        detail: 'Is the branch busy right now?',
        address: '1 Spring Garden Rd, Halifax, NS',
        latitude: 44.6126,
        longitude: -63.6192,
        acceptanceCriteria: 'Photo of the queue or head-count.',
      });

      const answerRequest = await prisma.answerRequest.create({
        data: {
          questionId: q.id,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.PENDING,
        },
      });
      briefingRequestId = answerRequest.id;
      questionerUserId = questioner.id;
      responderUserId = responder.id;

      await prisma.message.create({
        data: {
          questionId: q.id,
          answerRequestId: answerRequest.id,
          senderId: responder.id,
          text: 'Your request to answer the question has been sent to the question creator.',
          type: 'SYSTEM',
          visibleToUserId: responder.id,
        },
      });
      await prisma.message.create({
        data: {
          questionId: q.id,
          answerRequestId: answerRequest.id,
          senderId: responder.id,
          text: 'You have a request by @responder to respond to your question.',
          type: 'SYSTEM',
          visibleToUserId: questioner.id,
        },
      });
    });

    it('posts briefing USER messages from the questioner after accept', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${briefingRequestId}/accept`)
        .set('Authorization', `Bearer ${questioner.token}`);

      expect(res.status).toBe(200);

      const messages = await prisma.message.findMany({
        where: { answerRequestId: briefingRequestId },
        orderBy: { createdAt: 'asc' },
      });

      expect(messages).toHaveLength(7);

      expect(messages[0].type).toBe('SYSTEM');
      expect(messages[0].visibleToUserId).toBe(responderUserId);
      expect(messages[1].type).toBe('SYSTEM');
      expect(messages[1].visibleToUserId).toBe(questionerUserId);

      expect(messages[2].type).toBe('SYSTEM');
      expect(messages[2].text).toMatch(/You approved @r to respond/);
      expect(messages[2].visibleToUserId).toBe(questionerUserId);

      expect(messages[3].type).toBe('SYSTEM');
      expect(messages[3].text).toBe('Request accepted. Send your response.');
      expect(messages[3].visibleToUserId).toBe(responderUserId);

      expect(messages[4].type).toBe('USER');
      expect(messages[4].senderId).toBe(questionerUserId);
      expect(messages[4].text).toBe('Location: 1 Spring Garden Rd, Halifax, NS');

      expect(messages[5].type).toBe('USER');
      expect(messages[5].senderId).toBe(questionerUserId);
      expect(messages[5].text).toBe('Is the branch busy right now?');

      expect(messages[6].type).toBe('USER');
      expect(messages[6].senderId).toBe(questionerUserId);
      expect(messages[6].text).toBe('Acceptance criteria: Photo of the queue or head-count.');
    });

    it('exposes briefing messages to both participants via GET messages', async () => {
      const [responderView, questionerView] = await Promise.all([
        request(app)
          .get(`/api/v1/requests/${briefingRequestId}/messages`)
          .set('Authorization', `Bearer ${responder.token}`),
        request(app)
          .get(`/api/v1/requests/${briefingRequestId}/messages`)
          .set('Authorization', `Bearer ${questioner.token}`),
      ]);

      expect(responderView.status).toBe(200);
      expect(questionerView.status).toBe(200);

      const responderTexts = responderView.body.data.map((m: { text: string }) => m.text);
      const questionerTexts = questionerView.body.data.map((m: { text: string }) => m.text);

      expect(responderTexts).toContain('Location: 1 Spring Garden Rd, Halifax, NS');
      expect(responderTexts).toContain('Is the branch busy right now?');
      expect(questionerTexts).toContain('Acceptance criteria: Photo of the queue or head-count.');
    });
  });

  describe('POST /api/v1/requests/:id/reject', () => {
    let pendingRequestId: string;

    beforeAll(async () => {
      await prisma.question.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.questionResponderBlock.deleteMany({});
      const q = await buildQuestion(questioner.id, categoryId, { title: 'Reject test' });
      const r = await prisma.answerRequest.create({
        data: {
          questionId: q.id,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.PENDING,
        },
      });
      pendingRequestId = r.id;
    });

    it('rejects non-questioner', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/reject`)
        .set('Authorization', `Bearer ${responder.token}`)
        .send({ rejectionReason: 'Not now' });
      expect(res.status).toBe(403);
    });

    it('requires a rejectionReason', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/reject`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects a PENDING request and posts a reason message to responder only', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/reject`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ rejectionReason: 'Prefer someone closer to the specified location' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toMatch(/closer/i);

      const sysMsgs = await prisma.message.findMany({
        where: { answerRequestId: pendingRequestId, type: 'SYSTEM', visibleToUserId: responder.id },
      });
      expect(sysMsgs.length).toBeGreaterThanOrEqual(1);
      expect(sysMsgs[0].text).toMatch(/declined/i);

      const block = await prisma.questionResponderBlock.findFirst({
        where: { questionId: (await prisma.answerRequest.findUnique({ where: { id: pendingRequestId } }))!.questionId, responderId: responder.id, removedAt: null },
      });
      expect(block).not.toBeNull();
      expect(block?.rejectionReason).toMatch(/closer/i);
    });

    it('rejects already-rejected requests', async () => {
      const res = await request(app)
        .post(`/api/v1/requests/${pendingRequestId}/reject`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ rejectionReason: 'Another reason' });
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/v1/requests/incoming and /outgoing', () => {
    beforeAll(async () => {
      await prisma.question.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.questionResponderBlock.deleteMany({});
      const q1 = await buildQuestion(questioner.id, categoryId, { title: 'Q1' });
      const q2 = await buildQuestion(questioner.id, categoryId, { title: 'Q2' });
      await Promise.all([
        prisma.answerRequest.create({
          data: { questionId: q1.id, responderId: responder.id, questionerId: questioner.id, status: 'PENDING' },
        }),
        prisma.answerRequest.create({
          data: { questionId: q2.id, responderId: responder.id, questionerId: questioner.id, status: 'ACCEPTED' },
        }),
        prisma.answerRequest.create({
          data: { questionId: q2.id, responderId: farResponder.id, questionerId: questioner.id, status: 'PENDING' },
        }),
      ]);
    });

    it('returns questioner incoming requests', async () => {
      const res = await request(app)
        .get('/api/v1/requests/incoming')
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(3);
      // counterparty is the responder
      expect(res.body.data.items[0].counterparty).toHaveProperty('username');
    });

    it('filters incoming by questionId', async () => {
      const all = await request(app)
        .get('/api/v1/requests/incoming')
        .set('Authorization', `Bearer ${questioner.token}`);
      const q1Request = all.body.data.items.find((r: any) => r.question.title === 'Q1');
      const res = await request(app)
        .get(`/api/v1/requests/incoming?questionId=${q1Request.questionId}`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.body.data.items.every((r: any) => r.questionId === q1Request.questionId)).toBe(true);
    });

    it('returns responder outgoing requests', async () => {
      const res = await request(app)
        .get('/api/v1/requests/outgoing')
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      // counterparty is the questioner
      expect(res.body.data.items[0].counterparty.id).toBe(questioner.id);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/requests/incoming');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/requests/:id (detail)', () => {
    let detailRequestId: string;

    beforeAll(async () => {
      await prisma.question.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.questionResponderBlock.deleteMany({});
      const q = await buildQuestion(questioner.id, categoryId, { title: 'Detail Q' });
      const r = await prisma.answerRequest.create({
        data: {
          questionId: q.id,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.ACCEPTED,
        },
      });
      detailRequestId = r.id;
    });

    it('returns request context with canType flag', async () => {
      const res = await request(app)
        .get(`/api/v1/requests/${detailRequestId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACCEPTED');
      expect(res.body.data.canType).toBe(true);
      expect(res.body.data.counterparty.id).toBe(questioner.id);
    });

    it('rejects non-participants', async () => {
      // farResponder is not a participant here
      const res = await request(app)
        .get(`/api/v1/requests/${detailRequestId}`)
        .set('Authorization', `Bearer ${farResponder.token}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown request', async () => {
      const res = await request(app)
        .get('/api/v1/requests/nope')
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/requests/conversations', () => {
    beforeAll(async () => {
      await prisma.message.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.question.deleteMany({});
      const q = await buildQuestion(questioner.id, categoryId, { title: 'Conv Q' });
      await prisma.answerRequest.create({
        data: {
          questionId: q.id,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.PENDING,
        },
      });
    });

    it('returns conversations for questioner with unread system message', async () => {
      const pending = await prisma.answerRequest.findFirst({
        where: { questionerId: questioner.id, status: AnswerRequestStatus.PENDING },
      });
      await prisma.message.create({
        data: {
          questionId: pending!.questionId,
          answerRequestId: pending!.id,
          senderId: responder.id,
          text: 'You have a new request',
          type: 'SYSTEM',
          visibleToUserId: questioner.id,
        },
      });

      const res = await request(app)
        .get('/api/v1/requests/conversations')
        .set('Authorization', `Bearer ${questioner.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.unreadTotal).toBeGreaterThan(0);
      const conv = res.body.data.items.find((i: any) => i.requestId === pending!.id);
      expect(conv).toBeDefined();
      expect(conv.hasUnread).toBe(true);
      expect(conv.role).toBe('incoming');
      expect(conv.status).toBe('PENDING');
    });

    it('returns outgoing conversations for responder', async () => {
      const res = await request(app)
        .get('/api/v1/requests/conversations')
        .set('Authorization', `Bearer ${responder.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.some((i: any) => i.role === 'outgoing')).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/requests/conversations');
      expect(res.status).toBe(401);
    });
  });

  describe('blocklist and re-request', () => {
    let questionId: string;
    let rejectedRequestId: string;

    beforeAll(async () => {
      await prisma.questionResponderBlock.deleteMany({});
      await prisma.message.deleteMany({});
      await prisma.answerRequest.deleteMany({});
      await prisma.question.deleteMany({});

      const q = await buildQuestion(questioner.id, categoryId, { title: 'Blocklist Q' });
      questionId = q.id;
      const req = await prisma.answerRequest.create({
        data: {
          questionId,
          responderId: responder.id,
          questionerId: questioner.id,
          status: AnswerRequestStatus.PENDING,
        },
      });
      rejectedRequestId = req.id;

      await request(app)
        .post(`/api/v1/requests/${rejectedRequestId}/reject`)
        .set('Authorization', `Bearer ${questioner.token}`)
        .send({ rejectionReason: 'Already got a response' });
    });

    it('blocks re-request while on rejected list', async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${questionId}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(403);
      expect(res.body.reason).toBe('BLOCKED');
    });

    it('returns BLOCKED on question detail', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${questionId}`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.canRequestReason).toBe('BLOCKED');
      expect(res.body.data.viewerRequest.isBlocked).toBe(true);
    });

    it('lists rejected responders for questioner', async () => {
      const res = await request(app)
        .get(`/api/v1/questions/${questionId}/rejected-responders`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].responder.id).toBe(responder.id);
    });

    it('allows re-request after unblock', async () => {
      const unblock = await request(app)
        .delete(`/api/v1/questions/${questionId}/rejected-responders/${responder.id}`)
        .set('Authorization', `Bearer ${questioner.token}`);
      expect(unblock.status).toBe(200);

      const res = await request(app)
        .post(`/api/v1/questions/${questionId}/requests`)
        .set('Authorization', `Bearer ${responder.token}`);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
    });
  });
});
