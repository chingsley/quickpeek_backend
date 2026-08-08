/**
 * Staging seed — near-real-life data.
 *
 * Two live markets, Halifax (NS, Canada) and Abuja (Nigeria), each with 7
 * users who ask, answer, chat, pay, and review one another. Every request /
 * acceptance / decline / close / review is written through helpers that
 * mirror the real controller flows (`createRequest`, `acceptRequest`,
 * `rejectRequest`, `sendMessage`, `closeQuestion`, review reveal), so the
 * world is mutually consistent from every login.
 *
 * All users share the same password: password123
 *
 * Run: npm run seed
 */
import {
  AnswerRequestStatus,
  LocationScope,
  MessageType,
  PaymentAccountStatus,
  PrismaClient,
  QuestionStatus,
  RatingRole,
  ReviewerRole,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import { createQuestionBriefingMessages } from '../../../common/utils/messages.utils';
import { recomputeUserRatingAggregate } from '../../../common/utils/ratings';
import { invalidateNearbyQuestionsCache } from '../../../common/utils/cache';
import redisClient from '../../../core/config/redis';

const prisma = new PrismaClient();

const PASSWORD = 'password123';

// ---------------------------------------------------------------------------
// Time helpers — every flow is placed at a realistic point in the past.
// ---------------------------------------------------------------------------
const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);
const minutesAfter = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);

// ---------------------------------------------------------------------------
// Users. Each lives in one city; their home location sits inside that city's
// near-me radius so their Home feed is immediately populated.
// ---------------------------------------------------------------------------
type CityKey = 'halifax' | 'abuja';

type UserDef = {
  name: string;
  username: string;
  email: string;
  city: CityKey;
  lat: number;
  lon: number;
  isAdmin?: boolean;
};

const USER_DEFS: UserDef[] = [
  // Halifax, NS
  { name: 'Alice Morgan', username: 'alice_m', email: 'alice@quickpeek.com', city: 'halifax', lat: 44.6428, lon: -63.5749 },
  { name: 'Bob Chen', username: 'bob_chen', email: 'bob@quickpeek.com', city: 'halifax', lat: 44.6460, lon: -63.5832 },
  { name: 'Carla Diaz', username: 'carla_d', email: 'carla@quickpeek.com', city: 'halifax', lat: 44.6390, lon: -63.5801 },
  { name: 'David Park', username: 'david_p', email: 'david@quickpeek.com', city: 'halifax', lat: 44.6502, lon: -63.5718, isAdmin: true },
  { name: 'Elena Rossi', username: 'elena_r', email: 'elena@quickpeek.com', city: 'halifax', lat: 44.6289, lon: -63.5709 },
  { name: 'Felix Nguyen', username: 'felix_n', email: 'felix@quickpeek.com', city: 'halifax', lat: 44.6451, lon: -63.5893 },
  { name: 'Grace Okafor', username: 'grace_o', email: 'grace@quickpeek.com', city: 'halifax', lat: 44.6377, lon: -63.5877 },
  // Abuja, Nigeria
  { name: 'kamsi Nwosu', username: 'kamsi_n', email: 'kamsi@quickpeek.com', city: 'abuja', lat: 9.0782, lon: 7.4708 },
  { name: 'Chidi Okeke', username: 'chidi_o', email: 'chidi@quickpeek.com', city: 'abuja', lat: 9.0335, lon: 7.4845 },
  { name: 'Fatima Bello', username: 'fatima_b', email: 'fatima@quickpeek.com', city: 'abuja', lat: 9.0895, lon: 7.4921 },
  { name: 'Emeka Eze', username: 'emeka_e', email: 'emeka@quickpeek.com', city: 'abuja', lat: 9.0725, lon: 7.4235 },
  { name: 'Zainab Yusuf', username: 'zainab_y', email: 'zainab@quickpeek.com', city: 'abuja', lat: 9.0563, lon: 7.4959 },
  { name: 'Tunde Adeyemi', username: 'tunde_a', email: 'tunde@quickpeek.com', city: 'abuja', lat: 9.1142, lon: 7.4118 },
  { name: 'Ngozi Obi', username: 'ngozi_o', email: 'ngozi@quickpeek.com', city: 'abuja', lat: 9.0339, lon: 7.5248 },
];

// ---------------------------------------------------------------------------
// Places — real landmarks with approximate coordinates.
// ---------------------------------------------------------------------------
type Place = { name: string; lat: number; lon: number; address: string; };

const PLACES: Record<CityKey, Record<string, Place>> = {
  halifax: {
    waterfront: { name: 'Halifax Waterfront', lat: 44.6476, lon: -63.5714, address: 'Halifax Waterfront, Halifax, NS' },
    springGarden: { name: 'Spring Garden Road', lat: 44.6425, lon: -63.5756, address: 'Spring Garden Rd, Halifax, NS' },
    centralLibrary: { name: 'Halifax Central Library', lat: 44.6431, lon: -63.5752, address: '5440 Spring Garden Rd, Halifax, NS' },
    pointPleasant: { name: 'Point Pleasant Park', lat: 44.6234, lon: -63.5689, address: 'Point Pleasant Park Dr, Halifax, NS' },
    common: { name: 'Halifax Common', lat: 44.6462, lon: -63.5837, address: 'Halifax Common, Halifax, NS' },
    quinpool: { name: 'Quinpool Road', lat: 44.6458, lon: -63.5897, address: 'Quinpool Rd, Halifax, NS' },
    seaportMarket: { name: 'Seaport Farmers Market', lat: 44.6420, lon: -63.5690, address: '1209 Marginal Rd, Halifax, NS' },
    citadel: { name: 'Citadel Hill', lat: 44.6475, lon: -63.5803, address: 'Citadel Hill, Halifax, NS' },
    publicGardens: { name: 'Halifax Public Gardens', lat: 44.6425, lon: -63.5819, address: '5665 Spring Garden Rd, Halifax, NS' },
    ferryTerminal: { name: 'Halifax Ferry Terminal', lat: 44.6427, lon: -63.5685, address: 'Halifax Ferry Terminal, Halifax, NS' },
    qeii: { name: 'QEII Health Sciences Centre', lat: 44.6376, lon: -63.5879, address: '1796 Robie St, Halifax, NS' },
    lawrencetown: { name: 'Lawrencetown Beach', lat: 44.4989, lon: -63.3560, address: 'Lawrencetown Beach, Lawrencetown, NS' },
  },
  abuja: {
    wuseMarket: { name: 'Wuse Market', lat: 9.0780, lon: 7.4702, address: 'Wuse Market, Wuse 2, Abuja' },
    wuse2: { name: 'Aminu Kano Crescent', lat: 9.0810, lon: 7.4760, address: 'Aminu Kano Cres, Wuse 2, Abuja' },
    jabiMall: { name: 'Jabi Lake Mall', lat: 9.0723, lon: 7.4228, address: 'Jabi Lake Mall, Jabi, Abuja' },
    millenniumPark: { name: 'Millennium Park', lat: 9.0556, lon: 7.4897, address: 'Millennium Park, Maitama, Abuja' },
    garkiMarket: { name: 'Garki International Market', lat: 9.0317, lon: 7.4836, address: 'Garki International Market, Garki, Abuja' },
    maitama: { name: 'Maitama', lat: 9.0889, lon: 7.4936, address: 'Maitama, Abuja' },
    gwarinpa: { name: 'Gwarinpa', lat: 9.1137, lon: 7.4110, address: 'Gwarinpa, Abuja' },
    utakoMarket: { name: 'Utako Market', lat: 9.0833, lon: 7.4500, address: 'Utako Market, Utako, Abuja' },
    airportRoad: { name: 'Airport Road', lat: 9.0167, lon: 7.3450, address: 'Airport Rd, Abuja' },
    airport: { name: 'Nnamdi Azikiwe Intl Airport', lat: 9.0068, lon: 7.2632, address: 'Nnamdi Azikiwe International Airport, Abuja' },
  },
};

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

// ---------------------------------------------------------------------------
// Question definitions. `place` omitted → no pin and scope ANYWHERE.
// A pinned question defaults to NEIGHBOURHOOD unless locationScope overrides.
// ---------------------------------------------------------------------------
type ChatLine = { from: 'responder' | 'questioner'; text: string; };

type QuestionBase = {
  title: string;
  detail: string;
  categorySlug: string;
  price: number;
  acceptanceCriteria: string;
  place?: Place;
  locationScope?: LocationScope;
};

type FreshDef = QuestionBase & { askedHoursAgo: number; };
type PendingDef = QuestionBase & { questioner: string; responder: string; askedHoursAgo: number; requestedHoursAgo: number; };
type ActiveDef = QuestionBase & { questioner: string; responder: string; askedHoursAgo: number; chat: ChatLine[]; };
type DeclinedDef = QuestionBase & { questioner: string; responder: string; rejectionReason: string; askedHoursAgo: number; };
type AnsweredDef = QuestionBase & {
  questioner: string;
  responder: string;
  /** A second responder whose PENDING request becomes CLOSED_ANSWERED on close. */
  extraPendingResponder?: string;
  chat: ChatLine[];
  closedDaysAgo: number;
  questionerStars: number;
  questionerComment: string;
  responderStars: number;
  responderComment: string;
};
type ClosedOtherDef = QuestionBase & { questioner: string; closeReason: string; closedDaysAgo: number; };

type CityContent = {
  fresh: FreshDef[];
  pending: PendingDef[];
  active: ActiveDef[];
  declined: DeclinedDef[];
  answered: AnsweredDef[];
  closedOther: ClosedOtherDef[];
  far: FreshDef[];
};

// ---------------------------------------------------------------------------
// Halifax content
// ---------------------------------------------------------------------------
const H = PLACES.halifax;
const HALIFAX: CityContent = {
  fresh: [
    {
      title: 'Is the waterfront boardwalk fogged in right now?',
      detail: 'Thinking of walking the boardwalk at lunch — can you actually see the water, or is it a total whiteout?',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'A photo from the boardwalk or a quick visibility note.',
      place: H.waterfront,
      locationScope: LocationScope.WALKING,
      askedHoursAgo: 3,
    },
    {
      title: 'Open tables at a Spring Garden café?',
      detail: 'Need a café with free tables and decent wifi for a couple of hours this afternoon.',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Name of a café with free tables right now.',
      place: H.springGarden,
      locationScope: LocationScope.WALKING,
      askedHoursAgo: 7,
    },
    {
      title: 'Best lobster roll within walking distance of the waterfront?',
      detail: 'Family is visiting this weekend and I want a reliable lobster roll spot near the water.',
      categorySlug: 'other',
      price: 4,
      acceptanceCriteria: 'A spot name plus one line on why it is good.',
      place: H.waterfront,
      locationScope: LocationScope.ANYWHERE,
      askedHoursAgo: 26,
    },
    {
      title: 'Are dogs allowed on leash in the Public Gardens?',
      detail: 'Want to bring our dog through the Public Gardens tomorrow but the rules online are unclear.',
      categorySlug: 'other',
      price: 2,
      acceptanceCriteria: 'A definitive yes/no, ideally from the entrance sign.',
      place: H.publicGardens,
      locationScope: LocationScope.CITY,
      askedHoursAgo: 49,
    },
  ],
  pending: [
    {
      title: 'Is the Dartmouth ferry running on schedule?',
      detail: 'Heading to Dartmouth for a 6pm appointment — any delays on the ferry this afternoon?',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Photo of the departure board or confirmation from the terminal.',
      place: H.ferryTerminal,
      locationScope: LocationScope.WALKING,
      questioner: 'david_p',
      responder: 'felix_n',
      askedHoursAgo: 8,
      requestedHoursAgo: 3,
    },
    {
      title: 'Wait time at the QEII blood collection clinic?',
      detail: 'Need to squeeze in bloodwork before work tomorrow morning.',
      categorySlug: 'services',
      price: 5,
      acceptanceCriteria: 'Current estimated wait in minutes.',
      place: H.qeii,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'carla_d',
      responder: 'bob_chen',
      askedHoursAgo: 12,
      requestedHoursAgo: 6,
    },
  ],
  active: [
    {
      title: 'Is Citadel Hill open for sunset viewing tonight?',
      detail: 'Want to take photos from the top around 8pm — is the hill open to the public in the evening?',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Confirmation of gate hours or a photo from up there.',
      place: H.citadel,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'alice_m',
      responder: 'elena_r',
      askedHoursAgo: 30,
      chat: [
        { from: 'responder', text: 'I walk by there most evenings. I can check on my way home today and send a photo of the gate hours.' },
        { from: 'questioner', text: 'That would be great, thank you! If it is open, is parking usually full around that time?' },
        { from: 'responder', text: 'Just checked — gates open till 9pm tonight. The Sackville St lot had plenty of spots around 7.' },
      ],
    },
    {
      title: 'Quiet study spots at Central Library this afternoon?',
      detail: 'Looking for a quiet corner with outlets for about three hours of focused work.',
      categorySlug: 'services',
      price: 3,
      acceptanceCriteria: 'Which floor/area is quiet right now and whether desks are free.',
      place: H.centralLibrary,
      locationScope: LocationScope.WALKING,
      questioner: 'bob_chen',
      responder: 'grace_o',
      askedHoursAgo: 20,
      chat: [
        { from: 'responder', text: 'I study here most weekdays. The 4th floor window desks are free right now; 2nd floor is packed with a school group.' },
        { from: 'questioner', text: 'Perfect — grabbing a coffee and heading up. Are the outlets along the window working?' },
      ],
    },
  ],
  declined: [
    {
      title: 'Dog groomer with a Saturday slot near the North End?',
      detail: 'Our golden retriever needs a trim before a family photo on Sunday.',
      categorySlug: 'services',
      price: 10,
      acceptanceCriteria: 'A groomer with a confirmed Saturday opening and a way to book.',
      place: H.quinpool,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'felix_n',
      responder: 'carla_d',
      rejectionReason: 'Prefer someone closer to the specified location',
      askedHoursAgo: 36,
    },
  ],
  answered: [
    {
      title: "Is the Seaport Farmers' Market packed right now?",
      detail: 'Want to grab lunch from the market but only have 40 minutes.',
      categorySlug: 'shopping',
      price: 4,
      acceptanceCriteria: 'Crowd level plus a photo of the main hall.',
      place: H.seaportMarket,
      locationScope: LocationScope.WALKING,
      questioner: 'alice_m',
      responder: 'grace_o',
      chat: [
        { from: 'responder', text: 'Just left — steady crowd but the food stalls move fast. The bakery stall is sold out though.' },
        { from: 'questioner', text: 'Perfect, heading over now. Thanks!' },
      ],
      closedDaysAgo: 1,
      questionerStars: 5,
      questionerComment: 'Exactly what I needed, answered within the hour.',
      responderStars: 5,
      responderComment: 'Clear question and quick to close out.',
    },
    {
      title: 'Open tennis courts at the Common this evening?',
      detail: 'Want to book a court around 6pm if any are free.',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'How many courts are free and whether the lights are on.',
      place: H.common,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'bob_chen',
      responder: 'elena_r',
      chat: [
        { from: 'responder', text: 'Two courts free as of 6pm and the lights are on. One has a small puddle near the baseline.' },
        { from: 'questioner', text: 'Booked it — appreciate the heads-up!' },
      ],
      closedDaysAgo: 3,
      questionerStars: 5,
      questionerComment: 'Fast, accurate, and super helpful.',
      responderStars: 4,
      responderComment: 'Easy to work with, knew what they wanted.',
    },
    {
      title: 'Walk-in wait at the Quinpool barbershop?',
      detail: 'Need a cut today without an appointment.',
      categorySlug: 'services',
      price: 3,
      acceptanceCriteria: 'Current wait time and how many barbers are working.',
      place: H.quinpool,
      locationScope: LocationScope.WALKING,
      questioner: 'carla_d',
      responder: 'felix_n',
      chat: [
        { from: 'responder', text: 'About a 20 minute wait, two chairs working. They take walk-ins till 5.' },
        { from: 'questioner', text: 'Got in and out in half an hour. Thanks!' },
      ],
      closedDaysAgo: 5,
      questionerStars: 4,
      questionerComment: 'Answer was accurate, took a little while to arrive.',
      responderStars: 5,
      responderComment: 'Polite and responsive throughout.',
    },
    {
      title: 'Does the Central Library have quiet rooms free on Sundays?',
      detail: 'Planning a group study session this Sunday.',
      categorySlug: 'services',
      price: 3,
      acceptanceCriteria: 'Whether study rooms are open Sunday and if booking is needed.',
      place: H.centralLibrary,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'david_p',
      responder: 'alice_m',
      extraPendingResponder: 'bob_chen',
      chat: [
        { from: 'responder', text: 'Yes — the 3rd floor rooms were open all afternoon last Sunday, no booking needed. First come first served.' },
        { from: 'questioner', text: 'Exactly what I needed. Thank you!' },
      ],
      closedDaysAgo: 8,
      questionerStars: 5,
      questionerComment: 'Went beyond what I asked — really appreciated.',
      responderStars: 5,
      responderComment: 'Appreciated the quick approval.',
    },
    {
      title: 'Is the Point Pleasant off-leash area muddy after the rain?',
      detail: 'Deciding between the park and the indoor dog gym today.',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Photo of the trail surface or a quick condition note.',
      place: H.pointPleasant,
      locationScope: LocationScope.CITY,
      questioner: 'elena_r',
      responder: 'carla_d',
      chat: [
        { from: 'responder', text: 'Mostly dry — small puddles near the lower trail only. Dogs were having a blast this morning.' },
        { from: 'questioner', text: 'Park it is. Thanks for checking!' },
      ],
      closedDaysAgo: 11,
      questionerStars: 4,
      questionerComment: 'Knew the area well and gave practical detail.',
      responderStars: 5,
      responderComment: 'Friendly and quick with follow-ups.',
    },
    {
      title: 'Any kayak rentals open on the waterfront today?',
      detail: 'Two of us want to rent kayaks this afternoon.',
      categorySlug: 'location',
      price: 4,
      acceptanceCriteria: 'Which kiosk is open, closing time, and the hourly rate.',
      place: H.waterfront,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'felix_n',
      responder: 'bob_chen',
      chat: [
        { from: 'responder', text: 'The kiosk by the wave sculpture is open till 8pm, $25 an hour. Hardly any line right now.' },
        { from: 'questioner', text: 'Just got back — great tip, thanks!' },
      ],
      closedDaysAgo: 15,
      questionerStars: 5,
      questionerComment: 'Clear answer with everything I asked for.',
      responderStars: 4,
      responderComment: 'Payment came through right after I answered.',
    },
    {
      title: 'Is the Quinpool bike lane construction finished?',
      detail: 'Commute planning for next week.',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Which stretches are still coned off.',
      place: H.quinpool,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'grace_o',
      responder: 'david_p',
      chat: [
        { from: 'responder', text: 'Eastbound side is fully done. Westbound still has cones near Robie — maybe another week there.' },
        { from: 'questioner', text: 'Good to know, I will reroute. Thanks!' },
      ],
      closedDaysAgo: 19,
      questionerStars: 4,
      questionerComment: 'Solid answer, could have used a photo.',
      responderStars: 4,
      responderComment: 'Straightforward question, easy to help.',
    },
  ],
  closedOther: [
    {
      title: 'Anyone selling a used road bike this week?',
      detail: 'Looking for a 56cm road bike in good condition, budget around $600.',
      categorySlug: 'shopping',
      price: 12,
      acceptanceCriteria: 'Seller contact with photos of the bike.',
      questioner: 'grace_o',
      closeReason: 'I no longer need the information',
      closedDaysAgo: 6,
    },
  ],
  far: [
    {
      title: 'Surf conditions at Lawrencetown Beach?',
      detail: 'Thinking of driving out this afternoon — how is the surf and is the parking lot full?',
      categorySlug: 'location',
      price: 6,
      acceptanceCriteria: 'Photo of the water or a quick note on wave height.',
      place: H.lawrencetown,
      locationScope: LocationScope.NEIGHBOURHOOD,
      askedHoursAgo: 5,
    },
  ],
};

// ---------------------------------------------------------------------------
// Abuja content
// ---------------------------------------------------------------------------
const A = PLACES.abuja;
const ABUJA: CityContent = {
  fresh: [
    {
      title: 'Which filling station has the shortest queue in Wuse 2?',
      detail: 'Need to fuel up before a long drive tomorrow morning.',
      categorySlug: 'location',
      price: 4,
      acceptanceCriteria: 'Station name plus a photo of the queue or an estimated wait.',
      place: A.wuse2,
      locationScope: LocationScope.WALKING,
      askedHoursAgo: 2,
    },
    {
      title: 'Is there power in Gwarinpa right now?',
      detail: 'Trying to decide whether to work from home or head to a café with a generator.',
      categorySlug: 'other',
      price: 2,
      acceptanceCriteria: 'Yes/no and roughly how long power has been on.',
      place: A.gwarinpa,
      locationScope: LocationScope.NEIGHBOURHOOD,
      askedHoursAgo: 9,
    },
    {
      title: 'Best suya spot open tonight near Wuse?',
      detail: 'Craving proper suya this evening — where is actually good and open late?',
      categorySlug: 'other',
      price: 4,
      acceptanceCriteria: 'Spot name and what to order.',
      place: A.wuse2,
      locationScope: LocationScope.CITY,
      askedHoursAgo: 30,
    },
    {
      title: 'Is the Jabi Lake Mall cinema showing evening movies today?',
      detail: 'Planning a movie night — want to confirm there are 7pm+ showings before we drive over.',
      categorySlug: 'other',
      price: 3,
      acceptanceCriteria: "Photo of today's listings or confirmation from the desk.",
      place: A.jabiMall,
      locationScope: LocationScope.WALKING,
      askedHoursAgo: 55,
    },
  ],
  pending: [
    {
      title: 'How bad is Airport Road traffic toward the city centre?',
      detail: 'Leaving for the airport area soon — should I take the expressway or the service lanes?',
      categorySlug: 'driving',
      price: 4,
      acceptanceCriteria: 'Current congestion level and the faster route right now.',
      place: A.airportRoad,
      locationScope: LocationScope.CITY,
      questioner: 'ada_n',
      responder: 'emeka_e',
      askedHoursAgo: 6,
      requestedHoursAgo: 2,
    },
    {
      title: 'Is the Garki market vegetable row open this evening?',
      detail: 'Need fresh peppers and tomatoes for a party tomorrow.',
      categorySlug: 'shopping',
      price: 3,
      acceptanceCriteria: 'Yes/no plus which stalls are still open.',
      place: A.garkiMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'fatima_b',
      responder: 'chidi_o',
      askedHoursAgo: 10,
      requestedHoursAgo: 5,
    },
  ],
  active: [
    {
      title: 'Are the ATMs at Garki dispensing cash today?',
      detail: 'Need cash this afternoon — which bank machines around Garki are actually working?',
      categorySlug: 'services',
      price: 3,
      acceptanceCriteria: 'Which ATMs are dispensing and the queue length.',
      place: A.garkiMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'chidi_o',
      responder: 'zainab_y',
      askedHoursAgo: 26,
      chat: [
        { from: 'responder', text: 'The Zenith ATM by the market gate is dispensing, queue is about 15 people. The GTB machine is offline.' },
        { from: 'questioner', text: 'Thanks! Is the Zenith queue moving fast?' },
        { from: 'responder', text: 'Roughly a minute per person, so plan for about 15 minutes.' },
      ],
    },
    {
      title: 'Tailor in Wuse Market who can do same-week alterations?',
      detail: 'Need an agbada taken in before a wedding on Saturday.',
      categorySlug: 'services',
      price: 8,
      acceptanceCriteria: 'Tailor name/stall and confirmation they take rush jobs.',
      place: A.wuseMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'emeka_e',
      responder: 'ngozi_o',
      askedHoursAgo: 44,
      chat: [
        { from: 'responder', text: "Mallam Sadiq's stall on the fabric row takes rush jobs — he altered mine in three days." },
        { from: 'questioner', text: 'Perfect — do you have his stall number or a landmark near it?' },
      ],
    },
  ],
  declined: [
    {
      title: 'Laundry pickup and delivery service in Maitama?',
      detail: 'Looking for a reliable laundry service that picks up and drops off.',
      categorySlug: 'services',
      price: 6,
      acceptanceCriteria: 'Service name, contact, and turnaround time.',
      place: A.maitama,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'tunde_a',
      responder: 'fatima_b',
      rejectionReason: 'Already got a response',
      askedHoursAgo: 50,
    },
  ],
  answered: [
    {
      title: 'Is Millennium Park open to visitors this afternoon?',
      detail: 'Taking the kids out — want to confirm the gates are open and if parking is free.',
      categorySlug: 'location',
      price: 3,
      acceptanceCriteria: 'Gate status and closing time today.',
      place: A.millenniumPark,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'ada_n',
      responder: 'zainab_y',
      chat: [
        { from: 'responder', text: 'Yes, gates are open till 6pm. Parking by the main gate is free today.' },
        { from: 'questioner', text: 'Wonderful — thanks so much!' },
      ],
      closedDaysAgo: 2,
      questionerStars: 5,
      questionerComment: 'Quick and exactly what I asked.',
      responderStars: 5,
      responderComment: 'Clear question, easy to answer.',
    },
    {
      title: 'Which filling stations have fuel on Aminu Kano Crescent?',
      detail: 'Half the stations seem to be closed this week — need a current picture.',
      categorySlug: 'location',
      price: 5,
      acceptanceCriteria: 'Station name, fuel availability, and queue length.',
      place: A.wuse2,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'chidi_o',
      responder: 'tunde_a',
      chat: [
        { from: 'responder', text: 'The NNPC station has fuel, short queue as of 30 minutes ago. The two smaller stations are shut.' },
        { from: 'questioner', text: 'Filled up with no wait. Lifesaver, thanks!' },
      ],
      closedDaysAgo: 4,
      questionerStars: 5,
      questionerComment: 'Saved me an hour of driving around.',
      responderStars: 5,
      responderComment: 'Payment came through immediately.',
    },
    {
      title: 'Price of a crate of eggs at Utako Market today?',
      detail: 'Stocking up for the bakery — need the going rate before I send someone.',
      categorySlug: 'shopping',
      price: 4,
      acceptanceCriteria: 'Current price from at least two stalls.',
      place: A.utakoMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'fatima_b',
      responder: 'ngozi_o',
      extraPendingResponder: 'emeka_e',
      chat: [
        { from: 'responder', text: '₦4,800 at the stalls near the north entrance. One stall offered ₦4,500 each if you take two crates.' },
        { from: 'questioner', text: 'Sent my guy for two crates. Thanks so much!' },
      ],
      closedDaysAgo: 6,
      questionerStars: 5,
      questionerComment: 'Checked multiple stalls — very thorough.',
      responderStars: 4,
      responderComment: 'Knew exactly what she wanted.',
    },
    {
      title: 'Is the Jabi boat club running rides today?',
      detail: 'Want to take visitors out on the lake this evening.',
      categorySlug: 'location',
      price: 4,
      acceptanceCriteria: 'Whether rides are running, price, and closing time.',
      place: A.jabiMall,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'emeka_e',
      responder: 'ada_n',
      chat: [
        { from: 'responder', text: 'Running till sunset, ₦3,000 per person. Not crowded at all right now.' },
        { from: 'questioner', text: 'We had a great evening — thanks!' },
      ],
      closedDaysAgo: 9,
      questionerStars: 4,
      questionerComment: 'Helpful, though the price had gone up slightly.',
      responderStars: 5,
      responderComment: 'Polite and quick to close out.',
    },
    {
      title: 'Does the Wuse Market phone repair row open on Sundays?',
      detail: 'Cracked my screen and Sunday is my only free day.',
      categorySlug: 'tech',
      price: 3,
      acceptanceCriteria: 'Which stalls open Sunday and rough screen replacement cost.',
      place: A.wuseMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'zainab_y',
      responder: 'chidi_o',
      chat: [
        { from: 'responder', text: "About half the stalls were open yesterday. Uche's stall fixed my screen in an hour for a fair price." },
        { from: 'questioner', text: 'Screen replaced same day. Really appreciate it!' },
      ],
      closedDaysAgo: 13,
      questionerStars: 5,
      questionerComment: 'Friendly, accurate, and followed up.',
      responderStars: 5,
      responderComment: 'Great communication from start to finish.',
    },
    {
      title: 'Fresh fish at Garki market this morning?',
      detail: 'Need fresh catch for a weekend pepper soup.',
      categorySlug: 'shopping',
      price: 3,
      acceptanceCriteria: 'What fish is available and which stalls have it fresh.',
      place: A.garkiMarket,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'tunde_a',
      responder: 'fatima_b',
      chat: [
        { from: 'responder', text: 'Yes — icefish and croaker at the cold room stalls, but they are going fast.' },
        { from: 'questioner', text: 'Got the last two croakers. You called it right!' },
      ],
      closedDaysAgo: 16,
      questionerStars: 4,
      questionerComment: 'Good answer, arrived just in time.',
      responderStars: 4,
      responderComment: 'Straightforward and easy to help.',
    },
    {
      title: 'How long is the queue at the Maitama immigration office?',
      detail: 'Need to renew my passport and can only go early morning.',
      categorySlug: 'services',
      price: 5,
      acceptanceCriteria: 'Queue length at opening and any tips for being seen quickly.',
      place: A.maitama,
      locationScope: LocationScope.NEIGHBOURHOOD,
      questioner: 'ngozi_o',
      responder: 'emeka_e',
      chat: [
        { from: 'responder', text: 'Long — about 40 people by 8am. Come before 7:30 with a chair and water, and go straight to the renewal desk.' },
        { from: 'questioner', text: 'Followed your advice and was done by 10. Thank you!' },
      ],
      closedDaysAgo: 20,
      questionerStars: 4,
      questionerComment: 'Practical advice that actually worked.',
      responderStars: 5,
      responderComment: 'Appreciated the quick approval.',
    },
  ],
  closedOther: [
    {
      title: 'Ride share to Kaduna tomorrow morning?',
      detail: 'Looking to split fuel costs with someone driving to Kaduna early tomorrow.',
      categorySlug: 'driving',
      price: 12,
      acceptanceCriteria: 'Driver contact and departure time.',
      questioner: 'zainab_y',
      closeReason: 'I no longer need the information',
      closedDaysAgo: 4,
    },
  ],
  far: [
    {
      title: 'How busy is the airport departures hall this morning?',
      detail: 'Flying out later — trying to decide how early to leave.',
      categorySlug: 'location',
      price: 5,
      acceptanceCriteria: 'Photo of the check-in area or an estimated queue time.',
      place: A.airport,
      locationScope: LocationScope.NEIGHBOURHOOD,
      askedHoursAgo: 4,
    },
  ],
};

// ---------------------------------------------------------------------------
// Canonical flow helpers — each mirrors its controller counterpart.
// ---------------------------------------------------------------------------
type SeedUser = { id: string; email: string; name: string; username: string; city: CityKey; };

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

/** Mirrors `createRequest` in requestController.ts. */
async function seedRequestToRespond(opts: {
  question: {
    id: string;
    userId: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    detail: string;
    acceptanceCriteria: string;
  };
  responder: SeedUser;
  at?: Date;
}) {
  const request = await prisma.answerRequest.create({
    data: {
      questionId: opts.question.id,
      responderId: opts.responder.id,
      questionerId: opts.question.userId,
      status: AnswerRequestStatus.PENDING,
      ...(opts.at ? { createdAt: opts.at } : {}),
    },
  });

  await createQuestionBriefingMessages({
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

  await createSystemMessage({
    questionId: opts.question.id,
    answerRequestId: request.id,
    senderId: opts.responder.id,
    text: `Your request to answer the question has been sent to the question creator. We'll let you know when they respond.`,
    visibleToUserId: opts.responder.id,
  });
  await createSystemMessage({
    questionId: opts.question.id,
    answerRequestId: request.id,
    senderId: opts.responder.id,
    text: `You have a request by @${opts.responder.username} to respond to your question. View their profile before accepting the request.`,
    visibleToUserId: opts.question.userId,
  });

  return request;
}

/** Mirrors `acceptRequest`: PENDING → ACCEPTED with respondedAt + 2 system messages. */
async function seedAcceptRequest(opts: {
  questionId: string;
  requestId: string;
  questionerId: string;
  responder: SeedUser;
  at?: Date;
}) {
  await prisma.answerRequest.update({
    where: { id: opts.requestId },
    data: { status: AnswerRequestStatus.ACCEPTED, respondedAt: opts.at ?? new Date() },
  });

  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: opts.requestId,
    senderId: opts.questionerId,
    text: `You approved @${opts.responder.username} to respond`,
    visibleToUserId: opts.questionerId,
  });
  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: opts.requestId,
    senderId: opts.questionerId,
    text: 'Request accepted. Send your response.',
    visibleToUserId: opts.responder.id,
  });
}

/** Mirrors `rejectRequest`: REJECTED + QuestionResponderBlock + 2 system messages. */
async function seedDeclineRequest(opts: {
  questionId: string;
  requestId: string;
  questionerId: string;
  responder: SeedUser;
  rejectionReason: string;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  await prisma.$transaction(async (tx) => {
    await tx.answerRequest.update({
      where: { id: opts.requestId },
      data: {
        status: AnswerRequestStatus.REJECTED,
        rejectionReason: opts.rejectionReason,
        respondedAt: at,
      },
    });
    await tx.questionResponderBlock.create({
      data: {
        questionId: opts.questionId,
        responderId: opts.responder.id,
        answerRequestId: opts.requestId,
        rejectionReason: opts.rejectionReason,
        createdAt: at,
      },
    });
  });

  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: opts.requestId,
    senderId: opts.questionerId,
    text: `You declined @${opts.responder.username}'s request`,
    visibleToUserId: opts.questionerId,
  });
  await createSystemMessage({
    questionId: opts.questionId,
    answerRequestId: opts.requestId,
    senderId: opts.questionerId,
    text: `Your request was declined: ${opts.rejectionReason}`,
    visibleToUserId: opts.responder.id,
  });
}

/** Mirrors `sendMessage`: a plain USER message while the request is ACCEPTED. */
async function seedUserMessage(opts: {
  questionId: string;
  answerRequestId: string;
  senderId: string;
  text: string;
}) {
  return prisma.message.create({
    data: {
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      senderId: opts.senderId,
      text: opts.text,
      type: MessageType.USER,
    },
  });
}

/**
 * Mirrors `closeQuestion`: Question → CLOSED with closeReason + closedAt, and
 * answeredAt only when reason is 'Question answered'. Every PENDING request
 * transitions to CLOSED_ANSWERED with a system notice to that responder;
 * ACCEPTED requests are untouched.
 */
async function seedCloseQuestion(opts: { questionId: string; reason: string; at?: Date; }) {
  const at = opts.at ?? new Date();
  const isAnsweredClose = opts.reason === 'Question answered';
  const systemText = isAnsweredClose
    ? 'Question has been answered.'
    : 'Question has been closed.';

  await prisma.question.update({
    where: { id: opts.questionId },
    data: {
      status: QuestionStatus.CLOSED,
      closeReason: opts.reason,
      closedAt: at,
      answeredAt: isAnsweredClose ? at : null,
    },
  });

  const pendingRequests = await prisma.answerRequest.findMany({
    where: { questionId: opts.questionId, status: AnswerRequestStatus.PENDING },
    select: { id: true, responderId: true },
  });

  if (pendingRequests.length > 0) {
    await prisma.answerRequest.updateMany({
      where: { id: { in: pendingRequests.map((r) => r.id) } },
      data: { status: AnswerRequestStatus.CLOSED_ANSWERED, respondedAt: at },
    });
    for (const r of pendingRequests) {
      await createSystemMessage({
        questionId: opts.questionId,
        answerRequestId: r.id,
        senderId: r.responderId,
        text: systemText,
        visibleToUserId: r.responderId,
      });
    }
  }
}

/**
 * Mirrors the mutual review reveal: both Review rows with isRevealed=true,
 * then canonical UserRating aggregation via the shared helper.
 */
async function seedMutualReview(opts: {
  requestId: string;
  questionerId: string;
  responderId: string;
  questionerStars: number;
  questionerComment?: string;
  responderStars: number;
  responderComment?: string;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  await prisma.review.createMany({
    data: [
      {
        answerRequestId: opts.requestId,
        raterId: opts.questionerId,
        rateeId: opts.responderId,
        raterRole: ReviewerRole.QUESTIONER,
        stars: opts.questionerStars,
        comment: opts.questionerComment ?? null,
        isRevealed: true,
        createdAt: at,
        revealedAt: at,
      },
      {
        answerRequestId: opts.requestId,
        raterId: opts.responderId,
        rateeId: opts.questionerId,
        raterRole: ReviewerRole.RESPONDER,
        stars: opts.responderStars,
        comment: opts.responderComment ?? null,
        isRevealed: true,
        createdAt: at,
        revealedAt: at,
      },
    ],
  });

  await recomputeUserRatingAggregate(opts.responderId, RatingRole.AS_RESPONDER);
  await recomputeUserRatingAggregate(opts.questionerId, RatingRole.AS_QUESTIONER);
}

/**
 * Mirrors `finalizeChargeOutcome`'s end state: a SUCCEEDED QUESTION_PAYMENT
 * ledger row for an accepted request (what exists after the questioner pays
 * for the answer through the chat payment sheet).
 */
async function seedSucceededPayment(opts: {
  payerId: string;
  payeeId: string;
  questionId: string;
  answerRequestId: string;
  amount: number;
  at: Date;
  ref: string;
}) {
  await prisma.transaction.create({
    data: {
      provider: 'STRIPE',
      type: 'QUESTION_PAYMENT',
      status: 'SUCCEEDED',
      amount: opts.amount,
      currency: 'USD',
      platformFee: 0,
      payerId: opts.payerId,
      payeeId: opts.payeeId,
      questionId: opts.questionId,
      answerRequestId: opts.answerRequestId,
      providerRef: opts.ref,
      createdAt: opts.at,
      updatedAt: opts.at,
    },
  });
}

/**
 * Rewrites a request's messages onto a realistic timeline, preserving their
 * creation order. Messages older than a day are marked read; recent chats
 * keep the last message unread so badges look natural on first login.
 */
async function backdateRequestMessages(opts: {
  answerRequestId: string;
  startAt: Date;
  stepMinutes?: number;
  leaveLastUnread?: boolean;
}) {
  const step = opts.stepMinutes ?? 9;
  const messages = await prisma.message.findMany({
    where: { answerRequestId: opts.answerRequestId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  for (let i = 0; i < messages.length; i++) {
    const createdAt = minutesAfter(opts.startAt, i * step);
    const isLast = i === messages.length - 1;
    const readAt = opts.leaveLastUnread && isLast ? null : minutesAfter(createdAt, 14);
    await prisma.message.update({ where: { id: messages[i].id }, data: { createdAt, readAt } });
  }
}

// ---------------------------------------------------------------------------
// City runner — plays the same scenario mix in each market.
// ---------------------------------------------------------------------------
async function createQuestion(
  def: QuestionBase,
  questionerId: string,
  categories: Record<string, { id: string; }>,
  createdAt: Date,
) {
  const pinned = Boolean(def.place);
  return prisma.question.create({
    data: {
      title: def.title,
      detail: def.detail,
      categoryId: categories[def.categorySlug].id,
      price: def.price,
      acceptanceCriteria: def.acceptanceCriteria,
      latitude: def.place?.lat ?? null,
      longitude: def.place?.lon ?? null,
      address: def.place?.address ?? null,
      locationScope: pinned ? def.locationScope ?? LocationScope.NEIGHBOURHOOD : LocationScope.ANYWHERE,
      userId: questionerId,
      status: QuestionStatus.OPEN,
      createdAt,
    },
  });
}

function briefingShape(q: {
  id: string;
  userId: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  detail: string;
  acceptanceCriteria: string;
}) {
  return {
    id: q.id,
    userId: q.userId,
    address: q.address,
    latitude: q.latitude,
    longitude: q.longitude,
    detail: q.detail,
    acceptanceCriteria: q.acceptanceCriteria,
  };
}

async function seedCity(opts: {
  label: string;
  content: CityContent;
  users: SeedUser[];
  categories: Record<string, { id: string; }>;
  paymentRefStart: number;
}) {
  const { content, users, categories } = opts;
  const byUsername = new Map(users.map((u) => [u.username, u]));
  const user = (username: string): SeedUser => {
    const found = byUsername.get(username);
    if (!found) throw new Error(`Seed def references unknown user @${username} in ${opts.label}`);
    return found;
  };

  let paymentRefCounter = opts.paymentRefStart;

  console.log(`\n${opts.label}: fresh questions (no requests yet)…`);
  for (const def of content.fresh) {
    // Rotate authorship across the city so every user's Outbox has content.
    const questioner = users[content.fresh.indexOf(def) % users.length];
    await createQuestion(def, questioner.id, categories, hoursAgo(def.askedHoursAgo));
    console.log(`  OPEN: ${def.title}`);
  }

  console.log(`${opts.label}: pending requests awaiting questioner approval…`);
  for (const def of content.pending) {
    const questioner = user(def.questioner);
    const responder = user(def.responder);
    const askedAt = hoursAgo(def.askedHoursAgo);
    const q = await createQuestion(def, questioner.id, categories, askedAt);
    const request = await seedRequestToRespond({
      question: briefingShape(q),
      responder,
      at: hoursAgo(def.requestedHoursAgo),
    });
    await backdateRequestMessages({
      answerRequestId: request.id,
      startAt: hoursAgo(def.requestedHoursAgo),
      leaveLastUnread: true,
    });
    console.log(`  PENDING: @${responder.username} → "${def.title}"`);
  }

  console.log(`${opts.label}: accepted requests with an active chat…`);
  for (const def of content.active) {
    const questioner = user(def.questioner);
    const responder = user(def.responder);
    const askedAt = hoursAgo(def.askedHoursAgo);
    const q = await createQuestion(def, questioner.id, categories, askedAt);
    const request = await seedRequestToRespond({
      question: briefingShape(q),
      responder,
      at: minutesAfter(askedAt, 90),
    });
    await seedAcceptRequest({
      questionId: q.id,
      requestId: request.id,
      questionerId: questioner.id,
      responder,
      at: minutesAfter(askedAt, 150),
    });
    for (const line of def.chat) {
      await seedUserMessage({
        questionId: q.id,
        answerRequestId: request.id,
        senderId: line.from === 'responder' ? responder.id : questioner.id,
        text: line.text,
      });
    }
    await backdateRequestMessages({
      answerRequestId: request.id,
      startAt: minutesAfter(askedAt, 90),
      stepMinutes: 22,
      leaveLastUnread: true,
    });
    console.log(`  ACTIVE: @${responder.username} ↔ @${questioner.username} on "${def.title}"`);
  }

  console.log(`${opts.label}: declined requests…`);
  for (const def of content.declined) {
    const questioner = user(def.questioner);
    const responder = user(def.responder);
    const askedAt = hoursAgo(def.askedHoursAgo);
    const q = await createQuestion(def, questioner.id, categories, askedAt);
    const request = await seedRequestToRespond({
      question: briefingShape(q),
      responder,
      at: minutesAfter(askedAt, 60),
    });
    await seedDeclineRequest({
      questionId: q.id,
      requestId: request.id,
      questionerId: questioner.id,
      responder,
      rejectionReason: def.rejectionReason,
      at: minutesAfter(askedAt, 240),
    });
    await backdateRequestMessages({ answerRequestId: request.id, startAt: minutesAfter(askedAt, 60) });
    console.log(`  DECLINED: @${responder.username} on "${def.title}" (${def.rejectionReason})`);
  }

  console.log(`${opts.label}: answered questions (payment + mutual review)…`);
  for (const def of content.answered) {
    const questioner = user(def.questioner);
    const responder = user(def.responder);
    const closedAt = daysAgo(def.closedDaysAgo);
    const askedAt = new Date(closedAt.getTime() - 26 * 3_600_000);
    const q = await createQuestion(def, questioner.id, categories, askedAt);

    const request = await seedRequestToRespond({
      question: briefingShape(q),
      responder,
      at: minutesAfter(askedAt, 120),
    });

    // Optional second responder whose PENDING request is closed into
    // CLOSED_ANSWERED when the question closes — mirrors closeQuestion.
    let extraRequestId: string | null = null;
    if (def.extraPendingResponder) {
      const extra = await seedRequestToRespond({
        question: briefingShape(q),
        responder: user(def.extraPendingResponder),
        at: minutesAfter(askedAt, 180),
      });
      extraRequestId = extra.id;
    }

    await seedAcceptRequest({
      questionId: q.id,
      requestId: request.id,
      questionerId: questioner.id,
      responder,
      at: minutesAfter(askedAt, 300),
    });
    for (const line of def.chat) {
      await seedUserMessage({
        questionId: q.id,
        answerRequestId: request.id,
        senderId: line.from === 'responder' ? responder.id : questioner.id,
        text: line.text,
      });
    }

    await seedCloseQuestion({ questionId: q.id, reason: 'Question answered', at: closedAt });

    await seedSucceededPayment({
      payerId: questioner.id,
      payeeId: responder.id,
      questionId: q.id,
      answerRequestId: request.id,
      amount: def.price,
      at: minutesAfter(closedAt, 25),
      ref: `seed-tx-${paymentRefCounter++}`,
    });

    await seedMutualReview({
      requestId: request.id,
      questionerId: questioner.id,
      responderId: responder.id,
      questionerStars: def.questionerStars,
      questionerComment: def.questionerComment,
      responderStars: def.responderStars,
      responderComment: def.responderComment,
      at: minutesAfter(closedAt, 90),
    });

    await backdateRequestMessages({ answerRequestId: request.id, startAt: minutesAfter(askedAt, 120), stepMinutes: 45 });
    if (extraRequestId) {
      await backdateRequestMessages({ answerRequestId: extraRequestId, startAt: minutesAfter(askedAt, 180), stepMinutes: 30 });
    }
    console.log(`  ANSWERED: @${responder.username} answered "${def.title}" (${def.closedDaysAgo}d ago)`);
  }

  console.log(`${opts.label}: questions closed without an answer…`);
  for (const def of content.closedOther) {
    const questioner = user(def.questioner);
    const closedAt = daysAgo(def.closedDaysAgo);
    const askedAt = new Date(closedAt.getTime() - 2 * 86_400_000);
    const q = await createQuestion(def, questioner.id, categories, askedAt);
    await seedCloseQuestion({ questionId: q.id, reason: def.closeReason, at: closedAt });
    console.log(`  CLOSED (${def.closeReason}): ${def.title}`);
  }

  console.log(`${opts.label}: out-of-range question…`);
  for (const def of content.far) {
    const questioner = users[(content.fresh.length + 1) % users.length];
    await createQuestion(def, questioner.id, categories, hoursAgo(def.askedHoursAgo));
    console.log(`  FAR: ${def.title} (${def.place?.name})`);
  }

  return paymentRefCounter;
}

// ---------------------------------------------------------------------------
// Seed entry point
// ---------------------------------------------------------------------------
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

  console.log('\nCreating users…');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const users: SeedUser[] = [];

  for (const [i, def] of USER_DEFS.entries()) {
    const created = await prisma.user.create({
      data: {
        email: def.email,
        password: passwordHash,
        name: def.name,
        username: def.username,
        deviceType: i % 2 === 0 ? 'ios' : 'android',
        deviceToken: faker.string.uuid(),
        notificationsEnabled: true,
        locationSharingEnabled: true,
        isVerified: true,
        isAdmin: def.isAdmin ?? false,
        profileImageUrl: `https://i.pravatar.cc/150?u=${def.username}`,
        createdAt: daysAgo(45 - i * 2),
        location: {
          create: { longitude: def.lon, latitude: def.lat },
        },
      },
    });
    users.push({ id: created.id, email: created.email, name: def.name, username: def.username, city: def.city });
    console.log(`  ${def.email} (${def.name}, ${def.city})`);
  }

  console.log('\nCreating categories…');
  const categories: Record<string, { id: string; }> = {};
  for (const def of CATEGORY_DEFS) {
    categories[def.slug] = await prisma.category.create({ data: def });
  }

  console.log('\nCreating payment accounts (Stripe, USD, payouts enabled)…');
  for (const u of users) {
    await prisma.paymentAccount.create({
      data: {
        userId: u.id,
        provider: 'STRIPE',
        currency: 'USD',
        status: PaymentAccountStatus.ACTIVE,
        payoutsEnabled: true,
        connectedAccountId: `acct_seed_${u.id.slice(0, 8)}`,
      },
    });
  }

  const halifaxUsers = users.filter((u) => u.city === 'halifax');
  const abujaUsers = users.filter((u) => u.city === 'abuja');

  console.log('\n── Halifax, NS ──────────────────────────────');
  const nextRef = await seedCity({
    label: 'Halifax',
    content: HALIFAX,
    users: halifaxUsers,
    categories,
    paymentRefStart: 1,
  });

  console.log('\n── Abuja, Nigeria ───────────────────────────');
  await seedCity({
    label: 'Abuja',
    content: ABUJA,
    users: abujaUsers,
    categories,
    paymentRefStart: nextRef,
  });

  console.log('\nRefreshing location timestamps for nearby queries…');
  await prisma.$executeRaw`UPDATE locations SET "updatedAt" = NOW()`;

  console.log('Seeding market config defaults…');
  const marketConfigDefaults: Record<string, number> = {
    nearMeRadiusKm: 5,
    reviewRevealWindowDays: 14,
    platformFeePercent: 0,
    radiusAtExactAddressKm: 0.3,
    radiusWalkingKm: 1,
    radiusNeighbourhoodKm: 5,
    radiusCityKm: 25,
  };
  for (const [key, value] of Object.entries(marketConfigDefaults)) {
    await prisma.marketConfig.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log('Invalidating nearby-questions cache…');
  try {
    await invalidateNearbyQuestionsCache();
  } catch (err) {
    // Stale cache is harmless — entries expire on their own — and this can
    // only fail when the seed is run somewhere without a reachable Redis
    // (e.g. reseeding staging from a laptop). Never fail the seed over it.
    console.warn('  Cache invalidation skipped (Redis unreachable):', (err as Error).message);
  }

  console.log('\n✅ Seed complete! Every account logs in with password: password123\n');
  console.log('Halifax accounts:');
  for (const u of halifaxUsers) {
    console.log(`  ${u.email.padEnd(22)} ${u.name}${u.username === 'david_p' ? '  (admin)' : ''}`);
  }
  console.log('\nAbuja accounts:');
  for (const u of abujaUsers) {
    console.log(`  ${u.email.padEnd(22)} ${u.name}`);
  }
  console.log('\nWhat to explore:');
  console.log('  • Home feed is populated per city (near-me, fresh, and far questions).');
  console.log('  • Each city has pending, active-chat, declined, answered, and closed flows.');
  console.log('  • Every user has revealed reviews on both roles — open any profile.');
  console.log('  • Wallet shows real earned/spent rows from the answered questions.');
  console.log('  • The far questions (Lawrencetown Beach / the airport) show the');
  console.log('    out-of-range state on their detail pages.');
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    await redisClient.quit();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    await redisClient.quit();
    process.exit(1);
  });
