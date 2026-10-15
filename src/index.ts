import { buildApp } from './build-app.js';

// Vercel entrypoint (zero-config Fastify detection) and local dev server.
const app = await buildApp({ logger: true });

try {
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
