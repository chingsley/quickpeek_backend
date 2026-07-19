import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';
import { AnswerRequestStatus, MessageType } from '@prisma/client';

const setupScenario = async (status: AnswerRequestStatus = AnswerRequestStatus.ACCEPTED) => {
  await clearDatabase();
  const cat = await prisma.category.upsert({
    where: { slug: 'location' },
    create: { name: 'location', slug: 'location' },
    update: {},
  });
  const q = await createAuthUser({ email: 'q@qp.com', username: 'q_user' });
  const r = await createAuthUser({ email: 'r@qp.com', username: 'r_user' });
  const outsider = await createAuthUser({ email: 'o@qp.com', username: 'o_user' });

  const question = await prisma.question.create({
    data: {
      title: 'Chat test',
      detail: 'Chat detail body',
      categoryId: cat.id,
      price: 5,
      acceptanceCriteria: 'criteria',
      userId: q.id,
    },
  });
  const answerRequest = await prisma.answerRequest.create({
    data: {
      questionId: question.id,
      responderId: r.id,
      questionerId: q.id,
      status,
    },
  });

  return { question, answerRequest, q, r, outsider };
};

describe('messages (request-scoped chat)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/requests/:id/messages', () => {
    it('returns only messages visible to the caller', async () => {
      const { answerRequest, q, r } = await setupScenario();

      // Visible-to-responder-only system message
      await prisma.message.create({
        data: {
          questionId: answerRequest.questionId,
          answerRequestId: answerRequest.id,
          senderId: r.id,
          text: 'Only responder sees this',
          type: MessageType.SYSTEM,
          visibleToUserId: r.id,
        },
      });
      // Visible-to-questioner-only system message
      await prisma.message.create({
        data: {
          questionId: answerRequest.questionId,
          answerRequestId: answerRequest.id,
          senderId: r.id,
          text: 'Only questioner sees this',
          type: MessageType.SYSTEM,
          visibleToUserId: q.id,
        },
      });
      // Shared user message
      await prisma.message.create({
        data: {
          questionId: answerRequest.questionId,
          answerRequestId: answerRequest.id,
          senderId: q.id,
          text: 'Hi from questioner',
        },
      });

      const [resQ, resR] = await Promise.all([
        request(app).get(`/api/v1/requests/${answerRequest.id}/messages`).set('Authorization', `Bearer ${q.token}`),
        request(app).get(`/api/v1/requests/${answerRequest.id}/messages`).set('Authorization', `Bearer ${r.token}`),
      ]);

      expect(resQ.status).toBe(200);
      expect(resR.status).toBe(200);

      const qTexts = resQ.body.data.map((m: any) => m.text);
      const rTexts = resR.body.data.map((m: any) => m.text);

      // Questioner sees its own system message + the shared user message; not the responder-only one
      expect(qTexts).toContain('Only questioner sees this');
      expect(qTexts).toContain('Hi from questioner');
      expect(qTexts).not.toContain('Only responder sees this');

      // Responder sees its own system message + the shared user message; not the questioner-only one
      expect(rTexts).toContain('Only responder sees this');
      expect(rTexts).not.toContain('Only questioner sees this');
    });

    it('rejects non-participants', async () => {
      const { answerRequest, outsider } = await setupScenario();
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${outsider.token}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown request', async () => {
      const { q } = await setupScenario();
      const res = await request(app)
        .get('/api/v1/requests/unknown/messages')
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/v1/requests/:id/messages', () => {
    it('sends a message when request is ACCEPTED', async () => {
      const { answerRequest, q, r } = await setupScenario(AnswerRequestStatus.ACCEPTED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ text: 'Hello responder' });

      expect(res.status).toBe(201);
      expect(res.body.data.text).toBe('Hello responder');
      expect(res.body.data.visibleToUserId).toBeNull();

      // Saved with visibleToUserId null
      const saved = await prisma.message.findUnique({ where: { id: res.body.data.id } });
      expect(saved?.visibleToUserId).toBeNull();
      expect(saved?.answerRequestId).toBe(answerRequest.id);
    });

    it('blocks sending when request is PENDING', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.PENDING);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ text: 'Hi' });
      expect(res.status).toBe(409);
    });

    it('blocks sending when request is REJECTED', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.REJECTED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ text: 'Hi' });
      expect(res.status).toBe(409);
    });

    it('blocks sending when request is CLOSED_ANSWERED', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.CLOSED_ANSWERED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ text: 'Hi' });
      expect(res.status).toBe(409);
    });

    it('rejects empty text', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.ACCEPTED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ text: '' });
      expect(res.status).toBe(400);
    });

    it('rejects non-participants', async () => {
      const { answerRequest, outsider } = await setupScenario(AnswerRequestStatus.ACCEPTED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ text: 'Hi' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/requests/:id/messages/read', () => {
    it('marks only messages visible to caller as read', async () => {
      const { answerRequest, q, r } = await setupScenario(AnswerRequestStatus.ACCEPTED);

      // A message visible only to responder — questioner must NOT mark it read.
      await prisma.message.create({
        data: {
          questionId: answerRequest.questionId,
          answerRequestId: answerRequest.id,
          senderId: r.id,
          text: 'responder-only system',
          type: MessageType.SYSTEM,
          visibleToUserId: r.id,
        },
      });
      // A shared message from responder
      const shared = await prisma.message.create({
        data: {
          questionId: answerRequest.questionId,
          answerRequestId: answerRequest.id,
          senderId: r.id,
          text: 'shared',
        },
      });

      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages/read`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.status).toBe(200);

      const sharedRefreshed = await prisma.message.findUnique({ where: { id: shared.id } });
      expect(sharedRefreshed?.readAt).not.toBeNull();
    });

    it('rejects non-participants', async () => {
      const { answerRequest, outsider } = await setupScenario(AnswerRequestStatus.ACCEPTED);
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/messages/read`)
        .set('Authorization', `Bearer ${outsider.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/requests/:id/messages/thread', () => {
    it('returns chat context with canType flag', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.ACCEPTED);
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/messages/thread`)
        .set('Authorization', `Bearer ${q.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.canType).toBe(true);
      expect(res.body.data.question.title).toBe('Chat test');
      expect(res.body.data.counterparty).toHaveProperty('username');
    });

    it('reports canType=false when request is PENDING', async () => {
      const { answerRequest, q } = await setupScenario(AnswerRequestStatus.PENDING);
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/messages/thread`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.body.data.canType).toBe(false);
    });
  });
});
