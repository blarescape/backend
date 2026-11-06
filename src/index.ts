import { buildApp } from './build-app.js';

// Vercel entrypoint (zero-config Fastify detection) and local dev server.
const app = await buildApp({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: process.stdout.isTTY === true && !process.env.CI && !process.env.NO_COLOR,
        translateTime: 'SYS:standard',
        singleLine: true,
      },
    },
  },
});

try {
  await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
