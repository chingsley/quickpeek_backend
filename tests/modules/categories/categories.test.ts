import request from 'supertest';
import app from '../../../src/app';
import prisma from '../../../src/core/database/prisma/client';
import { clearDatabase, createAuthUser } from '../../helpers';

describe('categories module', () => {
  let adminToken: string;
  let adminId: string;
  let userToken: string;
  let categoryId: string;

  beforeAll(async () => {
    await clearDatabase();
    const admin = await createAuthUser({
      email: 'admin@quickpeek.com',
      username: 'admin_user',
      isAdmin: true,
    });
    adminId = admin.id;
    adminToken = admin.token;

    const user = await createAuthUser({
      email: 'user@quickpeek.com',
      username: 'regular_user',
    });
    userToken = user.token;

    const category = await prisma.category.create({
      data: { name: 'Existing Category', slug: 'existing-category' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/categories', () => {
    it('returns the public list without authentication', async () => {
      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((c: any) => c.id === categoryId)).toBe(true);
      // Public shape only — no internal fields leaked
      const sample = res.body.data[0];
      expect(sample).not.toHaveProperty('updatedAt');
    });

    it('orders categories alphabetically by name', async () => {
      await prisma.category.create({ data: { name: 'AAA First', slug: 'aaa-first' } });
      await prisma.category.create({ data: { name: 'ZZZ Last', slug: 'zzz-last' } });

      const res = await request(app).get('/api/v1/categories');
      const names = res.body.data.map((c: any) => c.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe('POST /api/v1/categories (admin only)', () => {
    it('creates a category with auto-derived slug', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Tech Category' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'New Tech Category',
        slug: 'new-tech-category',
      });
    });

    it('respects an explicit slug', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Cooking Help', slug: 'kitchen' });

      expect(res.status).toBe(201);
      expect(res.body.data.slug).toBe('kitchen');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ name: 'Anonymous Category' });

      expect(res.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Forbidden Category' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin/i);
    });

    it('rejects duplicate name with 409', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing Category' });

      expect(res.status).toBe(409);
    });

    it('rejects duplicate slug with 409', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Something Else', slug: 'existing-category' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/slug/i);
    });

    it('rejects invalid payloads', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x' }); // too short

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/v1/categories/:id (admin only)', () => {
    it('updates the name', async () => {
      const created = await prisma.category.create({
        data: { name: 'Rename Me', slug: 'rename-me' },
      });

      const res = await request(app)
        .put(`/api/v1/categories/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Renamed');
      // Slug untouched
      expect(res.body.data.slug).toBe('rename-me');
    });

    it('rejects non-admin', async () => {
      const res = await request(app)
        .put(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .put('/api/v1/categories/nonexistent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Whatever' });

      expect(res.status).toBe(404);
    });

    it('rejects empty payloads', async () => {
      const res = await request(app)
        .put(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/categories/:id (admin only)', () => {
    it('deletes an unused category', async () => {
      const created = await prisma.category.create({
        data: { name: 'Delete Me', slug: 'delete-me' },
      });

      const res = await request(app)
        .delete(`/api/v1/categories/${created.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const exists = await prisma.category.findUnique({ where: { id: created.id } });
      expect(exists).toBeNull();
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app)
        .delete('/api/v1/categories/unknown-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('rejects non-admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/categories/${categoryId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('refuses to delete a category that has questions', async () => {
      const cat = await prisma.category.create({ data: { name: 'With Questions', slug: 'with-qs' } });
      await prisma.question.create({
        data: {
          title: 'Sample',
          detail: 'Sample detail body for the marketplace question.',
          categoryId: cat.id,
          price: 5,
          acceptanceCriteria: 'Anything reasonable.',
          userId: adminId,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/question/i);
    });
  });
});
