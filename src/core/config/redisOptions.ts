import type { RedisOptions } from 'ioredis';

/**
 * Single source of truth for Redis connection settings, shared by the
 * ioredis client and every Bull queue.
 *
 * REDIS_URL (redis:// or rediss://) wins when set — managed providers such
 * as Render Key Value hand out a single connection string. rediss:// means
 * TLS, which those providers require. Otherwise fall back to the plain
 * REDIS_HOST/REDIS_PORT pair used in local development.
 */
export function getRedisConnectionOptions(): RedisOptions {
  const url = process.env.REDIS_URL;

  if (url) {
    const parsed = new URL(url);
    const useTls = parsed.protocol === 'rediss:';

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(useTls ? { tls: {} } : {}),
    };
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };
}
