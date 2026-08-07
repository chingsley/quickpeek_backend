/**
 * TEMPORARY seed for testing the question location-scope feature.
 * Safe to delete once location testing is finished.
 *
 * Run: npx ts-node src/core/database/seeders/seed_temp.ts
 *
 * Design: every test question is pinned to the SAME spot, and each responder
 * sits at a different distance from that spot. One distance per responder
 * therefore decides the outcome for every question, which makes the whole
 * feature testable as a small grid.
 */
import { LocationScope, PrismaClient, QuestionStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { calculateHaversineDistance } from '../../../common/utils/geo.utils';
import { invalidateNearbyQuestionsCache } from '../../../common/utils/cache';
import redisClient from '../../../core/config/redis';

const prisma = new PrismaClient();

const PASSWORD = 'password123';

/** Where every test question is pinned. */
const ANCHOR = {
  latitude: 44.6425,
  longitude: -63.575,
  address: 'Spring Garden Rd, Halifax, NS',
};

/**
 * Radii written to market_configs so the test outcomes are deterministic
 * even if someone tuned these values earlier.
 */
const RADII = {
  nearMeRadiusKm: 5,
  radiusAtExactAddressKm: 0.3,
  radiusWalkingKm: 1,
  radiusNeighbourhoodKm: 5,
  radiusCityKm: 25,
};

const CATEGORY_DEFS = [
  { name: 'Location', slug: 'location' },
  { name: 'Services', slug: 'services' },
  { name: 'Shopping', slug: 'shopping' },
  { name: 'Tech', slug: 'tech' },
  { name: 'Other', slug: 'other' },
];

type SeedUser = {
  email: string;
  name: string;
  username: string;
  latitude: number;
  longitude: number;
  /** Roughly how far this account sits from ANCHOR. */
  placed: string;
};

const QUESTIONER: SeedUser = {
  email: 'test20@quickpeek.com',
  name: 'Quinn Asker',
  username: 'quinn_asker',
  latitude: ANCHOR.latitude,
  longitude: ANCHOR.longitude,
  placed: 'at the pin (posts all the questions)',
};

/**
 * Responders, ordered nearest to farthest. Latitudes are offset due north of
 * the anchor so the distances come out clean; Vera uses real Toronto coords
 * to cover the "different city entirely" case.
 */
const RESPONDERS: SeedUser[] = [
  {
    email: 'test21@quickpeek.com',
    name: 'Rita AtSpot',
    username: 'rita_atspot',
    latitude: 44.643849,
    longitude: -63.575,
    placed: '~150 m from the pin',
  },
  {
    email: 'test22@quickpeek.com',
    name: 'Sam ShortWalk',
    username: 'sam_shortwalk',
    latitude: 44.647896,
    longitude: -63.575,
    placed: '~600 m from the pin',
  },
  {
    email: 'test23@quickpeek.com',
    name: 'Tina Local',
    username: 'tina_local',
    latitude: 44.66948,
    longitude: -63.575,
    placed: '~3 km from the pin',
  },
  {
    email: 'test24@quickpeek.com',
    name: 'Umar Citywide',
    username: 'umar_citywide',
    latitude: 44.777398,
    longitude: -63.575,
    placed: '~15 km from the pin',
  },
  {
    email: 'test25@quickpeek.com',
    name: 'Vera FarAway',
    username: 'vera_faraway',
    latitude: 43.6532,
    longitude: -79.3832,
    placed: 'Toronto — ~1250 km from the pin',
  },
];

type QuestionDef = {
  key: string;
  title: string;
  detail: string;
  acceptanceCriteria: string;
  price: number;
  categorySlug: string;
  locationScope: LocationScope;
  /** false = no coordinates at all (pure "anyone can answer"). */
  pinned: boolean;
};

const QUESTION_DEFS: QuestionDef[] = [
  {
    key: 'Q1',
    title: 'How long is the queue at Scotia Bank?',
    detail:
      'I need to know how many people are waiting in line at the Scotia Bank on Spring Garden Rd right now.',
    acceptanceCriteria: 'A current head-count of the queue, or a photo of the line.',
    price: 5,
    categorySlug: 'location',
    locationScope: 'AT_EXACT_ADDRESS',
    pinned: true,
  },
  {
    key: 'Q2',
    title: 'Is there street parking on Spring Garden right now?',
    detail:
      'Driving in shortly and want to know whether there are free street parking spots on Spring Garden Rd.',
    acceptanceCriteria: 'Say whether spots are free, and roughly where they are.',
    price: 4,
    categorySlug: 'location',
    locationScope: 'WALKING',
    pinned: true,
  },
  {
    key: 'Q3',
    title: 'Any good barber shop around here?',
    detail:
      'Looking for a walk-in barber shop somewhere in the area around Spring Garden Rd, ideally open today.',
    acceptanceCriteria: 'A barber shop name plus why you recommend it.',
    price: 6,
    categorySlug: 'services',
    locationScope: 'NEIGHBOURHOOD',
    pinned: true,
  },
  {
    key: 'Q4',
    title: 'Where can I get Ghanaian food in Halifax?',
    detail:
      'Looking for a restaurant or takeaway anywhere in Halifax that serves Ghanaian or West African food.',
    acceptanceCriteria: 'A restaurant name and roughly where it is.',
    price: 8,
    categorySlug: 'shopping',
    locationScope: 'CITY',
    pinned: true,
  },
  {
    key: 'Q5',
    title: 'Is Spring Garden a good area to live in?',
    detail:
      'Thinking about moving to the Spring Garden Rd area. The pin is only for context — anyone who knows it can answer, including people who used to live here.',
    acceptanceCriteria: 'An honest take on noise, safety and cost.',
    price: 7,
    categorySlug: 'other',
    locationScope: 'ANYWHERE',
    pinned: true,
  },
  {
    key: 'Q6',
    title: 'Best budget laptop for a student?',
    detail:
      'No location involved at all. Looking for a laptop under $700 that can handle classwork and light coding.',
    acceptanceCriteria: 'A model name and why it fits the budget.',
    price: 3,
    categorySlug: 'tech',
    locationScope: 'ANYWHERE',
    pinned: false,
  },
];

const scopeRadiusKm = (scope: LocationScope): number | null => {
  switch (scope) {
    case 'AT_EXACT_ADDRESS':
      return RADII.radiusAtExactAddressKm;
    case 'WALKING':
      return RADII.radiusWalkingKm;
    case 'NEIGHBOURHOOD':
      return RADII.radiusNeighbourhoodKm;
    case 'CITY':
      return RADII.radiusCityKm;
    default:
      return null;
  }
};

const distanceFromAnchorKm = (user: SeedUser): number =>
  calculateHaversineDistance(user.latitude, user.longitude, ANCHOR.latitude, ANCHOR.longitude);

async function seedTemp() {
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

  console.log('Writing market config radii…');
  for (const [key, value] of Object.entries(RADII)) {
    await prisma.marketConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  console.log('Creating categories…');
  const categories: Record<string, { id: string }> = {};
  for (const def of CATEGORY_DEFS) {
    categories[def.slug] = await prisma.category.create({ data: def });
  }

  console.log('Creating users…');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const allUsers = [QUESTIONER, ...RESPONDERS];
  const created: Record<string, { id: string }> = {};

  for (let i = 0; i < allUsers.length; i++) {
    const def = allUsers[i];
    const user = await prisma.user.create({
      data: {
        email: def.email,
        password: passwordHash,
        name: def.name,
        username: def.username,
        deviceType: i % 2 === 0 ? 'ios' : 'android',
        deviceToken: `seed-temp-token-${def.username}`,
        notificationsEnabled: true,
        locationSharingEnabled: true,
        isVerified: true,
        isAdmin: false,
        profileImageUrl: `https://i.pravatar.cc/150?u=${def.username}`,
        location: {
          create: { latitude: def.latitude, longitude: def.longitude },
        },
      },
    });
    created[def.email] = user;
  }

  console.log('Creating questions…');
  // No answer requests are seeded on purpose: every question must stay open to
  // every responder so a single account can test all six in one pass without
  // hitting ALREADY_REQUESTED.
  for (const def of QUESTION_DEFS) {
    await prisma.question.create({
      data: {
        title: def.title,
        detail: def.detail,
        acceptanceCriteria: def.acceptanceCriteria,
        price: def.price,
        categoryId: categories[def.categorySlug].id,
        latitude: def.pinned ? ANCHOR.latitude : null,
        longitude: def.pinned ? ANCHOR.longitude : null,
        address: def.pinned ? ANCHOR.address : null,
        locationScope: def.locationScope,
        userId: created[QUESTIONER.email].id,
        status: QuestionStatus.OPEN,
      },
    });
  }

  await invalidateNearbyQuestionsCache();

  printSummary();
}

function printSummary() {
  const line = (char = '-') => console.log(char.repeat(78));

  console.log('\n');
  line('=');
  console.log('LOCATION SCOPE TEST DATA');
  line('=');

  console.log(`\nAll questions are pinned at: ${ANCHOR.address}`);
  console.log(`Pin coordinates: ${ANCHOR.latitude}, ${ANCHOR.longitude}`);
  console.log(`\nPassword for every account: ${PASSWORD}`);

  console.log('\nACCOUNTS — set your simulator location to these coordinates:');
  line();
  console.log(
    'EMAIL'.padEnd(24) + 'LATITUDE'.padEnd(13) + 'LONGITUDE'.padEnd(13) + 'DISTANCE'.padEnd(12) + 'ROLE',
  );
  line();
  console.log(
    QUESTIONER.email.padEnd(24) +
      String(QUESTIONER.latitude).padEnd(13) +
      String(QUESTIONER.longitude).padEnd(13) +
      '0 km'.padEnd(12) +
      'questioner',
  );
  for (const r of RESPONDERS) {
    const km = distanceFromAnchorKm(r);
    console.log(
      r.email.padEnd(24) +
        String(r.latitude).padEnd(13) +
        String(r.longitude).padEnd(13) +
        `${km.toFixed(2)} km`.padEnd(12) +
        'responder',
    );
  }

  console.log('\nQUESTIONS:');
  line();
  for (const q of QUESTION_DEFS) {
    const radius = scopeRadiusKm(q.locationScope);
    const limit = radius == null ? 'no distance limit' : `within ${radius} km`;
    const pin = q.pinned ? '' : ' (no location on this question)';
    console.log(`${q.key}  ${q.locationScope.padEnd(14)} ${limit.padEnd(20)} ${q.title}${pin}`);
  }

  console.log('\nEXPECTED RESULT — can this account send an answer request?');
  line();
  const header = 'QUESTION'.padEnd(24);
  console.log(header + RESPONDERS.map((r) => r.username.slice(0, 9).padEnd(11)).join(''));
  line();
  for (const q of QUESTION_DEFS) {
    const radius = scopeRadiusKm(q.locationScope);
    const cells = RESPONDERS.map((r) => {
      if (radius == null || !q.pinned) return 'YES'.padEnd(11);
      const km = distanceFromAnchorKm(r);
      return (km <= radius ? 'YES' : 'no').padEnd(11);
    });
    console.log(`${q.key} ${q.locationScope.padEnd(21)}`.padEnd(24) + cells.join(''));
  }

  console.log('\nNEAR-ME FILTER (browse radius = ' + RADII.nearMeRadiusKm + ' km):');
  line();
  for (const r of RESPONDERS) {
    const km = distanceFromAnchorKm(r);
    const shows = km <= RADII.nearMeRadiusKm;
    console.log(
      `${r.username.padEnd(16)} ${km.toFixed(2).padStart(8)} km  ->  ` +
        (shows ? 'pinned questions SHOW under Near me' : 'Near me list is EMPTY'),
    );
  }

  console.log('\nTWO CASES THAT PROVE near-me AND eligible ARE SEPARATE:');
  line();
  console.log('  umar_citywide on Q4 (CITY)     -> can request YES, but Near me does NOT show it');
  console.log('  tina_local    on Q1 (AT_EXACT_ADDRESS) -> Near me SHOWS it, but request is BLOCKED');
  line('=');
  console.log('');
}

seedTemp()
  .then(async () => {
    await prisma.$disconnect();
    await redisClient.quit();
  })
  .catch(async (e) => {
    console.error('Temp seed failed:', e);
    await prisma.$disconnect();
    await redisClient.quit();
    process.exit(1);
  });
