import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { resolve } from 'node:path';
import { healthRoutes } from './routes/health.js';
import { apiRoutes } from './routes/api.js';
import { closeDb } from './db.js';

// Kept separate from src/index.ts so tests can build the app without listening.
// Don't rename to app.ts/server.ts — Vercel treats those names as entrypoints.
export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : false,
  });

  await app.register(swagger, {
    mode: 'static',
    specification: {
      path: resolve(process.cwd(), 'docs/openapi.yaml'),
      baseDir: resolve(process.cwd(), 'docs'),
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.get('/openapi.json', async () => app.swagger());
  await app.register(healthRoutes);
  await app.register(apiRoutes, { prefix: '/api/v1' });
  app.addHook('onClose', closeDb);

  return app;
}
