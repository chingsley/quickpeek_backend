"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.listCategories = void 0;
const client_1 = require("@prisma/client");
const client_2 = __importDefault(require("../../../core/database/prisma/client"));
const constants_1 = require("../../../common/constants");
const slugify = (name) => name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const pickPublicCategory = (c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    createdAt: c.createdAt.toISOString(),
});
/**
 * GET /categories — public list, ordered by name.
 */
const listCategories = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield client_2.default.category.findMany({
            orderBy: { name: 'asc' },
        });
        return res.status(200).json({
            message: 'Successful',
            data: categories.map(pickPublicCategory),
        });
    }
    catch (error) {
        console.error('listCategories error:', error);
        return res.status(500).json({ error: 'Failed to fetch categories' });
    }
});
exports.listCategories = listCategories;
/**
 * POST /categories — admin only. Body: { name, slug? }.
 * Slug defaults to a slugified name. Conflict -> 409.
 */
const createCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { name, slug } = req.body;
        const finalSlug = (slug !== null && slug !== void 0 ? slug : slugify(name)).trim();
        if (!finalSlug) {
            return res.status(400).json({ error: 'Could not derive slug from name' });
        }
        const category = yield client_2.default.category.create({
            data: { name: name.trim(), slug: finalSlug },
        });
        return res.status(201).json({
            message: 'Category created successfully',
            data: pickPublicCategory(category),
        });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            error.code === constants_1.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
            const target = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target;
            const field = (target === null || target === void 0 ? void 0 : target.includes('slug')) ? 'slug' : 'name';
            return res.status(409).json({ error: `A category with this ${field} already exists` });
        }
        console.error('createCategory error:', error);
        return res.status(500).json({ error: 'Failed to create category' });
    }
});
exports.createCategory = createCategory;
/**
 * PUT /categories/:id — admin only. Body: { name?, slug? }.
 * At least one field must be supplied.
 */
const updateCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const { name, slug } = req.body;
        if (!name && !slug) {
            return res.status(400).json({ error: 'Provide at least one of name or slug to update' });
        }
        const data = {};
        if (name)
            data.name = name.trim();
        if (slug)
            data.slug = slug.trim();
        const updated = yield client_2.default.category.update({
            where: { id },
            data,
        });
        return res.status(200).json({
            message: 'Category updated successfully',
            data: pickPublicCategory(updated),
        });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                return res.status(404).json({ error: 'Category not found' });
            }
            if (error.code === constants_1.PRISMA_UNIQUE_CONSTRAINT_VIOLATION_CODE) {
                const target = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target;
                const field = (target === null || target === void 0 ? void 0 : target.includes('slug')) ? 'slug' : 'name';
                return res.status(409).json({ error: `A category with this ${field} already exists` });
            }
        }
        console.error('updateCategory error:', error);
        return res.status(500).json({ error: 'Failed to update category' });
    }
});
exports.updateCategory = updateCategory;
/**
 * DELETE /categories/:id — admin only. 404 if missing. 409 if questions use it.
 */
const deleteCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        yield client_2.default.category.delete({ where: { id } });
        return res.status(200).json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
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
});
exports.deleteCategory = deleteCategory;
