import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/build-app.js';
import { adminHeaders, startTestDb, stopTestDb } from './helpers/test-db.js';

const polygon = (minX: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [minX, 0],
      [minX + 1, 0],
      [minX + 1, 1],
      [minX, 1],
      [minX, 0],
    ],
  ],
});

describe('analytics routes', () => {
  let app: FastifyInstance;
  let siteId: string;

  beforeAll(async () => {
    await startTestDb();
    app = await buildApp();

    for (const [name, slug, city, minX] of [
      ['Alpha', 'alpha', 'Testville', 0],
      ['Beta', 'beta', 'Otherville', 2],
    ] as const) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/neighborhoods',
        headers: adminHeaders,
        payload: { name, slug, city, boundary: polygon(minX) },
      });
    }

    const contributor = await app.inject({
      method: 'POST',
      url: '/api/v1/contributors',
      payload: { anonymousDeviceId: 'device-analytics' },
    });
    const contributorId = contributor.json().id;

    const postReading = (decibelLevel: number, recordedAt: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/metrics/noise',
        payload: { contributorId, longitude: 0.5, latitude: 0.5, decibelLevel, recordedAt },
      });

    await postReading(60, '2026-11-01T14:05:00Z');
    await postReading(70, '2026-11-01T14:59:00Z');
    await postReading(55, '2026-11-01T15:10:00Z');

    const flagged = await postReading(90, '2026-11-01T16:00:00Z');
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/metrics/noise/${flagged.json().id}`,
      headers: adminHeaders,
      payload: { isFlagged: true },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/metrics/noise',
      payload: {
        contributorId,
        longitude: 2.5,
        latitude: 0.5,
        decibelLevel: 62,
        recordedAt: '2026-11-01T14:30:00Z',
      },
    });

    const site = await app.inject({
      method: 'POST',
      url: '/api/v1/sensitive-sites',
      headers: adminHeaders,
      payload: {
        name: 'Alpha School',
        siteType: 'school',
        longitude: 0.5,
        latitude: 0.5,
        protectionRadiusMeters: 500,
      },
    });
    siteId = site.json().id;
  });

  afterAll(async () => {
    await app.close();
    await stopTestDb();
  });

  const fullDay = 'from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z';

  function heatmapEntry(query: string) {
    return app.inject({ method: 'GET', url: `/api/v1/analytics/heatmap?${query}` });
  }

  interface HeatmapNeighborhood {
    name: string;
    averageDecibelLevel: number | null;
    maxDecibelLevel: number | null;
    readingsCount: number;
    hourly?: Array<{
      hour: number;
      averageDecibelLevel: number;
      maxDecibelLevel: number;
      readingsCount: number;
    }>;
  }

  function heatmapBody(res: { json: () => unknown }) {
    return res.json() as { neighborhoods: HeatmapNeighborhood[] };
  }

  function findNeighborhood(name: string, res: { json: () => unknown }) {
    const found = heatmapBody(res).neighborhoods.find((entry) => entry.name === name);
    expect(found).toBeDefined();
    return found as HeatmapNeighborhood;
  }

  describe('GET /api/v1/analytics/heatmap', () => {
    it('averages decibel levels logarithmically (60 and 70 dB become ~67.4)', async () => {
      const res = await heatmapEntry(
        'from=2026-11-01T14:00:00Z&to=2026-11-01T15:00:00Z&city=Testville',
      );
      expect(res.statusCode).toBe(200);
      const alpha = findNeighborhood('Alpha', res);
      expect(alpha.averageDecibelLevel).toBeCloseTo(67.4, 2);
      expect(alpha.maxDecibelLevel).toBe(70);
      expect(alpha.readingsCount).toBe(2);
    });

    it('lists every neighborhood, including those without readings', async () => {
      const res = await heatmapEntry(fullDay);
      expect(heatmapBody(res).neighborhoods).toHaveLength(2);

      const alpha = findNeighborhood('Alpha', res);
      expect(alpha.readingsCount).toBe(3);
      expect(alpha.averageDecibelLevel).toBeCloseTo(65.77, 1);
      expect(alpha.maxDecibelLevel).toBe(70);

      const beta = findNeighborhood('Beta', res);
      expect(beta.readingsCount).toBe(1);
      expect(beta.averageDecibelLevel).toBe(62);
      expect(beta.maxDecibelLevel).toBe(62);
    });

    it('filters neighborhoods by city', async () => {
      const res = await heatmapEntry(`${fullDay}&city=Otherville`);
      expect(heatmapBody(res).neighborhoods).toHaveLength(1);
      expect(findNeighborhood('Beta', res).name).toBe('Beta');
    });

    it('excludes flagged readings', async () => {
      const res = await heatmapEntry('from=2026-11-01T16:00:00Z&to=2026-11-01T17:00:00Z');
      const alpha = findNeighborhood('Alpha', res);
      expect(alpha.readingsCount).toBe(0);
      expect(alpha.averageDecibelLevel).toBe(null);
      expect(alpha.maxDecibelLevel).toBe(null);
    });

    it('groups by UTC hour of day on request', async () => {
      const res = await heatmapEntry(`${fullDay}&groupBy=hourOfDay`);
      const alpha = findNeighborhood('Alpha', res);
      expect(alpha.hourly).toEqual([
        { hour: 14, averageDecibelLevel: 67.4, maxDecibelLevel: 70, readingsCount: 2 },
        { hour: 15, averageDecibelLevel: 55, maxDecibelLevel: 55, readingsCount: 1 },
      ]);
    });

    it('rejects a reversed range and an unknown groupBy', async () => {
      const reversed = await heatmapEntry('from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z');
      expect(reversed.statusCode).toBe(400);

      const grouped = await heatmapEntry(`${fullDay}&groupBy=dayOfWeek`);
      expect(grouped.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/analytics/sensitive-sites/:id/exposure', () => {
    it('averages exposure logarithmically within the protection radius', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/sensitive-sites/${siteId}/exposure?from=2026-11-01T14:00:00Z&to=2026-11-01T15:00:00Z`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.site.name).toBe('Alpha School');
      expect(body.averageDecibelLevel).toBeCloseTo(67.4, 2);
      expect(body.maxDecibelLevel).toBe(70);
      expect(body.readingsCount).toBe(2);
    });

    it('excludes flagged readings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/sensitive-sites/${siteId}/exposure?from=2026-11-01T16:00:00Z&to=2026-11-01T17:00:00Z`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().readingsCount).toBe(0);
      expect(res.json().averageDecibelLevel).toBe(null);
    });

    it('returns 404 for an unknown site', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/sensitive-sites/aaaaaaaaaaaaaaaaaaaaaaaa/exposure',
        query: { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects a reversed range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/analytics/sensitive-sites/${siteId}/exposure?from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z`,
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
