"use strict";
// src / core / queues / index.ts
Object.defineProperty(exports, "__esModule", { value: true });
const deviceUpdateQueue_1 = require("./deviceUpdateQueue");
const questionCleanupQueue_1 = require("./questionCleanupQueue");
const reviewRevealQueue_1 = require("./reviewRevealQueue");
const jobs_1 = require("../jobs");
deviceUpdateQueue_1.deviceUpdateQueue.process(jobs_1.processDeviceUpdate);
questionCleanupQueue_1.questionCleanupQueue.process(jobs_1.cleanupQuestions);
reviewRevealQueue_1.reviewRevealQueue.process(jobs_1.processReviewReveal);
questionCleanupQueue_1.questionCleanupQueue.add('cleanup', {}, {
    repeat: { cron: '0 3 * * *' },
    jobId: 'question-cleanup-daily',
}).catch((err) => {
    console.warn('questionCleanupQueue schedule:', (err === null || err === void 0 ? void 0 : err.message) || err);
});
reviewRevealQueue_1.reviewRevealQueue.add('reveal-stale-reviews', {}, {
    repeat: { cron: '0 4 * * *' },
    jobId: 'review-reveal-daily',
}).catch((err) => {
    console.warn('reviewRevealQueue schedule:', (err === null || err === void 0 ? void 0 : err.message) || err);
});
