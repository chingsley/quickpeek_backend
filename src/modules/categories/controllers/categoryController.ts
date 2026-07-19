import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../../core/database/prisma/client';
import { PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE } from '../../../common/constants';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const pickPublicCategory = (c: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  createdAt: c.createdAt.toISOString(),
});

/**
 * GET /categories — public list, ordered by name.
 */
export const listCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    return res.status(200).json({
      message: 'Successful',
      data: categories.map(pickPublicCategory),
    });
  } catch (error) {
    console.error('listCategories error:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

/**
 * POST /categories — admin only. Body: { name, slug? }.
 * Slug defaults to a slugified name. Conflict -> 409.
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, slug } = req.body;
    const finalSlug = (slug ?? slugify(name)).trim();

    if (!finalSlug) {
      return res.status(400).json({ error: 'Could not derive slug from name' });
    }

    const category = await prisma.category.create({
      data: { name: name.trim(), slug: finalSlug },
    });

    return res.status(201).json({
      message: 'Category created successfully',
      data: pickPublicCategory(category),
    });
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE
    ) {
      const target = error.meta?.target as string[] | undefined;
      const field = target?.includes('slug') ? 'slug' : 'name';
      return res.status(409).json({ error: `A category with this ${field} already exists` });
    }
    console.error('createCategory error:', error);
    return res.status(500).json({ error: 'Failed to create category' });
  }
};

/**
 * PUT /categories/:id — admin only. Body: { name?, slug? }.
 * At least one field must be supplied.
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    if (!name && !slug) {
      return res.status(400).json({ error: 'Provide at least one of name or slug to update' });
    }

    const data: { name?: string; slug?: string } = {};
    if (name) data.name = name.trim();
    if (slug) data.slug = slug.trim();

    const updated = await prisma.category.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      message: 'Category updated successfully',
      data: pickPublicCategory(updated),
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Category not found' });
      }
      if (error.code === PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
        const target = error.meta?.target as string[] | undefined;
        const field = target?.includes('slug') ? 'slug' : 'name';
        return res.status(409).json({ error: `A category with this ${field} already exists` });
      }
    }
    console.error('updateCategory error:', error);
    return res.status(500).json({ error: 'Failed to update category' });
  }
};

/**
 * DELETE /categories/:id — admin only. 404 if missing. 409 if questions use it.
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.category.delete({ where: { id } });

    return res.status(200).json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Category not found' });
      }
      if (error.code === 'P2003') {
        return res.status(409).json({ error: 'Cannot delete a category that has questions' });
      }
    }
    console.error('deleteCategory error:', error);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
};
