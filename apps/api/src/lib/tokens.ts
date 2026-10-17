import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Role } from '@streeteats/shared';
import type { Config } from '../config';

const ISSUER = 'streeteats';
const AUDIENCE = 'streeteats-api';

export interface AuthUser {
  id: string;
  role: Role;
}

export function createTokenService(config: Config) {
  const key = new TextEncoder().encode(config.jwtSecret);

  return {
    async signAccess(user: AuthUser) {
      const expiresAt = new Date(Date.now() + config.accessTokenTtlMin * 60_000);
      const token = await new SignJWT({ role: user.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .sign(key);
      return { token, expiresAt };
    },

    async verifyAccess(token: string): Promise<AuthUser | null> {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;
        return { id: payload.sub, role: payload.role as Role };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

/** Opaque refresh token; only its SHA-256 is stored. */
export function newRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
