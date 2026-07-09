import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

const centralLongitude = -63.6192829;
const centralLatitude = 44.6126388;

// Deterministic names so tests are repeatable.
const USER_DEFS = [
  { suffix: '00', name: 'Alice Morgan',   username: 'alice_m' },
  { suffix: '01', name: 'Bob Chen',       username: 'bob_chen' },
  { suffix: '02', name: 'Carla Diaz',     username: 'carla_d' },
  { suffix: '03', name: 'David Park',     username: 'david_p' },
  { suffix: '04', name: 'Elena Rossi',    username: 'elena_r' },
  { suffix: '05', name: 'Felix Nguyen',   username: 'felix_n' },
  { suffix: '06', name: 'Grace Okafor',   username: 'grace_o' },
  { suffix: '07', name: 'Henry Kim',      username: 'henry_k' },
  { suffix: '08', name: 'Iris Johansson', username: 'iris_j' },
  { suffix: '09', name: 'Jack Liu',       username: 'jack_l' },
];

const LOCATION_PRESETS: { lon: number; lat: number }[] = [
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

const OUTBOX_QUESTIONS = [
  { text: 'Is the pharmacy at Spryfield Mall open on Sundays?',                           status: 'ANSWERED', assignedIdx: 1, answerIdx: 0 },
  { text: 'How long is the wait at the walk-in clinic right now?',                         status: 'ANSWERED', assignedIdx: 2, answerIdx: 1 },
  { text: 'Are there any parking spots available near the library entrance?',              status: 'ASSIGNED', assignedIdx: 0 },
  { text: 'What are the specials at the pizza place today?',                               status: 'ASSIGNED', assignedIdx: 4 },
  { text: 'Is the playground behind the rec centre busy this afternoon?',                  status: 'EXPIRED',  assignedIdx: 5 },
  { text: 'Does Anyone know if the bus stop on Herring Cove is still under construction?', status: 'OPEN',     assignedIdx: null },
  { text: 'Has the new coffee shop at the mall opened yet?',                               status: 'ANSWERED', assignedIdx: 6, answerIdx: 4 },
];

const INBOX_QUESTIONS = [
  { text: 'Is there a lineup at the bank inside the mall?',              fromIdx: 0 },
  { text: 'What time does the community centre close tonight?',          fromIdx: 1 },
  { text: 'Does the grocery store have fresh strawberries right now?',   fromIdx: 5 },
  { text: 'Is the gym at Spryfield busy right now?',                     fromIdx: 4 },
  { text: 'Are there any events at the library this weekend?',           fromIdx: 7 },
];

const ANSWER_TEXTS = [
  'Yes, the pharmacy is open Sundays from 10 AM to 4 PM. I was there last weekend.',
  'The wait at the walk-in clinic is about 45 minutes right now. I just left.',
  'No, the bus stop construction finished last Tuesday. Buses are running normally again.',
  'It is indeed open! Coffee is good. They also have pastries.',
  'The parking lot is nearly full but there are a few spots near the back entrance.',
  'The playground is very quiet today because of the drizzle. Maybe 2-3 kids there.',
  'The special today is a large pepperoni for $12.99. Great deal!',
  'Sorry, I just drove by the bank and there is no lineup at all.',
  'The community centre closes at 9 PM on weeknights.',
  'Yes, fresh strawberries arrived this morning. Organic ones are $4.99.',
  'The gym is moderate — about half the treadmills are free.',
  'Yes, there is a board game night at the library this Saturday at 7 PM.',
];

const RATINGS_PRESET = [5, 4, 5, 3, 4, 5, 4, 5, 4, 3, 4, 5];

function makeEmail(suffix: string) {
  return `test${suffix}@quickpeek.com`;
}

async function seed() {
  console.log('Clearing existing data…');
  await prisma.answerRating.deleteMany({});
  await prisma.answer.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.userRating.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Creating users…');
  const passwordHash = await bcrypt.hash('password123', 10);

  const users: { id: string; email: string; name: string; username: string }[] = [];

  for (let i = 0; i < USER_DEFS.length; i++) {
    const def = USER_DEFS[i];
    const loc = LOCATION_PRESETS[i];
    const email = makeEmail(def.suffix);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: def.name,
        username: def.username,
        deviceType: i % 2 === 0 ? 'ios' : 'android',
        deviceToken: faker.string.uuid(),
        notificationsEnabled: true,
        locationSharingEnabled: true,
        isVerified: true,
        location: {
          create: {
            longitude: loc.lon,
            latitude: loc.lat,
          },
        },
      },
    });

    users.push({ id: user.id, email, name: def.name, username: def.username });
    console.log(`  Created ${email} (${def.name})`);
  }

  // test03 = users[3]
  const test03Idx = 3;
  const test03 = users[test03Idx];

  console.log('\nCreating outbox questions for test03…');
  const outboxQuestions: { id: string; status: string; answerId?: string; assignedIdx?: number | null }[] = [];

  for (const qdef of OUTBOX_QUESTIONS) {
    const assignedIdx = qdef.assignedIdx;
    const questionData: any = {
      userId: test03.id,
      text: qdef.text,
      longitude: centralLongitude + (Math.random() - 0.5) * 0.005,
      latitude: centralLatitude + (Math.random() - 0.5) * 0.005,
      address: ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)],
      status: qdef.status,
    };

    if (assignedIdx !== null && assignedIdx !== undefined && qdef.status !== 'OPEN') {
      questionData.assignedResponderId = users[assignedIdx].id;
      questionData.assignedAt = new Date(Date.now() - 15 * 60 * 1000);
      questionData.timeToRespondMs = 600000;
    }

    const question = await prisma.question.create({ data: questionData });
    outboxQuestions.push({ id: question.id, status: qdef.status, assignedIdx });

    if (qdef.answerIdx !== undefined && qdef.status === 'ANSWERED') {
      const answerUserIdx = qdef.answerIdx;
      const answer = await prisma.answer.create({
        data: {
          questionId: question.id,
          userId: users[answerUserIdx].id,
          text: ANSWER_TEXTS[qdef.answerIdx % ANSWER_TEXTS.length],
        },
      });
      outboxQuestions[outboxQuestions.length - 1].answerId = answer.id;
    }
  }

  console.log('\nCreating inbox questions for test03 (assigned by other users)…');
  for (const qdef of INBOX_QUESTIONS) {
    const fromUser = users[qdef.fromIdx];
    await prisma.question.create({
      data: {
        userId: fromUser.id,
        text: qdef.text,
        longitude: centralLongitude + (Math.random() - 0.5) * 0.005,
        latitude: centralLatitude + (Math.random() - 0.5) * 0.005,
        address: ADDRESSES[Math.floor(Math.random() * ADDRESSES.length)],
        status: 'ASSIGNED',
        assignedResponderId: test03.id,
        assignedAt: new Date(Date.now() - 5 * 60 * 1000),
        timeToRespondMs: 600000,
      },
    });
    console.log(`  "${qdef.text}" from ${fromUser.name}`);
  }

  console.log('\nCreating ratings for answered questions…');
  const allAnswers = await prisma.answer.findMany({ include: { question: true } });

  for (let i = 0; i < allAnswers.length; i++) {
    const answer = allAnswers[i];
    const rating = RATINGS_PRESET[i % RATINGS_PRESET.length];
    const questionOwner = users.find(u => u.id === answer.question.userId);

    await prisma.answerRating.create({
      data: {
        answerId: answer.id,
        rating,
        feedback: 'Great answer, very helpful!',
      },
    });
    console.log(`  Rated answer by ${questionOwner?.name || 'unknown'} → ${rating}/5`);
  }

  console.log('\nComputing user rating aggregates…');
  const answerRatings = await prisma.answerRating.findMany({
    include: { answer: { select: { userId: true } } },
  });

  const userRatingMap: Record<string, { totalRating: number; answersCount: number }> = {};

  for (const ar of answerRatings) {
    const uid = ar.answer.userId;
    if (!userRatingMap[uid]) {
      userRatingMap[uid] = { totalRating: 0, answersCount: 0 };
    }
    userRatingMap[uid].totalRating += ar.rating;
    userRatingMap[uid].answersCount += 1;
  }

  for (const [userId, agg] of Object.entries(userRatingMap)) {
    await prisma.userRating.create({
      data: {
        userId,
        totalRating: agg.totalRating,
        answersCount: agg.answersCount,
      },
    });
    const u = users.find(u => u.id === userId);
    console.log(`  ${u?.name || userId}: ${agg.totalRating} total / ${agg.answersCount} answers = ${(agg.totalRating / agg.answersCount).toFixed(1)} avg`);
  }

  console.log('\n✅ Seed complete!');
  console.log(`   Login: ${test03.email} / password: password123`);
  console.log(`   ${test03.name} (${test03.username}) has:`);
  console.log(`     - ${outboxQuestions.length} outbox questions`);
  console.log(`     - ${INBOX_QUESTIONS.length} inbox questions`);
  console.log(`   Total users: ${users.length}`);
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
