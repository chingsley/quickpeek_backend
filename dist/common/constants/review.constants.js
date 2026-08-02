"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReviewSort = exports.REVIEW_SORT_VALUES = exports.REVIEW_COMMENT_MAX_LENGTH = void 0;
/** Max review comment length — matches common marketplace caps (e.g. Airbnb). */
exports.REVIEW_COMMENT_MAX_LENGTH = 1000;
exports.REVIEW_SORT_VALUES = ['newest', 'stars_desc', 'stars_asc'];
const isReviewSort = (value) => exports.REVIEW_SORT_VALUES.includes(value);
exports.isReviewSort = isReviewSort;
