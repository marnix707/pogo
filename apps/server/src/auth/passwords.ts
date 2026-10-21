import { randomBytes, scrypt, timingSafeEqual, createHmac, randomInt } from 'node:crypto';

const KEY_LEN = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LEN, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "salt:hash" in hex; scrypt with a random salt per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A 6-digit one-time code. */
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Codes are stored as an HMAC so a database leak does not reveal live codes. */
export const hashCode = (secret: string, email: string, code: string) =>
  createHmac('sha256', secret).update(`${email}\n${code}`).digest('hex');
