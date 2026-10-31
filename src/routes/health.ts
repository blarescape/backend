import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_request, reply) => reply.type('text/plain').send('Hello World!'));

  app.get('/health', async () => ({ status: 'ok' }));
};
