import { createHmac } from 'crypto';
import type { TurnCredentials } from './types.js';

const TTL_SECONDS = 3600;

export function generateTurnCredentials(userId: string): TurnCredentials {
  const turnUrl = process.env['TURN_SERVER_URL'] ?? '';
  const secret  = process.env['TURN_SECRET'] ?? '';

  const ttlTimestamp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const username = `${ttlTimestamp}:${userId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');

  return {
    urls: turnUrl ? [turnUrl] : [],
    username,
    credential,
    ttl: TTL_SECONDS,
  };
}
