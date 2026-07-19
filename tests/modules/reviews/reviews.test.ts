import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';
import { AnswerRequestStatus, QuestionStatus } from '@prisma/client';

const buildRequestScenario = async (overrides: {
  requestStatus?: AnswerRequestStatus;
  questionStatus?: QuestionStatus;
  withActivity?: boolean;
} = {}) => {
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
      title: 'Review test',
      detail: 'detail body',
      categoryId: cat.id,
      price: 5,
      acceptanceCriteria: 'criteria',
      userId: q.id,
      status: overrides.questionStatus ?? QuestionStatus.OPEN,
      answeredAt: overrides.questionStatus === QuestionStatus.ANSWERED ? new Date() : null,
    },
  });
  const answerRequest = await prisma.answerRequest.create({
    data: {
      questionId: question.id,
      responderId: r.id,
      questionerId: q.id,
      status: overrides.requestStatus ?? AnswerRequestStatus.ACCEPTED,
    },
  });

  if (overrides.withActivity) {
    // 4 responder messages + 3 questioner messages to meet the activity threshold
    for (let i = 0; i < 4; i++) {
      await prisma.message.create({
        data: { questionId: question.id, answerRequestId: answerRequest.id, senderId: r.id, text: `r${i}` },
      });
    }
    for (let i = 0; i < 3; i++) {
      await prisma.message.create({
        data: { questionId: question.id, answerRequestId: answerRequest.id, senderId: q.id, text: `q${i}` },
      });
    }
  }

  return { question, answerRequest, q, r, outsider };
};

describe('reviews (request-scoped, double-blind)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/requests/:id/review-eligibility', () => {
    it('unlocks when request is ACCEPTED and question is ANSWERED', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/review-eligibility`)
        .set('Authorization', `Bearer ${q.token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unlocked).toBe(true);
      expect(res.body.data.unlockedReason).toBe('marked_answered');
      expect(res.body.data.canReview).toBe(true);
    });

    it('unlocks via activity threshold without ANSWERED status', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.OPEN,
        withActivity: true,
      });
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/review-eligibility`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.body.data.unlocked).toBe(true);
      expect(res.body.data.unlockedReason).toBe('activity_threshold');
    });

    it('is locked when request is PENDING', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.PENDING,
      });
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/review-eligibility`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.body.data.unlocked).toBe(false);
    });

    it('reports alreadyReviewed after a review is submitted', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 5, comment: 'great' });

      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/review-eligibility`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.body.data.alreadyReviewed).toBe(true);
      expect(res.body.data.canReview).toBe(false);
    });

    it('rejects non-participants', async () => {
      const { answerRequest, outsider } = await buildRequestScenario();
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/review-eligibility`)
        .set('Authorization', `Bearer ${outsider.token}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/requests/:id/reviews (double-blind)', () => {
    it('creates a hidden review when only one party has reviewed', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 4, comment: 'helpful' });

      expect(res.status).toBe(201);
      expect(res.body.data.isRevealed).toBe(false);
      expect(res.body.data.revealed).toBe(false);

      const dbReview = await prisma.review.findUnique({
        where: { answerRequestId_raterId: { answerRequestId: answerRequest.id, raterId: q.id } },
      });
      expect(dbReview?.isRevealed).toBe(false);
      expect(dbReview?.stars).toBe(4);
    });

    it('reveals both reviews once both parties submit', async () => {
      const { answerRequest, q, r } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });

      const resQ = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 5, comment: 'great' });
      expect(resQ.body.data.revealed).toBe(false);

      const resR = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${r.token}`)
        .send({ stars: 4, comment: 'thanks' });
      expect(resR.body.data.revealed).toBe(true);
      expect(resR.body.data.isRevealed).toBe(true);

      // Both reviews now revealed in DB
      const reviews = await prisma.review.findMany({ where: { answerRequestId: answerRequest.id } });
      expect(reviews.every((rv) => rv.isRevealed)).toBe(true);
    });

    it('updates aggregates (UserRating) after reveal', async () => {
      const { answerRequest, q, r } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });

      await request(app).post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 5 });
      await request(app).post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${r.token}`)
        .send({ stars: 3 });

      // Questioner (q) rated the responder (r) — should be reflected in r's AS_RESPONDER aggregate
      const rAsResponder = await prisma.userRating.findUnique({
        where: { userId_role: { userId: r.id, role: 'AS_RESPONDER' } },
      });
      expect(rAsResponder?.totalStars).toBe(5);
      expect(rAsResponder?.reviewsCount).toBe(1);

      const qAsQuestioner = await prisma.userRating.findUnique({
        where: { userId_role: { userId: q.id, role: 'AS_QUESTIONER' } },
      });
      expect(qAsQuestioner?.totalStars).toBe(3);
      expect(qAsQuestioner?.reviewsCount).toBe(1);
    });

    it('rejects reviewing when locked', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.PENDING,
      });
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 5 });
      expect(res.status).toBe(409);
    });

    it('rejects invalid star values', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 7 });
      expect(res.status).toBe(400);
    });

    it('rejects non-participants', async () => {
      const { answerRequest, outsider } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      const res = await request(app)
        .post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ stars: 5 });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/requests/:id/my-review', () => {
    it('returns null when no review submitted', async () => {
      const { answerRequest, q } = await buildRequestScenario();
      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/my-review`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('returns the caller review when submitted', async () => {
      const { answerRequest, q } = await buildRequestScenario({
        requestStatus: AnswerRequestStatus.ACCEPTED,
        questionStatus: QuestionStatus.ANSWERED,
      });
      await request(app).post(`/api/v1/requests/${answerRequest.id}/reviews`)
        .set('Authorization', `Bearer ${q.token}`)
        .send({ stars: 5, comment: 'great' });

      const res = await request(app)
        .get(`/api/v1/requests/${answerRequest.id}/my-review`)
        .set('Authorization', `Bearer ${q.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.stars).toBe(5);
      expect(res.body.data.comment).toBe('great');
    });
  });
});
