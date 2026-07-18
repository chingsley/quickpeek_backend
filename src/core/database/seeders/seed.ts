import { MessageType, PrismaClient, QuestionStatus, RatingRole, ReviewerRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

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
  { lon: -63.6180, lat: 44.6130 },
  { lon: -63.6205, lat: 44.6115 },
  { lon: -63.6170, lat: 44.6120 },
  { lon: -63.6210, lat: 44.6140 },
  { lon: -63.6160, lat: 44.6105 },
  { lon: -63.6220, lat: 44.6135 },
  { lon: -63.6155, lat: 44.6110 },
  { lon: -63.6185, lat: 44.6145 },
  { lon: -63.6195, lat: 44.6100 },
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
];

function makeEmail(suffix: string) {
  return `test${suffix}@quickpeek.com`;
}

const THIRTY_MIN_MS = 30 * 60 * 1000;

async function createSystemMessage(questionId: string, senderId: string, text: string) {
  return prisma.message.create({
    data: {
      questionId,
      senderId,
      text,
      type: MessageType.SYSTEM,
    },
  });
}

async function seed() {
  console.log('Clearing existing data…');
  await prisma.review.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.userRating.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Creating users…');
  const passwordHash = await bcrypt.hash('password123', 10);
  const users: { id: string; email: string; name: string; username: string; }[] = [];

  for (let i = 0; i < USER_DEFS.length; i++) {
    const def = USER_DEFS[i];
    const loc = LOCATION_PRESETS[i];
    const user = await prisma.user.create({
      data: {
        email: makeEmail(def.suffix),
        password: passwordHash,
        name: def.name,
        username: def.username,
        deviceType: i % 2 === 0 ? 'ios' : 'android',
        deviceToken: faker.string.uuid(),
        notificationsEnabled: true,
        locationSharingEnabled: true,
        isVerified: true,
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

  console.log('\nCreating outbox questions for test03…');
  const outboxDefs = [
    { text: 'Is the pharmacy at Spryfield Mall open on Sundays?', status: QuestionStatus.ANSWERED, assignedIdx: 1 },
    { text: 'How long is the wait at the walk-in clinic right now?', status: QuestionStatus.ANSWERED, assignedIdx: 2 },
    { text: 'Are there any parking spots available near the library entrance?', status: QuestionStatus.ASSIGNED, assignedIdx: 0 },
    { text: 'What are the specials at the pizza place today?', status: QuestionStatus.ASSIGNED, assignedIdx: 4 },
    { text: 'Is the playground behind the rec centre busy this afternoon?', status: QuestionStatus.EXPIRED, assignedIdx: 5 },
    { text: 'Does Anyone know if the bus stop on Herring Cove is still under construction?', status: QuestionStatus.OPEN, assignedIdx: null },
    { text: 'Has the new coffee shop at the mall opened yet?', status: QuestionStatus.ANSWERED, assignedIdx: 6 },
  ];

  for (const qdef of outboxDefs) {
    const assignedIdx = qdef.assignedIdx;
    const questionData: any = {
      userId: test03.id,
      text: qdef.text,
      longitude: centralLongitude + (Math.random() - 0.5) * 0.005,
      latitude: centralLatitude + (Math.random() - 0.5) * 0.005,
      address: ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)],
      status: qdef.status,
    };

    if (assignedIdx !== null) {
      questionData.assignedResponderId = users[assignedIdx].id;
      questionData.assignedAt =
        qdef.status === QuestionStatus.ASSIGNED
          ? new Date()
          : new Date(Date.now() - 15 * 60 * 1000);

      if (qdef.status === QuestionStatus.EXPIRED) {
        questionData.timeToRespondMs = THIRTY_MIN_MS;
        questionData.respondByAt = new Date(Date.now() - 10 * 60 * 1000);
        questionData.expiredAt = questionData.respondByAt;
      } else if (qdef.status === QuestionStatus.ANSWERED) {
        questionData.timeToRespondMs = THIRTY_MIN_MS;
      }
    }

    if (qdef.status === QuestionStatus.ANSWERED) {
      questionData.answeredAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    }

    const question = await prisma.question.create({ data: questionData });

    if (assignedIdx !== null) {
      await prisma.message.create({
        data: {
          questionId: question.id,
          senderId: test03.id,
          text: question.address,
        },
      });
      await prisma.message.create({
        data: {
          questionId: question.id,
          senderId: test03.id,
          text: qdef.text,
        },
      });

      if (qdef.status === QuestionStatus.ANSWERED) {
        const responderId = users[assignedIdx].id;
        const threadMessages = [
          'Let me check that for you.',
          'I am nearby and can take a look.',
          'Just got there, one moment.',
          'Here is what I see right now.',
        ];
        for (const text of threadMessages) {
          await prisma.message.create({
            data: {
              questionId: question.id,
              senderId: responderId,
              text,
            },
          });
        }
        await prisma.message.create({
          data: {
            questionId: question.id,
            senderId: test03.id,
            text: 'Thanks, that helps a lot!',
          },
        });

        const now = new Date();
        await prisma.review.createMany({
          data: [
            {
              questionId: question.id,
              raterId: test03.id,
              rateeId: responderId,
              raterRole: ReviewerRole.QUESTIONER,
              stars: 5,
              comment: REVIEW_COMMENTS[Math.floor(Math.random() * REVIEW_COMMENTS.length)],
              isRevealed: true,
              revealedAt: now,
            },
            {
              questionId: question.id,
              raterId: responderId,
              rateeId: test03.id,
              raterRole: ReviewerRole.RESPONDER,
              stars: 4,
              comment: 'Clear question and easy to help with.',
              isRevealed: true,
              revealedAt: now,
            },
          ],
        });
      }

      if (qdef.status === QuestionStatus.EXPIRED) {
        await createSystemMessage(
          question.id,
          test03.id,
          `${test03.name} set a 30 minutes response window.`,
        );
        await createSystemMessage(
          question.id,
          test03.id,
          'Response window expired.',
        );
      }
    }
  }

  console.log('\nCreating inbox questions for test03…');
  const inboxDefs = [
    { text: 'Is there a lineup at the bank inside the mall?', fromIdx: 0, status: QuestionStatus.ANSWERED },
    { text: 'What time does the community centre close tonight?', fromIdx: 1, status: QuestionStatus.ANSWERED },
    { text: 'Is the Sobeys on Herring Cove Rd restocked on milk today?', fromIdx: 2, status: QuestionStatus.ASSIGNED },
    { text: 'How busy is the parking lot at the Spryfield Mall right now?', fromIdx: 6, status: QuestionStatus.ASSIGNED },
    { text: 'Is the farmers market still running this Saturday morning?', fromIdx: 4, status: QuestionStatus.EXPIRED },
  ];

  for (const qdef of inboxDefs) {
    const fromUser = users[qdef.fromIdx];
    const questionAddress = ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)];
    const questionData: any = {
      userId: fromUser.id,
      text: qdef.text,
      longitude: centralLongitude + (Math.random() - 0.5) * 0.005,
      latitude: centralLatitude + (Math.random() - 0.5) * 0.005,
      address: questionAddress,
      status: qdef.status,
      assignedResponderId: test03.id,
      assignedAt:
        qdef.status === QuestionStatus.ASSIGNED
          ? new Date()
          : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      answeredAt: qdef.status === QuestionStatus.ANSWERED ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
    };

    if (qdef.status === QuestionStatus.EXPIRED) {
      questionData.timeToRespondMs = THIRTY_MIN_MS;
      questionData.respondByAt = new Date(Date.now() - 20 * 60 * 1000);
      questionData.expiredAt = questionData.respondByAt;
    } else if (qdef.status === QuestionStatus.ANSWERED) {
      questionData.timeToRespondMs = THIRTY_MIN_MS;
    }

    const question = await prisma.question.create({ data: questionData });

    await prisma.message.create({
      data: { questionId: question.id, senderId: fromUser.id, text: questionAddress },
    });
    await prisma.message.create({
      data: { questionId: question.id, senderId: fromUser.id, text: qdef.text },
    });

    if (qdef.status === QuestionStatus.ANSWERED) {
      for (const text of ['On my way to check.', 'Almost there.', 'Checking now.', 'Here is the update.']) {
        await prisma.message.create({
          data: { questionId: question.id, senderId: test03.id, text },
        });
      }
    }

    if (qdef.status === QuestionStatus.EXPIRED) {
      await createSystemMessage(
        question.id,
        fromUser.id,
        `${fromUser.name} set a 30 minutes response window.`,
      );
      await createSystemMessage(
        question.id,
        fromUser.id,
        'Response window expired.',
      );
    }
  }

  console.log('\nCreating a pending double-blind review demo…');
  const pendingQuestion = await prisma.question.create({
    data: {
      userId: users[0].id,
      text: 'Is the post office still open today?',
      longitude: centralLongitude,
      latitude: centralLatitude,
      address: ADDRESSES[0],
      status: QuestionStatus.ANSWERED,
      assignedResponderId: users[1].id,
      assignedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      answeredAt: new Date(Date.now() - 60 * 60 * 1000),
      timeToRespondMs: THIRTY_MIN_MS,
    },
  });

  await prisma.message.createMany({
    data: [
      { questionId: pendingQuestion.id, senderId: users[0].id, text: ADDRESSES[0] },
      { questionId: pendingQuestion.id, senderId: users[0].id, text: 'Is the post office still open today?' },
      { questionId: pendingQuestion.id, senderId: users[1].id, text: 'Let me look.' },
      { questionId: pendingQuestion.id, senderId: users[1].id, text: 'Still a few people inside.' },
      { questionId: pendingQuestion.id, senderId: users[1].id, text: 'Looks open for another hour.' },
      { questionId: pendingQuestion.id, senderId: users[1].id, text: 'Sign says closing at 5.' },
      { questionId: pendingQuestion.id, senderId: users[0].id, text: 'Perfect, thanks!' },
      { questionId: pendingQuestion.id, senderId: users[0].id, text: 'That is all I needed.' },
      { questionId: pendingQuestion.id, senderId: users[0].id, text: 'Appreciate the quick help.' },
    ],
  });

  await prisma.review.create({
    data: {
      questionId: pendingQuestion.id,
      raterId: users[0].id,
      rateeId: users[1].id,
      raterRole: ReviewerRole.QUESTIONER,
      stars: 5,
      comment: 'Waiting for responder review before this shows publicly.',
      isRevealed: false,
    },
  });

  console.log('\nComputing user rating aggregates…');
  const revealedReviews = await prisma.review.findMany({ where: { isRevealed: true } });
  const aggregateMap: Record<string, Record<RatingRole, { totalStars: number; reviewsCount: number; }>> = {};

  for (const review of revealedReviews) {
    const role =
      review.raterRole === ReviewerRole.QUESTIONER
        ? RatingRole.AS_RESPONDER
        : RatingRole.AS_QUESTIONER;

    if (!aggregateMap[review.rateeId]) {
      aggregateMap[review.rateeId] = {
        [RatingRole.AS_RESPONDER]: { totalStars: 0, reviewsCount: 0 },
        [RatingRole.AS_QUESTIONER]: { totalStars: 0, reviewsCount: 0 },
      };
    }

    aggregateMap[review.rateeId][role].totalStars += review.stars;
    aggregateMap[review.rateeId][role].reviewsCount += 1;
  }

  for (const [userId, roles] of Object.entries(aggregateMap)) {
    for (const [role, agg] of Object.entries(roles)) {
      if (agg.reviewsCount === 0) continue;
      await prisma.userRating.create({
        data: {
          userId,
          role: role as RatingRole,
          totalStars: agg.totalStars,
          reviewsCount: agg.reviewsCount,
        },
      });
    }
  }

  console.log('\nRefreshing location timestamps for nearby-responder queries…');
  await prisma.$executeRaw`UPDATE locations SET "updatedAt" = NOW()`;

  console.log('\n✅ Seed complete!');
  console.log(`   Login: ${test03.email} / password: password123`);
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
