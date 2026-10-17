import { SignJWT, jwtVerify } from 'jose';

export interface TokenService {
  sign(userId: string): Promise<string>;
  /** Returns the user id, or null for an invalid/expired token. */
  verify(token: string): Promise<string | null>;
}

export function createTokenService(secret: string): TokenService {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (userId) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime('90d')
        .sign(key),
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        return payload.sub ?? null;
      } catch {
        return null;
      }
    },
  };
}
