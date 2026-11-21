import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/build-app.js';
import { closeDb } from '../src/db.js';
import { startTestDb, stopTestDb } from './helpers/test-db.js';

describe('readiness route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    delete process.env.MONGODB_URI;
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  it('reports 503 when MONGODB_URI is not configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
  });

  it('reports 200 once a database is reachable', { timeout: 300_000 }, async () => {
    await startTestDb();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('recovers after a connection failure instead of caching the rejection', async () => {
    await closeDb();
    const configuredUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI =
      'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=100&connectTimeoutMS=100';

    const failed = await app.inject({ method: 'GET', url: '/ready' });
    expect(failed.statusCode).toBe(503);

    process.env.MONGODB_URI = configuredUri;
    const recovered = await app.inject({ method: 'GET', url: '/ready' });
    expect(recovered.statusCode).toBe(200);
  });
});
