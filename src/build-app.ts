import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';

// Kept separate from src/index.ts so tests can build the app without listening.
// Don't rename to app.ts/server.ts — Vercel treats those names as entrypoints.
export async function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  const corsOrigin = process.env.CORS_ORIGIN;
  await app.register(cors, {
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : false,
  });

  await app.register(healthRoutes);

  return app;
}
