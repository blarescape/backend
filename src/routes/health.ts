import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => ({ name: 'blarescape-backend' }));

  app.get('/health', async () => ({ status: 'ok' }));
};
