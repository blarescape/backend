import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/build-app.js';
import { adminHeaders, startTestDb, stopTestDb } from './helpers/test-db.js';

const alphaBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

describe('noise reading routes', () => {
  let app: FastifyInstance;
  let alphaId: string;
  let contributorId: string;

  beforeAll(async () => {
    await startTestDb();
    app = await buildApp();

    const alpha = await app.inject({
      method: 'POST',
      url: '/api/v1/neighborhoods',
      headers: adminHeaders,
      payload: {
        name: 'Alpha',
        slug: 'alpha',
        city: 'Testville',
        boundary: alphaBoundary,
      },
    });
    alphaId = alpha.json().id;

    const contributor = await app.inject({
      method: 'POST',
      url: '/api/v1/contributors',
      payload: { anonymousDeviceId: 'device-1' },
    });
    contributorId = contributor.json().id;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  async function postReading(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/metrics/noise',
      payload: {
        contributorId,
        longitude: 0.5,
        latitude: 0.5,
        decibelLevel: 70,
        recordedAt: '2026-11-01T10:00:00Z',
        ...overrides,
      },
    });
  }

  async function contributorCount() {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/contributors/${contributorId}`,
    });
    return res.json().readingsCount as number;
  }

  describe('POST /api/v1/metrics/noise', () => {
    it('creates a reading, resolves its neighborhood and counts it', async () => {
      const before = await contributorCount();
      const res = await postReading();
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.neighborhoodId).toBe(alphaId);
      expect(body.isFlagged).toBe(false);
      expect(body.decibelLevel).toBe(70);
      expect(body.id).toMatch(/^[a-f\d]{24}$/);
      expect(await contributorCount()).toBe(before + 1);
    });

    it('accepts a reading outside every neighborhood', async () => {
      const res = await postReading({ longitude: 1.5 });
      expect(res.statusCode).toBe(201);
      expect(res.json().neighborhoodId).toBe(null);
    });

    it('accepts the boundary values of the numeric ranges', async () => {
      const low = await postReading({ decibelLevel: 0, longitude: -180, latitude: -90 });
      const high = await postReading({
        decibelLevel: 140,
        longitude: 180,
        latitude: 90,
      });
      expect(low.statusCode).toBe(201);
      expect(high.statusCode).toBe(201);
    });

    it('rejects a decibelLevel above 140', async () => {
      expect((await postReading({ decibelLevel: 140.1 })).statusCode).toBe(400);
    });

    it('rejects a future recordedAt', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect((await postReading({ recordedAt: future })).statusCode).toBe(400);
    });

    it('rejects an unknown noiseSource', async () => {
      expect((await postReading({ noiseSource: 'disco' })).statusCode).toBe(400);
    });

    it('rejects a measurementDurationSeconds of zero', async () => {
      expect((await postReading({ measurementDurationSeconds: 0 })).statusCode).toBe(400);
    });

    it('rejects a recordedAt without timezone information', async () => {
      expect((await postReading({ recordedAt: '2026-11-01T10:00:00' })).statusCode).toBe(400);
    });

    it('rejects an unknown contributor with 422', async () => {
      const res = await postReading({ contributorId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
      expect(res.statusCode).toBe(422);
    });

    it('rejects a malformed contributor id with 400', async () => {
      const res = await postReading({ contributorId: 'not-an-object-id' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/metrics/noise', () => {
    it('returns the paginated envelope with defaults', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/metrics/noise' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
      expect(body.total).toBeGreaterThan(0);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('rejects a limit above 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/metrics/noise?limit=201' });
      expect(res.statusCode).toBe(400);
    });

    it('filters by neighborhoodId', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/metrics/noise?neighborhoodId=${alphaId}`,
      });
      const body = res.json();
      expect(body.total).toBeGreaterThan(0);
      expect(
        body.items.every((item: { neighborhoodId: string }) => item.neighborhoodId === alphaId),
      ).toBe(true);
    });

    it('filters by from/to with inclusive boundaries', async () => {
      const hit = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics/noise?from=2026-11-01T10:00:00Z&to=2026-11-01T10:00:00Z',
      });
      expect(hit.json().total).toBeGreaterThan(0);

      const miss = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics/noise?from=2020-01-01T00:00:00Z&to=2020-01-01T00:00:00Z',
      });
      expect(miss.json().total).toBe(0);
    });

    it('excludes flagged readings by default and admits them for an admin', async () => {
      const created = await postReading({ recordedAt: '2026-11-01T11:00:00Z' });
      const id = created.json().id;
      const flagged = await app.inject({
        method: 'PATCH',
        url: `/api/v1/metrics/noise/${id}`,
        headers: adminHeaders,
        payload: { isFlagged: true },
      });
      expect(flagged.statusCode).toBe(200);

      const window = '?from=2026-11-01T11:00:00Z&to=2026-11-01T11:00:00Z';
      const unauthenticated = await app.inject({
        method: 'GET',
        url: `/api/v1/metrics/noise${window}&includeFlagged=true`,
      });
      expect(unauthenticated.statusCode).toBe(401);

      const asUser = await app.inject({ method: 'GET', url: `/api/v1/metrics/noise${window}` });
      expect(asUser.json().total).toBe(0);

      const asAdmin = await app.inject({
        method: 'GET',
        url: `/api/v1/metrics/noise${window}&includeFlagged=true`,
        headers: adminHeaders,
      });
      expect(asAdmin.json().total).toBe(1);
    });
  });

  describe('GET /api/v1/metrics/noise/:id', () => {
    it('round-trips a created reading', async () => {
      const created = await postReading({ decibelLevel: 42 });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/metrics/noise/${created.json().id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().decibelLevel).toBe(42);
    });

    it('returns 404 for a valid but unknown id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics/noise/aaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 for a malformed id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/metrics/noise/not-an-object-id',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/v1/metrics/noise/:id', () => {
    it('requires the admin token', async () => {
      const created = await postReading();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/metrics/noise/${created.json().id}`,
        payload: { isFlagged: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it('flags a reading without touching other fields', async () => {
      const created = await postReading({ decibelLevel: 33 });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/metrics/noise/${created.json().id}`,
        headers: adminHeaders,
        payload: { isFlagged: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isFlagged).toBe(true);
      expect(res.json().decibelLevel).toBe(33);
    });

    it('rejects a non-boolean isFlagged', async () => {
      const created = await postReading();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/metrics/noise/${created.json().id}`,
        headers: adminHeaders,
        payload: { isFlagged: 'yes' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/metrics/noise/aaaaaaaaaaaaaaaaaaaaaaaa',
        headers: adminHeaders,
        payload: { isFlagged: true },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/metrics/noise/:id', () => {
    it('requires the admin token', async () => {
      const created = await postReading();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/metrics/noise/${created.json().id}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('deletes the reading, decrements the count and 404s on repeat', async () => {
      const fresh = await app.inject({
        method: 'POST',
        url: '/api/v1/contributors',
        payload: { anonymousDeviceId: 'device-delete' },
      });
      const freshId = fresh.json().id;
      const created = await postReading({ contributorId: freshId });
      const id = created.json().id;

      const before = await app.inject({ method: 'GET', url: `/api/v1/contributors/${freshId}` });
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/metrics/noise/${id}`, headers: adminHeaders });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');

      const after = await app.inject({ method: 'GET', url: `/api/v1/contributors/${freshId}` });
      expect(after.json().readingsCount).toBe(before.json().readingsCount - 1);

      const repeat = await app.inject({ method: 'DELETE', url: `/api/v1/metrics/noise/${id}`, headers: adminHeaders });
      expect(repeat.statusCode).toBe(404);
    });
  });

  describe('deletion guards', () => {
    it('refuses to delete a contributor that still has readings', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/contributors/${contributorId}`,
      });
      expect(res.statusCode).toBe(409);
      const stillThere = await app.inject({
        method: 'GET',
        url: `/api/v1/contributors/${contributorId}`,
      });
      expect(stillThere.statusCode).toBe(200);
    });

    it('refuses to delete a neighborhood referenced by a reading', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/neighborhoods/${alphaId}`,
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(409);
      const stillThere = await app.inject({
        method: 'GET',
        url: `/api/v1/neighborhoods/${alphaId}`,
      });
      expect(stillThere.statusCode).toBe(200);
    });

    it('allows deleting a contributor once their readings are deleted', async () => {
      const fresh = await app.inject({
        method: 'POST',
        url: '/api/v1/contributors',
        payload: { anonymousDeviceId: 'device-goes-quiet' },
      });
      const freshId = fresh.json().id;
      const created = await postReading({ contributorId: freshId });
      const id = created.json().id;

      const blocked = await app.inject({
        method: 'DELETE',
        url: `/api/v1/contributors/${freshId}`,
      });
      expect(blocked.statusCode).toBe(409);

      await app.inject({ method: 'DELETE', url: `/api/v1/metrics/noise/${id}`, headers: adminHeaders });
      const allowed = await app.inject({
        method: 'DELETE',
        url: `/api/v1/contributors/${freshId}`,
      });
      expect(allowed.statusCode).toBe(204);
    });
  });
});
