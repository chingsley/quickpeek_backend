import {
  AnswerRequestStatus,
  MessageType,
  PrismaClient,
  QuestionStatus,
  RatingRole,
  ReviewerRole,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import { createAcceptanceBriefingMessages } from '../../../common/utils/messages.utils';

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
];

const REJECTION_REASONS = [
  'Question already answered',
  'Already got a response',
  'Prefer someone closer to the specified location',
  'I no longer need the information',
];

function makeEmail(suffix: string) {
  return `test${suffix}@quickpeek.com`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function createSystemMessage(opts: {
  questionId: string;
  answerRequestId: string;
  senderId: string;
  text: string;
  visibleToUserId?: string | null;
}) {
  return prisma.message.create({
    data: {
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      senderId: opts.senderId,
      text: opts.text,
      type: MessageType.SYSTEM,
      visibleToUserId: opts.visibleToUserId ?? null,
    },
  });
}

async function createIncomingPendingRequest(opts: {
  questionId: string;
  questionerId: string;
  responder: { id: string; username: string };
}) {
  const request = await prisma.answerRequest.create({
    data: {
      questionId: opts.questionId,
      responderId: opts.responder.id,
      questionerId: opts.questionerId,
      status: AnswerRequestStatus.PENDING,
    },
  });

  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: request.id,
    senderId: opts.responder.id,
    text: `Your request to answer the question has been sent to the question creator. We'll let you know when they respond.`,
    visibleToUserId: opts.responder.id,
  });
  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: request.id,
    senderId: opts.responder.id,
    text: `You have a request by @${opts.responder.username} to respond to your question. View their profile before accepting the request.`,
    visibleToUserId: opts.questionerId,
  });

  return request;
}

async function seed() {
  console.log('Clearing existing data…');
  await prisma.message.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.questionResponderBlock.deleteMany({});
  await prisma.answerRequest.deleteMany({});
  await prisma.userRating.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Creating users…');
  const passwordHash = await bcrypt.hash('password123', 10);
  const users: { id: string; email: string; name: string; username: string }[] = [];

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
  const categories: Record<string, { id: string; name: string; slug: string }> = {};
  for (const def of CATEGORY_DEFS) {
    const category = await prisma.category.create({ data: def });
    categories[def.slug] = category;
  }

  console.log('\nCreating questions for test03…');
  const outboxDefs = [
    {
      title: 'Driving lesson near Morris St',
      detail: "I'm looking for a driving lesson. My location is Morris street, Halifax.",
      categorySlug: 'driving',
      price: 10,
      acceptanceCriteria:
        'A valid contact that is available and will either agree to give me the lessons or connect me to the person who will.',
      status: QuestionStatus.OPEN,
      withLocation: true,
    },
    {
      title: 'Is the Scotia branch busy?',
      detail: 'I want to know if there is a long queue in the Scotia banking hall on Spring Garden St.',
      categorySlug: 'location',
      price: 5,
      acceptanceCriteria: 'Photo proof or a current head-count of the queue.',
      status: QuestionStatus.OPEN,
      withLocation: true,
    },
    {
      title: 'How to fix a leaky faucet?',
      detail: 'My kitchen faucet drips constantly. Looking for a step-by-step for a beginner.',
      categorySlug: 'how-to',
      price: 8,
      acceptanceCriteria: 'Detailed explanation suitable for someone with no plumbing experience.',
      status: QuestionStatus.OPEN,
      withLocation: false,
    },
    {
      title: 'Best pancake recipe?',
      detail: 'Need a fluffy pancake recipe that works at high altitude.',
      categorySlug: 'cooking',
      price: 4,
      acceptanceCriteria: 'Recipe that has been tested at altitude, with photos if possible.',
      status: QuestionStatus.ANSWERED,
      withLocation: false,
    },
    {
      title: 'Looking for a bike mechanic',
      detail: 'Need someone to true my wheels and adjust the derailleur this week.',
      categorySlug: 'services',
      price: 25,
      acceptanceCriteria: 'A reachable contact or booking confirmation.',
      status: QuestionStatus.CANCELLED,
      withLocation: true,
    },
  ];

  const outboxQuestions: { id: string; title: string }[] = [];

  for (const qdef of outboxDefs) {
    const category = categories[qdef.categorySlug];
    const address = qdef.withLocation ? pick(ADDRESSES) : null;
    const longitude = qdef.withLocation
      ? centralLongitude + (Math.random() - 0.5) * 0.005
      : null;
    const latitude = qdef.withLocation
      ? centralLatitude + (Math.random() - 0.5) * 0.005
      : null;

    const question = await prisma.question.create({
      data: {
        title: qdef.title,
        detail: qdef.detail,
        categoryId: category.id,
        price: qdef.price,
        acceptanceCriteria: qdef.acceptanceCriteria,
        longitude,
        latitude,
        address,
        answerRadiusKm: qdef.withLocation ? 3 : null,
        userId: test03.id,
        status: qdef.status,
        answeredAt: qdef.status === QuestionStatus.ANSWERED ? new Date(Date.now() - 60 * 60 * 1000) : null,
      },
    });
    outboxQuestions.push({ id: question.id, title: question.title });
    console.log(`  Created question: ${question.title}`);
  }

  // Requests on test03's first OPEN question (driving lesson)
  const drivingQuestion = outboxQuestions[0];
  const requesterDefs = [
    { user: users[0], status: AnswerRequestStatus.PENDING },
    { user: users[1], status: AnswerRequestStatus.ACCEPTED },
    { user: users[2], status: AnswerRequestStatus.REJECTED },
  ];

  for (const rdef of requesterDefs) {
    const request = await prisma.answerRequest.create({
      data: {
        questionId: drivingQuestion.id,
        responderId: rdef.user.id,
        questionerId: test03.id,
        status: rdef.status,
        rejectionReason:
          rdef.status === AnswerRequestStatus.REJECTED ? pick(REJECTION_REASONS) : null,
        respondedAt:
          rdef.status === AnswerRequestStatus.PENDING ? null : new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // Initial role-specific system messages
    await createSystemMessage({
      questionId: drivingQuestion.id,
      answerRequestId: request.id,
      senderId: rdef.user.id,
      text: `Your request to answer the question has been sent to the question creator. We'll let you know when they respond.`,
      visibleToUserId: rdef.user.id,
    });
    await createSystemMessage({
      questionId: drivingQuestion.id,
      answerRequestId: request.id,
      senderId: rdef.user.id,
      text: `You have a request by @${rdef.user.username} to respond to your question. View their profile before accepting the request.`,
      visibleToUserId: test03.id,
    });

    if (rdef.status === AnswerRequestStatus.ACCEPTED) {
      await createSystemMessage({
        questionId: drivingQuestion.id,
        answerRequestId: request.id,
        senderId: test03.id,
        text: 'Request accepted.',
      });

      const drivingQ = await prisma.question.findUnique({ where: { id: drivingQuestion.id } });
      if (drivingQ) {
        await createAcceptanceBriefingMessages({
          questionId: drivingQuestion.id,
          answerRequestId: request.id,
          questionerId: test03.id,
          responderId: rdef.user.id,
          question: {
            address: drivingQ.address,
            latitude: drivingQ.latitude,
            longitude: drivingQ.longitude,
            detail: drivingQ.detail,
            acceptanceCriteria: drivingQ.acceptanceCriteria,
          },
        });
      }

      // Some user conversation
      await prisma.message.create({
        data: {
          questionId: drivingQuestion.id,
          answerRequestId: request.id,
          senderId: rdef.user.id,
          text: 'Hi! I can help with the driving lesson. When are you free?',
        },
      });
      await prisma.message.create({
        data: {
          questionId: drivingQuestion.id,
          answerRequestId: request.id,
          senderId: test03.id,
          text: 'Tomorrow morning works for me.',
        },
      });
    }

    if (rdef.status === AnswerRequestStatus.REJECTED) {
      await createSystemMessage({
        questionId: drivingQuestion.id,
        answerRequestId: request.id,
        senderId: test03.id,
        text: `Your request was declined: ${request.rejectionReason}`,
        visibleToUserId: rdef.user.id,
      });
      await prisma.questionResponderBlock.create({
        data: {
          questionId: drivingQuestion.id,
          responderId: rdef.user.id,
          answerRequestId: request.id,
          rejectionReason: request.rejectionReason,
        },
      });
    }
  }

  console.log('\nCreating incoming requests awaiting test03 approval…');
  const scotiaQuestion = outboxQuestions.find((q) => q.title === 'Is the Scotia branch busy?')!;
  const faucetQuestion = outboxQuestions.find((q) => q.title === 'How to fix a leaky faucet?')!;

  const awaitingApprovalSeeds: Array<{
    questionId: string;
    responder: (typeof users)[number];
    label: string;
  }> = [
    { questionId: drivingQuestion.id, responder: users[0], label: 'Driving lesson (Alice Morgan)' },
    { questionId: scotiaQuestion.id, responder: users[4], label: 'Scotia branch (Elena Rossi)' },
    { questionId: faucetQuestion.id, responder: users[5], label: 'Leaky faucet (Felix Nguyen)' },
  ];

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
    const question = await prisma.question.create({
      data: {
        title: def.title,
        detail: def.detail,
        categoryId: category.id,
        price: def.price,
        acceptanceCriteria: def.acceptanceCriteria,
        longitude: centralLongitude + 0.001,
        latitude: centralLatitude + 0.001,
        address: pick(ADDRESSES),
        answerRadiusKm: 5,
        userId: test03.id,
        status: QuestionStatus.OPEN,
      },
    });
    outboxQuestions.push({ id: question.id, title: question.title });
    awaitingApprovalSeeds.push({
      questionId: question.id,
      responder: def.responder,
      label: `${def.title} (${def.responder.name})`,
    });
  }

  let awaitingApprovalCount = 0;
  for (const seed of awaitingApprovalSeeds) {
    const existing = await prisma.answerRequest.findFirst({
      where: {
        questionId: seed.questionId,
        responderId: seed.responder.id,
        questionerId: test03.id,
      },
    });
    if (!existing) {
      await createIncomingPendingRequest({
        questionId: seed.questionId,
        questionerId: test03.id,
        responder: seed.responder,
      });
    }
    awaitingApprovalCount++;
    console.log(`  Pending incoming: ${seed.label}`);
  }

  if (awaitingApprovalCount < 5) {
    throw new Error(`Expected at least 5 awaiting-your-approval seeds, got ${awaitingApprovalCount}`);
  }

  console.log('\nCreating questions from other users (home feed sections for test03)…');

  const MIN_PER_SECTION = 5;
  const otherUsers = users.filter((u) => u.id !== test03.id);
  let questionerRotator = 0;
  const nextQuestioner = () => otherUsers[questionerRotator++ % otherUsers.length];

  type FeedSectionKey =
    | 'near_you'
    | 'new'
    | 'pending'
    | 'approved'
    | 'answered_by_you'
    | 'rejected';

  const sectionCounts: Record<FeedSectionKey, number> = {
    near_you: 0,
    new: 0,
    pending: 0,
    approved: 0,
    answered_by_you: 0,
    rejected: 0,
  };

  type RequestKind = 'pending' | 'approved' | 'answered' | 'rejected';

  type FeedQuestionDef = {
    title: string;
    categorySlug: string;
    price: number;
    detail: string;
    acceptanceCriteria: string;
    request?: RequestKind;
    rejectionReason?: string;
    responderReply?: string;
  };

  const nearYouDefs: FeedQuestionDef[] = [
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
  ];

  const newDefs: FeedQuestionDef[] = [
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

  const pendingDefs: FeedQuestionDef[] = [
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

  const approvedDefs: FeedQuestionDef[] = [
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

  const answeredDefs: FeedQuestionDef[] = [
    {
      title: 'Farmers market still on?',
      categorySlug: 'location',
      price: 5,
      detail: 'Is the Halifax Farmers Market running today and until what time?',
      acceptanceCriteria: 'Photo of the market entrance or vendor area.',
      request: 'answered',
      responderReply:
        'Yes, the market is running until 1pm today. Plenty of parking on Agricola.',
    },
    {
      title: 'Ice cream truck location?',
      categorySlug: 'location',
      price: 2,
      detail: 'Where is the ice cream truck parked near the Common today?',
      acceptanceCriteria: 'Photo of the truck or a pin on the block where it is parked.',
      request: 'answered',
      responderReply: 'It is parked on the south side of the Common near the playground.',
    },
    {
      title: 'Bus delay on route 1?',
      categorySlug: 'location',
      price: 3,
      detail: 'Is route 1 running on time through Quinpool this hour?',
      acceptanceCriteria: 'Screenshot from the transit app or photo at the stop.',
      request: 'answered',
      responderReply: 'Route 1 is about 8 minutes behind schedule at Quinpool.',
    },
    {
      title: 'Pizza place delivery time?',
      categorySlug: 'cooking',
      price: 4,
      detail: 'How long is delivery from the pizza place on Quinpool right now?',
      acceptanceCriteria: 'Quoted delivery time from staff or the online order page.',
      request: 'answered',
      responderReply: 'They quoted 35–40 minutes for delivery to this area.',
    },
    {
      title: 'Park playground open?',
      categorySlug: 'location',
      price: 2,
      detail: 'Is the playground at the neighbourhood park open and dry after the rain?',
      acceptanceCriteria: 'Photo of the playground surface and equipment.',
      request: 'answered',
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

  const rejectedDefs: FeedQuestionDef[] = [
    {
      title: 'Gym membership deals nearby?',
      categorySlug: 'services',
      price: 6,
      detail: 'Any current membership promotions at gyms within walking distance?',
      acceptanceCriteria: 'Photo of the promo poster or quoted monthly rate.',
      request: 'rejected',
      rejectionReason: 'Prefer someone closer to the specified location',
    },
    {
      title: 'Tutoring availability this week?',
      categorySlug: 'services',
      price: 8,
      detail: 'Looking for a math tutor available for two sessions this week.',
      acceptanceCriteria: 'Tutor contact and confirmed availability.',
      request: 'rejected',
      rejectionReason: 'Already got a response',
    },
    {
      title: 'House cleaning quote?',
      categorySlug: 'services',
      price: 15,
      detail: 'Need a quote for a one-time deep clean of a 2-bedroom apartment.',
      acceptanceCriteria: 'Written quote or message from a cleaner with availability.',
      request: 'rejected',
      rejectionReason: 'Question already answered',
    },
    {
      title: 'Lawn mowing service?',
      categorySlug: 'services',
      price: 10,
      detail: 'Anyone available to mow a small lawn this weekend?',
      acceptanceCriteria: 'Confirmed availability and price for the job.',
      request: 'rejected',
      rejectionReason: 'I no longer need the information',
    },
    {
      title: 'Car wash wait time?',
      categorySlug: 'services',
      price: 3,
      detail: 'How long is the wait at the drive-through car wash on Quinpool?',
      acceptanceCriteria: 'Estimated wait time or photo of the queue.',
      request: 'rejected',
      rejectionReason: 'Prefer someone closer to the specified location',
    },
    {
      title: 'Moving help needed?',
      categorySlug: 'services',
      price: 20,
      detail: 'Need one person to help move boxes for an hour this Saturday.',
      acceptanceCriteria: 'Confirmed helper with a reachable contact.',
      request: 'rejected',
      rejectionReason: 'Already got a response',
    },
  ];

  async function createFeedQuestion(
    def: FeedQuestionDef,
    section: FeedSectionKey,
    nearTest03: boolean,
  ) {
    const questioner = nextQuestioner();
    const category = categories[def.categorySlug];
    const useLocation = section !== 'new';
    const address = useLocation ? ADDRESSES[sectionCounts[section] % ADDRESSES.length] : null;
    const longitude = useLocation
      ? nearTest03
        ? centralLongitude + (sectionCounts[section] % 5) * 0.0004
        : centralLongitude + 0.08 + (sectionCounts[section] % 3) * 0.01
      : null;
    const latitude = useLocation
      ? nearTest03
        ? centralLatitude + (sectionCounts[section] % 5) * 0.0003
        : centralLatitude + 0.08 + (sectionCounts[section] % 3) * 0.01
      : null;

    const q = await prisma.question.create({
      data: {
        title: def.title,
        detail: def.detail,
        categoryId: category.id,
        price: def.price,
        acceptanceCriteria: def.acceptanceCriteria,
        longitude,
        latitude,
        address,
        answerRadiusKm: useLocation ? 5 : null,
        userId: questioner.id,
        status: QuestionStatus.OPEN,
      },
    });

    sectionCounts[section]++;

    if (!def.request) return;

    const requestStatus =
      def.request === 'pending'
        ? AnswerRequestStatus.PENDING
        : def.request === 'approved' || def.request === 'answered'
          ? AnswerRequestStatus.ACCEPTED
          : AnswerRequestStatus.REJECTED;

    const rejectionReason =
      def.request === 'rejected' ? def.rejectionReason ?? pick(REJECTION_REASONS) : null;

    const request = await prisma.answerRequest.create({
      data: {
        questionId: q.id,
        responderId: test03.id,
        questionerId: questioner.id,
        status: requestStatus,
        rejectionReason,
        respondedAt:
          requestStatus === AnswerRequestStatus.PENDING
            ? null
            : new Date(Date.now() - 15 * 60 * 1000),
      },
    });

    await createSystemMessage({
      questionId: q.id,
      answerRequestId: request.id,
      senderId: test03.id,
      text: `Your request to answer the question has been sent to the question creator. We'll let you know when they respond.`,
      visibleToUserId: test03.id,
    });
    await createSystemMessage({
      questionId: q.id,
      answerRequestId: request.id,
      senderId: test03.id,
      text: `You have a request by @${test03.username} to respond to your question. View their profile before accepting the request.`,
      visibleToUserId: questioner.id,
    });

    if (requestStatus === AnswerRequestStatus.ACCEPTED) {
      await createSystemMessage({
        questionId: q.id,
        answerRequestId: request.id,
        senderId: questioner.id,
        text: 'Request accepted.',
      });

      await createAcceptanceBriefingMessages({
        questionId: q.id,
        answerRequestId: request.id,
        questionerId: questioner.id,
        responderId: test03.id,
        question: {
          address: q.address,
          latitude: q.latitude,
          longitude: q.longitude,
          detail: q.detail,
          acceptanceCriteria: q.acceptanceCriteria,
        },
      });
    }

    if (def.request === 'answered') {
      await prisma.message.create({
        data: {
          questionId: q.id,
          answerRequestId: request.id,
          senderId: test03.id,
          text:
            def.responderReply ??
            'Here is the information you asked for — let me know if you need anything else.',
          type: MessageType.USER,
        },
      });
      await prisma.message.create({
        data: {
          questionId: q.id,
          answerRequestId: request.id,
          senderId: questioner.id,
          text: 'Perfect, thank you!',
          type: MessageType.USER,
        },
      });
    }

    if (def.request === 'rejected') {
      await createSystemMessage({
        questionId: q.id,
        answerRequestId: request.id,
        senderId: questioner.id,
        text: `Your request was declined: ${rejectionReason}`,
        visibleToUserId: test03.id,
      });
      await prisma.questionResponderBlock.create({
        data: {
          questionId: q.id,
          responderId: test03.id,
          answerRequestId: request.id,
          rejectionReason,
        },
      });
    }
  }

  for (const def of nearYouDefs) {
    await createFeedQuestion(def, 'near_you', true);
  }
  for (const def of newDefs) {
    await createFeedQuestion(def, 'new', false);
  }
  for (const def of pendingDefs) {
    await createFeedQuestion(def, 'pending', true);
  }
  for (const def of approvedDefs) {
    await createFeedQuestion(def, 'approved', true);
  }
  for (const def of answeredDefs) {
    await createFeedQuestion(def, 'answered_by_you', true);
  }
  for (const def of rejectedDefs) {
    await createFeedQuestion(def, 'rejected', true);
  }

  for (const [key, count] of Object.entries(sectionCounts) as [FeedSectionKey, number][]) {
    if (count < MIN_PER_SECTION) {
      throw new Error(`Seed feed section "${key}" has ${count} items; expected at least ${MIN_PER_SECTION}`);
    }
    console.log(`  ${key}: ${count} questions`);
  }

  // Seeded review for the ANSWERED pancake question (single accepted request, both sides reviewed)
  const pancakeQuestion = outboxQuestions.find((q) => q.title === 'Best pancake recipe?');
  if (pancakeQuestion) {
    const acceptedResponder = users[7];
    const request = await prisma.answerRequest.create({
      data: {
        questionId: pancakeQuestion.id,
        responderId: acceptedResponder.id,
        questionerId: test03.id,
        status: AnswerRequestStatus.ACCEPTED,
        respondedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
    });
    await createSystemMessage({
      questionId: pancakeQuestion.id,
      answerRequestId: request.id,
      senderId: test03.id,
      text: 'Request accepted.',
    });
    await prisma.message.create({
      data: {
        questionId: pancakeQuestion.id,
        answerRequestId: request.id,
        senderId: acceptedResponder.id,
        text: 'Here is my tested recipe: 2 cups flour, 2 eggs, 1.5 cups buttermilk...',
      },
    });

    const reviewTime = new Date();
    await prisma.review.createMany({
      data: [
        {
          answerRequestId: request.id,
          raterId: test03.id,
          rateeId: acceptedResponder.id,
          raterRole: ReviewerRole.QUESTIONER,
          stars: 5,
          comment: pick(REVIEW_COMMENTS),
          isRevealed: true,
          revealedAt: reviewTime,
        },
        {
          answerRequestId: request.id,
          raterId: acceptedResponder.id,
          rateeId: test03.id,
          raterRole: ReviewerRole.RESPONDER,
          stars: 4,
          comment: 'Clear question, easy to help.',
          isRevealed: true,
          revealedAt: reviewTime,
        },
      ],
    });
  }

  console.log('\nComputing user rating aggregates…');
  const revealedReviews = await prisma.review.findMany({ where: { isRevealed: true } });
  const aggregateMap: Record<string, Record<RatingRole, { totalStars: number; reviewsCount: number }>> = {};

  for (const review of revealedReviews) {
    const role =
      review.raterRole === ReviewerRole.QUESTIONER ? RatingRole.AS_RESPONDER : RatingRole.AS_QUESTIONER;

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

  console.log('\nRefreshing location timestamps for nearby queries…');
  await prisma.$executeRaw`UPDATE locations SET "updatedAt" = NOW()`;

  console.log('\n✅ Seed complete!');
  console.log(`   Login: ${test03.email} / password: password123`);
  console.log('   Home feed (test03): Awaiting your approval, Near you, New, Waiting for reply, Approved, Answered by you, Rejected');
  console.log('   Briefing test: open Approved chats, or accept a request in Awaiting your approval');
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
