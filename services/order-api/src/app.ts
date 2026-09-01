import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import type { DatabasePool } from './db/pool.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerVkCallbackRoute } from './routes/vk-callback.js';

export async function buildApp(config: AppConfig, pool: DatabasePool) {
  const app: FastifyInstance = Fastify({
    trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
    bodyLimit: 32 * 1024,
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers.set-cookie',
      ],
    },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    methods: ['GET', 'POST'],
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error('ORIGIN_NOT_ALLOWED'), false);
      }
    },
  });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
  });

  await registerHealthRoutes(app, pool);
  await registerOrderRoutes(app, pool, config);
  await registerVkCallbackRoute(app, pool, config);

  app.setErrorHandler((error, request, reply) => {
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage === 'ORIGIN_NOT_ALLOWED') {
      void reply.code(403).send({ code: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    request.log.error({ err: error }, 'unhandled_request_error');
    void reply.code(500).send({ code: 'INTERNAL_ERROR' });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ code: 'NOT_FOUND' });
  });

  return app;
}
