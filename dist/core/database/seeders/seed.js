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
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const faker_1 = require("@faker-js/faker");
const messages_utils_1 = require("../../../common/utils/messages.utils");
const ratings_1 = require("../../../common/utils/ratings");
const redis_1 = __importDefault(require("../../../core/config/redis"));
const prisma = new client_1.PrismaClient();
const centralLongitude = -63.6192829;
const centralLatitude = 44.6126388;
const USER_DEFS = [
    { suffix: '00', name: 'Alice Morgan', username: 'alice_m' },
    { suffix: '01', name: 'Bob Chen', username: 'bob_chen' },
    { suffix: '02', name: 'Carla Diaz', username: 'carla_d' },
    { suffix: '03', name: 'David Park', username: 'david_p' },
    { suffix: '04', name: 'Elena Rossi', username: 'elena_r' },
    { suffix: '05', name: 'Felix Nguyen', username: 'felix_n' },
    { suffix: '06', name: 'Grace Okafor', username: 'grace_o' },
    { suffix: '07', name: 'Henry Kim', username: 'henry_k' },
    { suffix: '08', name: 'Iris Johansson', username: 'iris_j' },
    { suffix: '09', name: 'Jack Liu', username: 'jack_l' },
];
const LOCATION_PRESETS = [
    { lon: -63.6191, lat: 44.6125 },
    { lon: -63.618, lat: 44.613 },
    { lon: -63.6205, lat: 44.6115 },
    { lon: -63.617, lat: 44.612 },
    { lon: -63.621, lat: 44.614 },
    { lon: -63.616, lat: 44.6105 },
    { lon: -63.622, lat: 44.6135 },
    { lon: -63.6155, lat: 44.611 },
    { lon: -63.6185, lat: 44.6145 },
    { lon: -63.6195, lat: 44.61 },
];
const CATEGORY_DEFS = [
    { name: 'Location', slug: 'location' },
    { name: 'How-to', slug: 'how-to' },
    { name: 'Driving', slug: 'driving' },
    { name: 'Cooking', slug: 'cooking' },
    { name: 'Services', slug: 'services' },
    { name: 'Shopping', slug: 'shopping' },
    { name: 'Tech', slug: 'tech' },
    { name: 'Other', slug: 'other' },
];
const ADDRESSES = [
    '296 Herring Cove Rd, Halifax, NS',
    '320 Herring Cove Rd, Halifax, NS',
    '16 Sussex St, Halifax, NS',
    '10 Kidston Rd, Halifax, NS',
    '50 Drysdale Rd, Halifax, NS',
    '15 Heather St, Halifax, NS',
    '30 Dentith Rd, Halifax, NS',
    '350 Herring Cove Rd, Halifax, NS',
    '12 River Rd, Halifax, NS',
    '8 Collins Rd, Halifax, NS',
];
const REVIEW_COMMENTS = [
    'Very helpful and quick to respond!',
    'Great local knowledge, would ask again.',
    'Polite and detailed answer.',
    'Responded quickly even though it was busy.',
    'Clear and honest about what they saw.',
    'Went above and beyond with extra context.',
    'Friendly and easy to work with.',
    'Answer matched exactly what I needed.',
    'Professional and on time.',
    'Would recommend to others in the area.',
    'Thoughtful follow-up after the first reply.',
    'Accurate details and good photos.',
    'Patient with my follow-up questions.',
    'Made the whole process straightforward.',
    'Reliable and trustworthy.',
];
const REVIEWS_PER_USER = 10;
const DECLINE_REASONS = [
    'Question already answered',
    'Already got a response',
    'Prefer someone closer to the specified location',
    'I no longer need the information',
];
function makeEmail(suffix) {
    return `test${suffix}@quickpeek.com`;
}
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomStars() {
    return Math.floor(Math.random() * 5) + 1;
}
function createSystemMessage(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        return prisma.message.create({
            data: {
                questionId: opts.questionId,
                answerRequestId: opts.answerRequestId,
                senderId: opts.senderId,
                text: opts.text,
                type: client_1.MessageType.SYSTEM,
                visibleToUserId: (_a = opts.visibleToUserId) !== null && _a !== void 0 ? _a : null,
            },
        });
    });
}
/**
 * Mirrors `createRequest` in requestController.ts: AnswerRequest PENDING +
 * question-info USER messages from the questioner + 2 role-specific SYSTEM
 * messages. This is the only entry point for seeding a request-to-respond.
 */
function seedRequestToRespond(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield prisma.answerRequest.create({
            data: {
                questionId: opts.question.id,
                responderId: opts.responder.id,
                questionerId: opts.question.userId,
                status: client_1.AnswerRequestStatus.PENDING,
            },
        });
        // Question info first, posted as USER messages from the questioner.
        yield (0, messages_utils_1.createQuestionBriefingMessages)({
            questionId: opts.question.id,
            answerRequestId: request.id,
            questionerId: opts.question.userId,
            responderId: opts.responder.id,
            question: {
                address: opts.question.address,
                latitude: opts.question.latitude,
                longitude: opts.question.longitude,
                detail: opts.question.detail,
                acceptanceCriteria: opts.question.acceptanceCriteria,
            },
        });
        yield createSystemMessage({
            questionId: opts.question.id,
            answerRequestId: request.id,
            senderId: opts.responder.id,
            text: `Your request to answer the question has been sent to the question creator. We'll let you know when they respond.`,
            visibleToUserId: opts.responder.id,
        });
        yield createSystemMessage({
            questionId: opts.question.id,
            answerRequestId: request.id,
            senderId: opts.responder.id,
            text: `You have a request by @${opts.responder.username} to respond to your question. View their profile before accepting the request.`,
            visibleToUserId: opts.question.userId,
        });
        return request;
    });
}
/**
 * Mirrors `acceptRequest`: AnswerRequest PENDING → ACCEPTED with respondedAt,
 * plus 2 role-specific SYSTEM messages. No question-info re-posting.
 */
function seedAcceptRequest(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        yield prisma.answerRequest.update({
            where: { id: opts.requestId },
            data: { status: client_1.AnswerRequestStatus.ACCEPTED, respondedAt: new Date() },
        });
        yield createSystemMessage({
            questionId: opts.questionId,
            answerRequestId: opts.requestId,
            senderId: opts.questionerId,
            text: `You approved @${opts.responder.username} to respond`,
            visibleToUserId: opts.questionerId,
        });
        yield createSystemMessage({
            questionId: opts.questionId,
            answerRequestId: opts.requestId,
            senderId: opts.questionerId,
            text: 'Request accepted. Send your response.',
            visibleToUserId: opts.responder.id,
        });
    });
}
/**
 * Mirrors `rejectRequest` (decline flow): AnswerRequest → REJECTED with reason + respondedAt,
 * QuestionResponderBlock row, and role-specific SYSTEM messages (questioner + responder).
 */
function seedDeclineRequest(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        yield prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            yield tx.answerRequest.update({
                where: { id: opts.requestId },
                data: {
                    status: client_1.AnswerRequestStatus.REJECTED,
                    rejectionReason: opts.rejectionReason,
                    respondedAt: new Date(),
                },
            });
            yield tx.questionResponderBlock.create({
                data: {
                    questionId: opts.questionId,
                    responderId: opts.responder.id,
                    answerRequestId: opts.requestId,
                    rejectionReason: opts.rejectionReason,
                },
            });
        }));
        yield createSystemMessage({
            questionId: opts.questionId,
            answerRequestId: opts.requestId,
            senderId: opts.questionerId,
            text: `You declined @${opts.responder.username}'s request`,
            visibleToUserId: opts.questionerId,
        });
        yield createSystemMessage({
            questionId: opts.questionId,
            answerRequestId: opts.requestId,
            senderId: opts.questionerId,
            text: `Your request was declined: ${opts.rejectionReason}`,
            visibleToUserId: opts.responder.id,
        });
    });
}
/**
 * Mirrors `sendMessage`: a plain USER message. Only valid while the request
 * is ACCEPTED; the seed is responsible for calling this in the right order.
 */
function seedUserMessage(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.message.create({
            data: Object.assign(Object.assign({ questionId: opts.questionId, answerRequestId: opts.answerRequestId, senderId: opts.senderId, text: opts.text, type: client_1.MessageType.USER }, (opts.createdAt ? { createdAt: opts.createdAt } : {})), (opts.readAt !== undefined ? { readAt: opts.readAt } : {})),
        });
    });
}
/**
 * Mirrors `closeQuestion`: Question → CLOSED, closeReason, closedAt, and
 * answeredAt (only when reason === 'Question answered'). Every PENDING request
 * on the question transitions to CLOSED_ANSWERED with a SYSTEM notice to that
 * responder. ACCEPTED requests are NOT touched.
 */
function seedCloseQuestion(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const isAnsweredClose = opts.reason === 'Question answered';
        const systemText = isAnsweredClose
            ? 'Question has been answered.'
            : 'Question has been closed.';
        yield prisma.question.update({
            where: { id: opts.questionId },
            data: {
                status: client_1.QuestionStatus.CLOSED,
                closeReason: opts.reason,
                closedAt: now,
                answeredAt: isAnsweredClose ? now : null,
            },
        });
        const pendingRequests = yield prisma.answerRequest.findMany({
            where: { questionId: opts.questionId, status: client_1.AnswerRequestStatus.PENDING },
            select: { id: true, responderId: true },
        });
        if (pendingRequests.length > 0) {
            yield prisma.answerRequest.updateMany({
                where: { id: { in: pendingRequests.map((r) => r.id) } },
                data: { status: client_1.AnswerRequestStatus.CLOSED_ANSWERED, respondedAt: now },
            });
            for (const r of pendingRequests) {
                yield createSystemMessage({
                    questionId: opts.questionId,
                    answerRequestId: r.id,
                    senderId: r.responderId,
                    text: systemText,
                    visibleToUserId: r.responderId,
                });
            }
        }
    });
}
/**
 * Mirrors mutual review reveal: writes both Review rows with isRevealed=true
 * and recomputes the canonical UserRating aggregates via the shared helper.
 * Caller must ensure the question was closed as answered (sets answeredAt) so
 * `isReviewUnlocked` would pass.
 */
function seedMutualReview(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const revealedAt = new Date();
        yield prisma.review.createMany({
            data: [
                {
                    answerRequestId: opts.requestId,
                    raterId: opts.questionerId,
                    rateeId: opts.responderId,
                    raterRole: client_1.ReviewerRole.QUESTIONER,
                    stars: opts.questionerStars,
                    comment: (_a = opts.questionerComment) !== null && _a !== void 0 ? _a : null,
                    isRevealed: true,
                    revealedAt,
                },
                {
                    answerRequestId: opts.requestId,
                    raterId: opts.responderId,
                    rateeId: opts.questionerId,
                    raterRole: client_1.ReviewerRole.RESPONDER,
                    stars: opts.responderStars,
                    comment: (_b = opts.responderComment) !== null && _b !== void 0 ? _b : null,
                    isRevealed: true,
                    revealedAt,
                },
            ],
        });
        yield (0, ratings_1.recomputeUserRatingAggregate)(opts.responderId, client_1.RatingRole.AS_RESPONDER);
        yield (0, ratings_1.recomputeUserRatingAggregate)(opts.questionerId, client_1.RatingRole.AS_QUESTIONER);
    });
}
/**
 * Minimal answered-and-closed flow used to seed profile reviews. Mirrors the
 * canonical happy path: request → accept → answer exchange → close → mutual review.
 */
function seedCompletedReviewFlow(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const question = yield prisma.question.create({
            data: {
                title: `Review seed ${opts.responder.username} #${opts.flowIndex + 1}`,
                detail: `Seeded closed question for review aggregation (${opts.questioner.name} asked, ${opts.responder.username} answered).`,
                categoryId: opts.categoryId,
                price: 3,
                acceptanceCriteria: 'Any helpful answer with enough detail to close the question.',
                userId: opts.questioner.id,
                status: client_1.QuestionStatus.OPEN,
            },
        });
        const fullQuestion = {
            id: question.id,
            userId: opts.questioner.id,
            address: null,
            latitude: null,
            longitude: null,
            detail: question.detail,
            acceptanceCriteria: question.acceptanceCriteria,
        };
        const request = yield seedRequestToRespond({
            question: fullQuestion,
            responder: opts.responder,
        });
        yield seedAcceptRequest({
            questionId: question.id,
            requestId: request.id,
            questionerId: opts.questioner.id,
            responder: opts.responder,
        });
        yield seedUserMessage({
            questionId: question.id,
            answerRequestId: request.id,
            senderId: opts.responder.id,
            text: 'Here is the information you asked for — hope it helps.',
        });
        yield seedUserMessage({
            questionId: question.id,
            answerRequestId: request.id,
            senderId: opts.questioner.id,
            text: 'Perfect, thank you! That is exactly what I needed.',
        });
        yield seedCloseQuestion({ questionId: question.id, reason: 'Question answered' });
        yield seedMutualReview({
            requestId: request.id,
            questionerId: opts.questioner.id,
            responderId: opts.responder.id,
            questionerStars: opts.questionerStars,
            questionerComment: opts.questionerComment,
            responderStars: opts.responderStars,
            responderComment: opts.responderComment,
        });
    });
}
function seedBulkReviewsPerUser(users, categoryId) {
    return __awaiter(this, void 0, void 0, function* () {
        let flowIndex = 0;
        for (let rateeIndex = 0; rateeIndex < users.length; rateeIndex++) {
            const ratee = users[rateeIndex];
            const reviewers = users.filter((user) => user.id !== ratee.id);
            for (let reviewIndex = 0; reviewIndex < REVIEWS_PER_USER; reviewIndex++) {
                const questioner = reviewers[reviewIndex % reviewers.length];
                yield seedCompletedReviewFlow({
                    questioner,
                    responder: ratee,
                    categoryId,
                    flowIndex,
                    questionerStars: randomStars(),
                    responderStars: randomStars(),
                    questionerComment: pick(REVIEW_COMMENTS),
                    responderComment: pick(REVIEW_COMMENTS),
                });
                flowIndex++;
            }
            console.log(`  ${ratee.username}: ${REVIEWS_PER_USER} revealed responder reviews`);
        }
    });
}
function seed() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        console.log('Clearing existing data…');
        yield prisma.message.deleteMany({});
        yield prisma.review.deleteMany({});
        yield prisma.questionResponderBlock.deleteMany({});
        yield prisma.answerRequest.deleteMany({});
        yield prisma.userRating.deleteMany({});
        yield prisma.transaction.deleteMany({});
        yield prisma.question.deleteMany({});
        yield prisma.location.deleteMany({});
        yield prisma.category.deleteMany({});
        yield prisma.user.deleteMany({});
        console.log('Creating users…');
        const passwordHash = yield bcrypt_1.default.hash('password123', 10);
        const users = [];
        for (let i = 0; i < USER_DEFS.length; i++) {
            const def = USER_DEFS[i];
            const loc = LOCATION_PRESETS[i];
            const user = yield prisma.user.create({
                data: {
                    email: makeEmail(def.suffix),
                    password: passwordHash,
                    name: def.name,
                    username: def.username,
                    deviceType: i % 2 === 0 ? 'ios' : 'android',
                    deviceToken: faker_1.faker.string.uuid(),
                    notificationsEnabled: true,
                    locationSharingEnabled: true,
                    isVerified: true,
                    isAdmin: i === 3,
                    profileImageUrl: `https://i.pravatar.cc/150?u=${def.username}`,
                    location: {
                        create: {
                            longitude: loc.lon,
                            latitude: loc.lat,
                        },
                    },
                },
            });
            users.push({ id: user.id, email: user.email, name: def.name, username: def.username });
            console.log(`  Created ${user.email} (${def.name})`);
        }
        const test03 = users[3];
        console.log('\nCreating categories…');
        const categories = {};
        for (const def of CATEGORY_DEFS) {
            const category = yield prisma.category.create({ data: def });
            categories[def.slug] = category;
        }
        console.log('\nCreating questions for test03…');
        const outboxDefs = [
            {
                title: 'Driving lesson near Morris St',
                detail: "I'm looking for a driving lesson. My location is Morris street, Halifax.",
                categorySlug: 'driving',
                price: 10,
                acceptanceCriteria: 'A valid contact that is available and will either agree to give me the lessons or connect me to the person who will.',
                status: client_1.QuestionStatus.OPEN,
                withLocation: true,
            },
            {
                title: 'Is the Scotia branch busy?',
                detail: 'I want to know if there is a long queue in the Scotia banking hall on Spring Garden St.',
                categorySlug: 'location',
                price: 5,
                acceptanceCriteria: 'Photo proof or a current head-count of the queue.',
                status: client_1.QuestionStatus.OPEN,
                withLocation: true,
            },
            {
                title: 'How to fix a leaky faucet?',
                detail: 'My kitchen faucet drips constantly. Looking for a step-by-step for a beginner.',
                categorySlug: 'how-to',
                price: 8,
                acceptanceCriteria: 'Detailed explanation suitable for someone with no plumbing experience.',
                status: client_1.QuestionStatus.OPEN,
                withLocation: false,
            },
            {
                title: 'Best pancake recipe?',
                detail: 'Need a fluffy pancake recipe that works at high altitude.',
                categorySlug: 'cooking',
                price: 4,
                acceptanceCriteria: 'Recipe that has been tested at altitude, with photos if possible.',
                status: client_1.QuestionStatus.OPEN,
                withLocation: false,
            },
            {
                title: 'Looking for a bike mechanic',
                detail: 'Need someone to true my wheels and adjust the derailleur this week.',
                categorySlug: 'services',
                price: 25,
                acceptanceCriteria: 'A reachable contact or booking confirmation.',
                status: client_1.QuestionStatus.CLOSED,
                withLocation: true,
                closeReason: 'No longer need the information',
            },
        ];
        const outboxQuestions = [];
        for (const qdef of outboxDefs) {
            const category = categories[qdef.categorySlug];
            const address = qdef.withLocation ? pick(ADDRESSES) : null;
            const longitude = qdef.withLocation
                ? centralLongitude + (Math.random() - 0.5) * 0.005
                : null;
            const latitude = qdef.withLocation
                ? centralLatitude + (Math.random() - 0.5) * 0.005
                : null;
            const question = yield prisma.question.create({
                data: {
                    title: qdef.title,
                    detail: qdef.detail,
                    categoryId: category.id,
                    price: qdef.price,
                    acceptanceCriteria: qdef.acceptanceCriteria,
                    longitude,
                    latitude,
                    address,
                    restrictToNearby: !!qdef.withLocation,
                    userId: test03.id,
                    status: qdef.status,
                    answeredAt: qdef.closeReason === 'Question answered'
                        ? new Date(Date.now() - 60 * 60 * 1000)
                        : null,
                    closedAt: qdef.status === client_1.QuestionStatus.CLOSED ? new Date(Date.now() - 60 * 60 * 1000) : null,
                    closeReason: (_a = qdef.closeReason) !== null && _a !== void 0 ? _a : null,
                },
            });
            outboxQuestions.push({ id: question.id, title: question.title });
            console.log(`  Created question: ${question.title}`);
        }
        // Requests on test03's first OPEN question (driving lesson).
        // The driving lesson stays OPEN with several parallel chats in different states.
        const drivingQuestion = outboxQuestions[0];
        const drivingQ = yield prisma.question.findUnique({ where: { id: drivingQuestion.id } });
        if (!drivingQ)
            throw new Error('Driving lesson question not found after creation');
        const drivingPendingResponders = [users[0], users[1], users[2]];
        const drivingAcceptedResponders = [users[4], users[5], users[6]];
        const drivingDeclinedResponders = [users[7], users[8], users[9]];
        console.log('\nSeeding driving-lesson requests (pending / accepted / declined)…');
        for (const responder of drivingPendingResponders) {
            yield seedRequestToRespond({ question: drivingQ, responder });
        }
        for (const responder of drivingAcceptedResponders) {
            const request = yield seedRequestToRespond({ question: drivingQ, responder });
            yield seedAcceptRequest({
                questionId: drivingQuestion.id,
                requestId: request.id,
                questionerId: test03.id,
                responder,
            });
            // Real answer exchange — both participants see a substantive thread.
            yield seedUserMessage({
                questionId: drivingQuestion.id,
                answerRequestId: request.id,
                senderId: responder.id,
                text: `Hi! I'm ${responder.name.split(' ')[0]} and I can help with the driving lesson. When are you free this week?`,
            });
            yield seedUserMessage({
                questionId: drivingQuestion.id,
                answerRequestId: request.id,
                senderId: test03.id,
                text: 'Tomorrow morning works. I\'m near Morris St — can you come to that area?',
            });
            yield seedUserMessage({
                questionId: drivingQuestion.id,
                answerRequestId: request.id,
                senderId: responder.id,
                text: 'Yes, I can be there by 9am. I\'ll bring the cones and a clipboard.',
            });
        }
        for (const responder of drivingDeclinedResponders) {
            const request = yield seedRequestToRespond({ question: drivingQ, responder });
            const reason = pick(DECLINE_REASONS);
            yield seedDeclineRequest({
                questionId: drivingQuestion.id,
                requestId: request.id,
                questionerId: test03.id,
                responder,
                rejectionReason: reason,
            });
        }
        console.log('\nCreating incoming requests awaiting test03 approval…');
        const scotiaQuestion = outboxQuestions.find((q) => q.title === 'Is the Scotia branch busy?');
        const faucetQuestion = outboxQuestions.find((q) => q.title === 'How to fix a leaky faucet?');
        // Extra OPEN questions posted by test03, each with one pending request.
        const extraAwaitingApprovalDefs = [
            {
                title: 'Street parking on Morris?',
                detail: 'Is there any free street parking on Morris St near the waterfront right now?',
                categorySlug: 'location',
                price: 3,
                acceptanceCriteria: 'Photo of available spots or a quick yes/no.',
                responder: users[6],
            },
            {
                title: 'Dog park crowd level?',
                detail: 'How busy is the off-leash dog park at Point Pleasant this afternoon?',
                categorySlug: 'location',
                price: 4,
                acceptanceCriteria: 'Photo of the park or an estimated number of dogs/people.',
                responder: users[7],
            },
        ];
        for (const def of extraAwaitingApprovalDefs) {
            const category = categories[def.categorySlug];
            const question = yield prisma.question.create({
                data: {
                    title: def.title,
                    detail: def.detail,
                    categoryId: category.id,
                    price: def.price,
                    acceptanceCriteria: def.acceptanceCriteria,
                    longitude: centralLongitude + 0.001,
                    latitude: centralLatitude + 0.001,
                    address: pick(ADDRESSES),
                    restrictToNearby: true,
                    userId: test03.id,
                    status: client_1.QuestionStatus.OPEN,
                },
            });
            outboxQuestions.push({ id: question.id, title: question.title });
            const fullQuestion = yield prisma.question.findUnique({ where: { id: question.id } });
            if (fullQuestion) {
                yield seedRequestToRespond({ question: fullQuestion, responder: def.responder });
            }
            console.log(`  Pending incoming: ${def.title} (${def.responder.name})`);
        }
        // Pending requests on test03's other OPEN outbox questions (Scotia + faucet).
        // Driving-lesson pending requests were already created above.
        for (const [question, responder] of [
            [scotiaQuestion, users[4]],
            [faucetQuestion, users[5]],
        ]) {
            const fullQuestion = yield prisma.question.findUnique({ where: { id: question.id } });
            if (fullQuestion) {
                const existing = yield prisma.answerRequest.findFirst({
                    where: { questionId: question.id, responderId: responder.id, questionerId: test03.id },
                });
                if (!existing) {
                    yield seedRequestToRespond({ question: fullQuestion, responder });
                    console.log(`  Pending incoming: ${question.title} (${responder.name})`);
                }
            }
        }
        console.log('\nCreating questions from other users (home feed for test03)…');
        const MIN_INCOMING_QUESTIONS = 5;
        const otherUsers = users.filter((u) => u.id !== test03.id);
        let questionerRotator = 0;
        const nextQuestioner = () => otherUsers[questionerRotator++ % otherUsers.length];
        let feedQuestionIndex = 0;
        const nearYouDefs = [
            {
                title: 'Coffee shop open past 10pm?',
                categorySlug: 'location',
                price: 3,
                detail: 'Need to know if any coffee shops on Quinpool are still open after 10pm tonight.',
                acceptanceCriteria: 'Photo of the storefront hours sign or staff confirmation.',
            },
            {
                title: 'Bus stop construction on Robie?',
                categorySlug: 'location',
                price: 2,
                detail: 'Is the Robie St bus stop still closed for construction?',
                acceptanceCriteria: 'Photo or confirmation from someone on site.',
            },
            {
                title: 'ATM working at Sobeys?',
                categorySlug: 'shopping',
                price: 2,
                detail: 'The ATM inside Sobeys on Quinpool — is it working today?',
                acceptanceCriteria: 'Photo of the ATM screen or a quick yes/no from inside the store.',
            },
            {
                title: 'Line at Canada Post?',
                categorySlug: 'services',
                price: 3,
                detail: 'How long is the queue at the Canada Post outlet on Quinpool?',
                acceptanceCriteria: 'Estimated wait time or photo of the line.',
            },
            {
                title: 'Snow cleared on side street?',
                categorySlug: 'location',
                price: 4,
                detail: 'Is Collins Rd fully plowed after last night’s snow?',
                acceptanceCriteria: 'Photo showing the street surface along Collins Rd.',
            },
            {
                title: 'Pharmacy wait time?',
                categorySlug: 'services',
                price: 3,
                detail: 'Current wait time at the Shoppers on Quinpool for prescription pickup.',
                acceptanceCriteria: 'Wait time in minutes or photo of the pickup counter queue.',
            },
            {
                // Pinned location but restrictToNearby=false: anyone can answer. This
                // exercises the "toggle off" path on the /ask screen.
                title: 'Quinpool pharmacy recommendation?',
                categorySlug: 'services',
                price: 4,
                detail: 'Looking for a recommended pharmacy near Quinpool for an elderly relative — names and why.',
                acceptanceCriteria: 'Pharmacy name and a short note on service or accessibility.',
                restrictToNearby: false,
            },
        ];
        const newDefs = [
            {
                title: 'Best hiking trail this weekend?',
                categorySlug: 'other',
                price: 5,
                detail: 'Looking for a moderate hiking trail within a day trip — not in Halifax.',
                acceptanceCriteria: 'Trail name, difficulty, and current conditions.',
                request: undefined,
            },
            {
                title: 'Remote work cafe downtown?',
                categorySlug: 'location',
                price: 4,
                detail: 'Quiet cafe with outlets downtown for a few hours of work.',
                acceptanceCriteria: 'Cafe name and note on noise level and seating availability.',
            },
            {
                title: 'Street festival this Saturday?',
                categorySlug: 'other',
                price: 3,
                detail: 'Is there a street festival happening in the waterfront area this Saturday?',
                acceptanceCriteria: 'Event name, time, and whether it is confirmed.',
            },
            {
                title: 'Kids swim lessons open spots?',
                categorySlug: 'services',
                price: 6,
                detail: 'Any open beginner swim lesson slots at a public pool this month?',
                acceptanceCriteria: 'Pool name and how to register or contact.',
            },
            {
                title: 'Vintage store restock day?',
                categorySlug: 'shopping',
                price: 3,
                detail: 'When does the vintage shop on Barrington restock new items?',
                acceptanceCriteria: 'Restock day or staff confirmation.',
            },
            {
                title: 'Bookstore author event tonight?',
                categorySlug: 'other',
                price: 2,
                detail: 'Is there an author reading at a bookstore downtown tonight?',
                acceptanceCriteria: 'Store name, time, and whether tickets are needed.',
            },
        ];
        const pendingDefs = [
            {
                title: 'Sobeys restock today?',
                categorySlug: 'shopping',
                price: 3,
                detail: 'Has the Quinpool Sobeys restocked fresh bread and produce this morning?',
                acceptanceCriteria: 'Photo of the bakery or produce section showing stock levels.',
                request: 'pending',
            },
            {
                title: 'Parking at QEII hospital?',
                categorySlug: 'location',
                price: 4,
                detail: 'Is there visitor parking available at the QEII Health Sciences Centre right now?',
                acceptanceCriteria: 'Photo of the parking garage entrance or lot availability sign.',
                request: 'pending',
            },
            {
                title: 'Library study room available?',
                categorySlug: 'services',
                price: 3,
                detail: 'Are any quiet study rooms free at the Halifax Central Library this afternoon?',
                acceptanceCriteria: 'Photo of the study room booking board or desk confirmation.',
                request: 'pending',
            },
            {
                title: 'Dentist office wait time?',
                categorySlug: 'services',
                price: 5,
                detail: 'How long is the wait in the reception area at the dental clinic on Spring Garden?',
                acceptanceCriteria: 'Estimated wait in minutes or photo of the waiting room.',
                request: 'pending',
            },
            {
                title: 'Food truck at waterfront?',
                categorySlug: 'location',
                price: 3,
                detail: 'Which food trucks are set up at the Halifax waterfront today?',
                acceptanceCriteria: 'Photo of the trucks or a list of vendors on site.',
                request: 'pending',
            },
            {
                title: 'Laundromat machine free?',
                categorySlug: 'services',
                price: 2,
                detail: 'Are any washers available at the laundromat on Quinpool right now?',
                acceptanceCriteria: 'Photo showing how many machines are free.',
                request: 'pending',
            },
        ];
        const approvedDefs = [
            {
                title: 'Grocery checkout line length?',
                categorySlug: 'shopping',
                price: 3,
                detail: 'How many people are in the checkout lines at the Superstore on Quinpool?',
                acceptanceCriteria: 'Photo of the checkout area or an estimated line count.',
                request: 'approved',
            },
            {
                title: 'Post office open on holiday?',
                categorySlug: 'services',
                price: 2,
                detail: 'Is the Canada Post outlet on Quinpool open during the holiday Monday?',
                acceptanceCriteria: 'Photo of the door hours sign or staff confirmation.',
                request: 'approved',
            },
            {
                title: 'Gym pool lane availability?',
                categorySlug: 'services',
                price: 4,
                detail: 'How many swim lanes are free at the community pool this evening?',
                acceptanceCriteria: 'Photo of the pool deck or lane availability board.',
                request: 'approved',
            },
            {
                title: 'Pet store adoption event?',
                categorySlug: 'shopping',
                price: 3,
                detail: 'Is the pet store on Quinpool running an adoption event today?',
                acceptanceCriteria: 'Photo of the event setup or staff confirmation.',
                request: 'approved',
            },
            {
                title: 'Hardware store stock check?',
                categorySlug: 'shopping',
                price: 4,
                detail: 'Does the hardware store on Quinpool have 2-inch wood screws in stock?',
                acceptanceCriteria: 'Photo of the shelf label or stock bin.',
                request: 'approved',
            },
            {
                title: 'Cell phone repair shop hours?',
                categorySlug: 'tech',
                price: 3,
                detail: 'What time does the phone repair shop on Quinpool close today?',
                acceptanceCriteria: 'Photo of the storefront hours or staff confirmation.',
                request: 'approved',
            },
        ];
        // Questions where an answer was provided. Most stay OPEN (the common real-world
        // state — the questioner hasn't closed yet); a couple are closed-as-answered to
        // exercise the full close + review flow alongside the pancake seed.
        const answeredDefs = [
            {
                title: 'Farmers market still on?',
                categorySlug: 'location',
                price: 5,
                detail: 'Is the Halifax Farmers Market running today and until what time?',
                acceptanceCriteria: 'Photo of the market entrance or vendor area.',
                request: 'answered',
                responderReply: 'Yes, the market is running until 1pm today. Plenty of parking on Agricola.',
            },
            {
                // Answer given but question still OPEN — the common real-world state.
                title: 'Ice cream truck location?',
                categorySlug: 'location',
                price: 2,
                detail: 'Where is the ice cream truck parked near the Common today?',
                acceptanceCriteria: 'Photo of the truck or a pin on the block where it is parked.',
                request: 'approved',
                responderReply: 'It is parked on the south side of the Common near the playground.',
            },
            {
                // Answer given but question still OPEN — the common real-world state.
                title: 'Bus delay on route 1?',
                categorySlug: 'location',
                price: 3,
                detail: 'Is route 1 running on time through Quinpool this hour?',
                acceptanceCriteria: 'Screenshot from the transit app or photo at the stop.',
                request: 'approved',
                responderReply: 'Route 1 is about 8 minutes behind schedule at Quinpool.',
            },
            {
                // Answer given but question still OPEN — the common real-world state.
                title: 'Pizza place delivery time?',
                categorySlug: 'cooking',
                price: 4,
                detail: 'How long is delivery from the pizza place on Quinpool right now?',
                acceptanceCriteria: 'Quoted delivery time from staff or the online order page.',
                request: 'approved',
                responderReply: 'They quoted 35–40 minutes for delivery to this area.',
            },
            {
                // Answer given but question still OPEN — the common real-world state.
                title: 'Park playground open?',
                categorySlug: 'location',
                price: 2,
                detail: 'Is the playground at the neighbourhood park open and dry after the rain?',
                acceptanceCriteria: 'Photo of the playground surface and equipment.',
                request: 'approved',
                responderReply: 'Playground is open and mostly dry — only a small puddle near the swings.',
            },
            {
                title: 'Thrift store donation drop-off?',
                categorySlug: 'shopping',
                price: 3,
                detail: 'Is the thrift store on Quinpool accepting donations today?',
                acceptanceCriteria: 'Photo of the donation door sign or staff confirmation.',
                request: 'answered',
                responderReply: 'Yes, donations are being accepted until 6pm at the side entrance.',
            },
        ];
        const declinedDefs = [
            {
                title: 'Gym membership deals nearby?',
                categorySlug: 'services',
                price: 6,
                detail: 'Any current membership promotions at gyms within walking distance?',
                acceptanceCriteria: 'Photo of the promo poster or quoted monthly rate.',
                request: 'declined',
                rejectionReason: 'Prefer someone closer to the specified location',
            },
            {
                title: 'Tutoring availability this week?',
                categorySlug: 'services',
                price: 8,
                detail: 'Looking for a math tutor available for two sessions this week.',
                acceptanceCriteria: 'Tutor contact and confirmed availability.',
                request: 'declined',
                rejectionReason: 'Already got a response',
            },
            {
                title: 'House cleaning quote?',
                categorySlug: 'services',
                price: 15,
                detail: 'Need a quote for a one-time deep clean of a 2-bedroom apartment.',
                acceptanceCriteria: 'Written quote or message from a cleaner with availability.',
                request: 'declined',
                rejectionReason: 'Question already answered',
            },
            {
                title: 'Lawn mowing service?',
                categorySlug: 'services',
                price: 10,
                detail: 'Anyone available to mow a small lawn this weekend?',
                acceptanceCriteria: 'Confirmed availability and price for the job.',
                request: 'declined',
                rejectionReason: 'I no longer need the information',
            },
            {
                title: 'Car wash wait time?',
                categorySlug: 'services',
                price: 3,
                detail: 'How long is the wait at the drive-through car wash on Quinpool?',
                acceptanceCriteria: 'Estimated wait time or photo of the queue.',
                request: 'declined',
                rejectionReason: 'Prefer someone closer to the specified location',
            },
            {
                title: 'Moving help needed?',
                categorySlug: 'services',
                price: 20,
                detail: 'Need one person to help move boxes for an hour this Saturday.',
                acceptanceCriteria: 'Confirmed helper with a reachable contact.',
                request: 'declined',
                rejectionReason: 'Already got a response',
            },
        ];
        function createFeedQuestion(def, nearTest03) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                const questioner = nextQuestioner();
                const category = categories[def.categorySlug];
                const useLocation = nearTest03 || Boolean(def.request);
                const address = useLocation ? ADDRESSES[feedQuestionIndex % ADDRESSES.length] : null;
                const longitude = useLocation
                    ? nearTest03
                        ? centralLongitude + (feedQuestionIndex % 5) * 0.0004
                        : centralLongitude + 0.08 + (feedQuestionIndex % 3) * 0.01
                    : null;
                const latitude = useLocation
                    ? nearTest03
                        ? centralLatitude + (feedQuestionIndex % 5) * 0.0003
                        : centralLatitude + 0.08 + (feedQuestionIndex % 3) * 0.01
                    : null;
                const q = yield prisma.question.create({
                    data: {
                        title: def.title,
                        detail: def.detail,
                        categoryId: category.id,
                        price: def.price,
                        acceptanceCriteria: def.acceptanceCriteria,
                        longitude,
                        latitude,
                        address,
                        // Default to the /ask screen's default-ON behaviour whenever a
                        // location is pinned; individual defs can opt out via override.
                        restrictToNearby: useLocation && def.restrictToNearby !== false,
                        userId: questioner.id,
                        status: client_1.QuestionStatus.OPEN,
                    },
                });
                feedQuestionIndex++;
                if (!def.request)
                    return;
                const fullQuestion = {
                    id: q.id,
                    userId: questioner.id,
                    address,
                    latitude,
                    longitude,
                    detail: def.detail,
                    acceptanceCriteria: def.acceptanceCriteria,
                };
                const request = yield seedRequestToRespond({ question: fullQuestion, responder: test03 });
                if (def.request === 'pending') {
                    // Stays PENDING — nothing more to do.
                    return;
                }
                if (def.request === 'declined') {
                    const reason = (_a = def.rejectionReason) !== null && _a !== void 0 ? _a : pick(DECLINE_REASONS);
                    yield seedDeclineRequest({
                        questionId: q.id,
                        requestId: request.id,
                        questionerId: questioner.id,
                        responder: test03,
                        rejectionReason: reason,
                    });
                    return;
                }
                // 'approved' or 'answered' — both go through accept + real answer exchange.
                yield seedAcceptRequest({
                    questionId: q.id,
                    requestId: request.id,
                    questionerId: questioner.id,
                    responder: test03,
                });
                yield seedUserMessage({
                    questionId: q.id,
                    answerRequestId: request.id,
                    senderId: test03.id,
                    text: (_b = def.responderReply) !== null && _b !== void 0 ? _b : 'Here is the information you asked for — let me know if you need anything else.',
                });
                yield seedUserMessage({
                    questionId: q.id,
                    answerRequestId: request.id,
                    senderId: questioner.id,
                    text: 'Perfect, thank you! That\'s exactly what I needed.',
                });
                if (def.request === 'answered') {
                    // Close the question as answered and run mutual review reveal. This is
                    // the canonical end state for a fully-resolved request.
                    yield seedCloseQuestion({ questionId: q.id, reason: 'Question answered' });
                    yield seedMutualReview({
                        requestId: request.id,
                        questionerId: questioner.id,
                        responderId: test03.id,
                        questionerStars: 5,
                        questionerComment: pick(REVIEW_COMMENTS),
                        responderStars: 4,
                        responderComment: 'Clear question, easy to help.',
                    });
                }
            });
        }
        for (const def of nearYouDefs) {
            yield createFeedQuestion(def, true);
        }
        for (const def of newDefs) {
            yield createFeedQuestion(def, false);
        }
        for (const def of pendingDefs) {
            yield createFeedQuestion(def, true);
        }
        for (const def of approvedDefs) {
            yield createFeedQuestion(def, true);
        }
        for (const def of answeredDefs) {
            yield createFeedQuestion(def, true);
        }
        for (const def of declinedDefs) {
            yield createFeedQuestion(def, true);
        }
        if (feedQuestionIndex < MIN_INCOMING_QUESTIONS) {
            throw new Error(`Expected at least ${MIN_INCOMING_QUESTIONS} incoming feed questions, got ${feedQuestionIndex}`);
        }
        console.log(`  incoming questions from other users: ${feedQuestionIndex}`);
        // Pinned-location question placed clearly outside the default 5km near-me
        // radius. When the viewer (test03) turns on Near me, this question should
        // NOT appear in the list; opening its detail page should surface the
        // OUTSIDE_RADIUS disabled-button state.
        const farQuestioner = nextQuestioner();
        const farCategory = categories['location'];
        yield prisma.question.create({
            data: {
                title: 'Beach conditions at Lawrencetown?',
                detail: 'Is the sandbar at Lawrencetown exposed and how is the surf right now?',
                categoryId: farCategory.id,
                price: 5,
                acceptanceCriteria: 'Photo of the beach or a quick note on surf height.',
                // Lawrencetown Beach is ~20km east of central Halifax — well outside the
                // market near-me radius, so this question is intentionally unreachable
                // via the Near me filter.
                longitude: -63.3197,
                latitude: 44.5057,
                address: 'Lawrencetown Beach, Halifax, NS',
                restrictToNearby: true,
                userId: farQuestioner.id,
                status: client_1.QuestionStatus.OPEN,
            },
        });
        console.log('  far-away restrictToNearby question: Beach conditions at Lawrencetown?');
        // -------------------------------------------------------------------------
        // Feed priority ordering examples for test03 (default Home sort).
        // Titles are prefixed "Sort T#" so you can spot each tier in the All feed.
        // Tier-1 examples use very old unread timestamps so they stay at the top.
        // -------------------------------------------------------------------------
        console.log('\nSeeding feed priority order examples for test03…');
        const sortAuthor = users[0];
        const sortCategory = categories['location'];
        const sortReadAt = new Date('2026-06-01T12:00:00.000Z');
        const mkSortIncoming = (title, extra = {}) => prisma.question.create({
            data: Object.assign({ title, detail: 'Priority sort seed question.', categoryId: sortCategory.id, price: 3, acceptanceCriteria: 'Seed only.', userId: sortAuthor.id, status: client_1.QuestionStatus.OPEN }, extra),
        });
        const sortUnreadFirstQ = yield mkSortIncoming('Sort T1: Unread First');
        const sortUnreadSecondQ = yield mkSortIncoming('Sort T1: Unread Second');
        const sortNearbyCloseQ = yield mkSortIncoming('Sort T2: Nearby Close', {
            latitude: centralLatitude,
            longitude: centralLongitude,
            address: pick(ADDRESSES),
            restrictToNearby: true,
        });
        const sortNearbyFarQ = yield mkSortIncoming('Sort T2: Nearby Far', {
            latitude: 44.62,
            longitude: -63.62,
            address: pick(ADDRESSES),
            restrictToNearby: true,
        });
        const sortFarOlderQ = yield mkSortIncoming('Sort T3: Far Older', {
            latitude: 45.0,
            longitude: -64.0,
            createdAt: new Date('2026-01-01T10:00:00.000Z'),
        });
        const sortFarNewerQ = yield mkSortIncoming('Sort T3: Far Newer', {
            latitude: 45.1,
            longitude: -64.1,
            createdAt: new Date('2026-01-02T10:00:00.000Z'),
        });
        const sortInteractedOlderQ = yield mkSortIncoming('Sort T4: Interacted Older', {
            latitude: 44.613,
            longitude: -63.618,
            restrictToNearby: true,
            createdAt: new Date('2026-01-01T11:00:00.000Z'),
        });
        const sortInteractedNewerQ = yield mkSortIncoming('Sort T4: Interacted Newer', {
            latitude: 45.2,
            longitude: -64.2,
            createdAt: new Date('2026-01-02T11:00:00.000Z'),
        });
        const sortOutgoingOlderQ = yield prisma.question.create({
            data: {
                title: 'Sort T5: Outgoing Older',
                detail: 'Priority sort seed question.',
                categoryId: sortCategory.id,
                price: 3,
                acceptanceCriteria: 'Seed only.',
                userId: test03.id,
                status: client_1.QuestionStatus.OPEN,
                createdAt: new Date('2026-01-01T08:00:00.000Z'),
            },
        });
        const sortOutgoingNewerQ = yield prisma.question.create({
            data: {
                title: 'Sort T5: Outgoing Newer',
                detail: 'Priority sort seed question.',
                categoryId: sortCategory.id,
                price: 3,
                acceptanceCriteria: 'Seed only.',
                userId: test03.id,
                status: client_1.QuestionStatus.OPEN,
                createdAt: new Date('2026-01-03T08:00:00.000Z'),
            },
        });
        // For T1 (unread) and T4 (interacted) fixtures, drive the full realistic
        // flow: test03 requests → sortAuthor accepts. The flow's system+briefing
        // messages get back-dated below so they don't disturb the carefully tuned
        // sort ordering these fixtures exist to verify.
        const sortAcceptedQuestions = [
            sortUnreadFirstQ,
            sortUnreadSecondQ,
            sortInteractedOlderQ,
            sortInteractedNewerQ,
        ];
        const sortAcceptedRequests = [];
        for (const question of sortAcceptedQuestions) {
            const fullQuestion = yield prisma.question.findUnique({ where: { id: question.id } });
            if (!fullQuestion)
                continue;
            const request = yield seedRequestToRespond({ question: fullQuestion, responder: test03 });
            yield seedAcceptRequest({
                questionId: question.id,
                requestId: request.id,
                questionerId: sortAuthor.id,
                responder: test03,
            });
            sortAcceptedRequests.push({ id: request.id, questionId: question.id });
        }
        yield prisma.message.create({
            data: {
                questionId: sortUnreadFirstQ.id,
                answerRequestId: sortAcceptedRequests[0].id,
                senderId: sortAuthor.id,
                text: 'Oldest unread for sort seed',
                type: client_1.MessageType.USER,
                createdAt: new Date('2020-01-01T10:00:00.000Z'),
            },
        });
        yield prisma.message.create({
            data: {
                questionId: sortUnreadSecondQ.id,
                answerRequestId: sortAcceptedRequests[1].id,
                senderId: sortAuthor.id,
                text: 'Second oldest unread for sort seed',
                type: client_1.MessageType.USER,
                createdAt: new Date('2020-01-02T10:00:00.000Z'),
            },
        });
        for (const { questionId, id: answerRequestId } of sortAcceptedRequests.slice(2)) {
            yield prisma.message.create({
                data: {
                    questionId,
                    answerRequestId,
                    senderId: sortAuthor.id,
                    text: 'Read message for sort seed',
                    type: client_1.MessageType.USER,
                    readAt: sortReadAt,
                    createdAt: new Date('2026-06-01T10:00:00.000Z'),
                },
            });
        }
        // Back-date every message written by the realistic flow on the sort fixtures
        // to a moment before the earliest sort marker (2020-01-01), and mark them
        // read. This keeps the verified feed sort ordering intact while preserving
        // an end-to-end realistic chat thread on each request.
        const sortFlowBackdate = new Date('2019-12-31T10:00:00.000Z');
        const sortFlowReadAt = new Date('2019-12-31T11:00:00.000Z');
        const sortRequestIds = sortAcceptedRequests.map((r) => r.id);
        yield prisma.message.updateMany({
            where: {
                answerRequestId: { in: sortRequestIds },
                createdAt: { gt: sortFlowBackdate },
                // Only touch the flow messages (briefing + system + accept), not the
                // tuned sort-marker messages written above with explicit createdAt.
                text: { notIn: ['Oldest unread for sort seed', 'Second oldest unread for sort seed', 'Read message for sort seed'] },
            },
            data: { createdAt: sortFlowBackdate, readAt: sortFlowReadAt },
        });
        console.log('  Sort T1 → T5 priority examples seeded (search "Sort T" in Home feed)');
        // -------------------------------------------------------------------------
        // "Best pancake recipe?" — full happy-path flow for david_p (test03) and
        // henry_k (users[7]). henry_k answers, david_p closes as answered, both
        // review. A second pending request on the same question (from iris_j) is
        // closed into CLOSED_ANSWERED when david_p closes the question, exercising
        // that status transition. This is also the canonical end-to-end demo:
        // logging in as either party shows the same chat, same status, same
        // question, discoverable from Home and the conversations list.
        // -------------------------------------------------------------------------
        console.log('\nSeeding full happy-path flow on "Best pancake recipe?"…');
        const pancakeQuestion = outboxQuestions.find((q) => q.title === 'Best pancake recipe?');
        if (!pancakeQuestion) {
            throw new Error('Pancake question missing from outbox defs');
        }
        const pancakeQ = yield prisma.question.findUnique({ where: { id: pancakeQuestion.id } });
        if (!pancakeQ) {
            throw new Error('Pancake question not found after creation');
        }
        const pancakeResponder = users[7]; // henry_k
        const pancakePendingResponder = users[8]; // iris_j — pending when question closes
        // 1. henry_k requests to answer.
        const pancakeRequest = yield seedRequestToRespond({
            question: pancakeQ,
            responder: pancakeResponder,
        });
        // 2. iris_j also requests to answer — stays PENDING so closing the question
        //    will transition it to CLOSED_ANSWERED (mirrors closeQuestion's behaviour).
        yield seedRequestToRespond({
            question: pancakeQ,
            responder: pancakePendingResponder,
        });
        // 3. david_p approves henry_k.
        yield seedAcceptRequest({
            questionId: pancakeQuestion.id,
            requestId: pancakeRequest.id,
            questionerId: test03.id,
            responder: pancakeResponder,
        });
        // 4. henry_k sends the answer + david_p replies (real answer exchange).
        yield seedUserMessage({
            questionId: pancakeQuestion.id,
            answerRequestId: pancakeRequest.id,
            senderId: pancakeResponder.id,
            text: 'Here is my tested recipe: 2 cups flour, 2 eggs, 1.5 cups buttermilk, 1 tsp baking powder. Rest the batter 10 min before cooking at altitude.',
        });
        yield seedUserMessage({
            questionId: pancakeQuestion.id,
            answerRequestId: pancakeRequest.id,
            senderId: test03.id,
            text: 'Tried it this morning — came out perfectly fluffy. Thank you!',
        });
        // 5. david_p closes the question as answered. This sets answeredAt/closedAt,
        //    transitions iris_j's PENDING request to CLOSED_ANSWERED (with a system
        //    notice to iris_j), and leaves henry_k's ACCEPTED request untouched.
        yield seedCloseQuestion({ questionId: pancakeQuestion.id, reason: 'Question answered' });
        // 6. Both sides review. Reviews reveal + canonical rating aggregation runs.
        yield seedMutualReview({
            requestId: pancakeRequest.id,
            questionerId: test03.id,
            responderId: pancakeResponder.id,
            questionerStars: 5,
            questionerComment: pick(REVIEW_COMMENTS),
            responderStars: 4,
            responderComment: 'Clear question, easy to help.',
        });
        console.log('   henry_k answered and was reviewed by david_p (and vice versa)');
        console.log('\nSeeding bulk profile reviews…');
        yield seedBulkReviewsPerUser(users, categories['other'].id);
        console.log('\nRefreshing location timestamps for nearby queries…');
        yield prisma.$executeRaw `UPDATE locations SET "updatedAt" = NOW()`;
        console.log('\nSeeding market config defaults…');
        yield prisma.marketConfig.upsert({
            where: { key: 'nearMeRadiusKm' },
            update: {},
            create: { key: 'nearMeRadiusKm', value: 5 },
        });
        yield prisma.marketConfig.upsert({
            where: { key: 'reviewRevealWindowDays' },
            update: {},
            create: { key: 'reviewRevealWindowDays', value: 14 },
        });
        console.log('\n✅ Seed complete!');
        console.log(`   Login: ${test03.email} / password: password123`);
        console.log('   Home feed (test03): All questions, Incoming, Outgoing');
        console.log('   Feed sort test: search Home for "Sort T" — T1 unread FIFO, T2 nearby no-request,');
        console.log('     T3 far no-request, T4 interacted read, T5 outgoing (newest first within tier)');
        console.log('   End-to-end happy path: "Best pancake recipe?" — login as test07@quickpeek.com');
        console.log('     (henry_k / password123) to see the answered + reviewed chat from the responder side.');
        console.log('   CLOSED_ANSWERED: iris_j (test08@quickpeek.com) has a pending request on the pancake');
        console.log('     question that was closed into CLOSED_ANSWERED when david_p closed it as answered.');
        console.log(`   Profile reviews: each seed user has ${REVIEWS_PER_USER} revealed responder reviews`);
    });
}
seed()
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    yield redis_1.default.quit();
}))
    .catch((e) => __awaiter(void 0, void 0, void 0, function* () {
    console.error('Seed failed:', e);
    yield prisma.$disconnect();
    yield redis_1.default.quit();
    process.exit(1);
}));
