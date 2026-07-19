import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';
import prisma from '../../src/core/database/prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  token: string;
};

/**
 * Creates a User row + a signed JWT. Accepts overrides for any field
 * (e.g. `isAdmin: true`, `locationSharingEnabled: false`).
 */
export const createAuthUser = async (overrides: Partial<{
  email: string;
  username: string;
  name: string;
  password: string;
  deviceType: string;
  deviceToken: string;
  notificationsEnabled: boolean;
  locationSharingEnabled: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  profileImageUrl: string | null;
  location: { latitude: number; longitude: number } | null;
}> = {}): Promise<AuthUser> => {
  const password = overrides.password ?? 'password123';
  const passwordHash = await bcrypt.hash(password, 10);
  const username =
    overrides.username ?? faker.internet.userName().replace(/[^a-zA-Z0-9_]/g, '_');
  const email = overrides.email ?? faker.internet.email();

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      name: overrides.name ?? faker.person.fullName(),
      username,
      deviceType: overrides.deviceType ?? 'ios',
      deviceToken: overrides.deviceToken ?? faker.string.uuid(),
      notificationsEnabled: overrides.notificationsEnabled ?? true,
      locationSharingEnabled: overrides.locationSharingEnabled ?? true,
      isVerified: overrides.isVerified ?? true,
      isAdmin: overrides.isAdmin ?? false,
      profileImageUrl: overrides.profileImageUrl ?? null,
      location: overrides.location
        ? { create: { latitude: overrides.location.latitude, longitude: overrides.location.longitude } }
        : undefined,
    },
  });

  const token = jwt.sign({ userId: user.id }, JWT_SECRET);
  return { id: user.id, email: user.email, username: user.username, token };
};

/** Returns an `Authorization: Bearer <token>` header value. */
export const authHeader = (token: string) => `Bearer ${token}`;

/**
 * Generates an unused but valid JWT for a userId that has no DB row.
 * Useful for asserting 401/404 behaviour without persisting a user.
 */
export const signTokenFor = (userId: string) => jwt.sign({ userId }, JWT_SECRET);
