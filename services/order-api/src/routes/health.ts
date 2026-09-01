import type { FastifyInstance } from 'fastify';
import type { DatabasePool } from '../db/pool.js';

export async function registerHealthRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
