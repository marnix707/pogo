import type { FastifyInstance, FastifyRequest } from 'fastify';
import { containsProfanity, profileSchema } from '@pogo/shared';
import type { AuthResponse, PublicUser } from '@pogo/shared';
import type { TokenService } from '../auth/tokens';
import type { UserStore } from '../auth/userStore';

export async function authenticate(
  req: FastifyRequest,
  tokens: TokenService,
  users: UserStore,
): Promise<PublicUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const userId = await tokens.verify(header.slice(7));
  return userId ? users.get(userId) : null;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  users: UserStore,
  tokens: TokenService,
  guestLimitPerMin: number,
) {
  // Guest signup: pick a nickname + avatar, get a signed token to keep in localStorage.
  app.post(
    '/api/auth/guest',
    { config: { rateLimit: { max: guestLimitPerMin, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      }
      if (containsProfanity(parsed.data.nickname)) {
        return reply.code(400).send({ error: 'Please pick a different nickname' });
      }
      const user = await users.createGuest(parsed.data);
      const body: AuthResponse = { token: await tokens.sign(user.id), user };
      return reply.code(201).send(body);
    },
  );

  app.get('/api/me', async (req, reply) => {
    const user = await authenticate(req, tokens, users);
    if (!user) return reply.code(401).send({ error: 'Not signed in' });
    return { user };
  });

  app.patch('/api/me', async (req, reply) => {
    const user = await authenticate(req, tokens, users);
    if (!user) return reply.code(401).send({ error: 'Not signed in' });
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
    }
    if (containsProfanity(parsed.data.nickname)) {
      return reply.code(400).send({ error: 'Please pick a different nickname' });
    }
    const updated = await users.updateProfile(user.id, parsed.data);
    return { user: updated };
  });
}
