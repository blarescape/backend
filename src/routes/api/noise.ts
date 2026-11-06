import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '../../db.js';
import {
  type Contributor,
  type Neighborhood,
  type Reading,
  asObject,
  fail,
  noiseSources,
  paginated,
  pagination,
  parseDate,
  parseId,
  parsePoint,
  readingResponse,
  requireAdmin,
  numberInRange,
  requiredString,
} from './shared.js';

export const noiseRoutes: FastifyPluginAsync = async (app) => {
  app.post('/metrics/noise', async (request, reply) => {
    const body = asObject(request.body);
    const contributorId = parseId(requiredString(body.contributorId, 'contributorId'));
    const location = parsePoint(body.longitude, body.latitude);
    const decibelLevel = numberInRange(body.decibelLevel, 'decibelLevel', 0, 140);
    const recordedAt = parseDate(body.recordedAt, 'recordedAt');

    if (recordedAt.getTime() > Date.now() + 30_000) {
      fail(400, 'recordedAt cannot be in the future');
    }
    if (body.noiseSource !== undefined && !isNoiseSource(body.noiseSource)) {
      fail(400, `noiseSource must be one of ${noiseSources.join(', ')}`);
    }
    if (
      body.measurementDurationSeconds !== undefined &&
      (!Number.isInteger(body.measurementDurationSeconds) ||
        Number(body.measurementDurationSeconds) <= 0)
    ) {
      fail(400, 'measurementDurationSeconds must be a positive integer');
    }

    const database = await getDb();
    const contributors = database.collection<Contributor>('contributors');
    if (!await contributors.findOne({ _id: contributorId })) {
      fail(422, 'contributorId does not reference an existing contributor');
    }

    const neighborhood = await database
      .collection<Neighborhood>('neighborhoods')
      .findOne({
        boundary: {
          $geoIntersects: {
            $geometry: { type: 'Point', coordinates: location.coordinates },
          },
        },
      });

    const reading = {
      contributorId,
      neighborhoodId: neighborhood?._id ?? null,
      location,
      decibelLevel,
      recordedAt,
      receivedAt: new Date(),
      ...(body.noiseSource ? { noiseSource: body.noiseSource } : {}),
      ...(body.measurementDurationSeconds === undefined
        ? {}
        : { measurementDurationSeconds: Number(body.measurementDurationSeconds) }),
      isFlagged: false,
    };

    const result = await database.collection<Reading>('noise_readings').insertOne(reading);
    await contributors.updateOne({ _id: contributorId }, { $inc: { readingsCount: 1 } });

    reply.code(201).send(readingResponse({ ...reading, _id: result.insertedId }));
  });

  app.get('/metrics/noise', async (request) => {
    const query = request.query as Record<string, unknown>;
    const { limit, offset } = pagination(query);
    const filter: Record<string, unknown> = {};

    for (const field of ['neighborhoodId', 'contributorId'] as const) {
      if (query[field] !== undefined) filter[field] = parseId(String(query[field]));
    }

    const dateRange = createDateRange(query.from, query.to);
    if (dateRange) filter.recordedAt = dateRange;

    if (
      query.includeFlagged !== undefined &&
      query.includeFlagged !== 'true' &&
      query.includeFlagged !== 'false'
    ) {
      fail(400, 'includeFlagged must be true or false');
    }

    if (query.includeFlagged === 'true') requireAdmin(request);
    else filter.isFlagged = false;

    const readings = (await getDb()).collection<Reading>('noise_readings');
    const total = await readings.countDocuments(filter);
    const results = await readings
      .find(filter)
      .sort({ recordedAt: -1, _id: 1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return paginated(results.map(readingResponse), total, limit, offset);
  });

  app.get<{ Params: { id: string } }>('/metrics/noise/:id', async (request) => {
    const reading = await (await getDb())
      .collection<Reading>('noise_readings')
      .findOne({ _id: parseId(request.params.id) });

    if (!reading) fail(404, 'Noise reading not found');
    return readingResponse(reading);
  });

  app.patch<{ Params: { id: string } }>(
    '/metrics/noise/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const body = asObject(request.body);
      const changes: Record<string, unknown> = {};

      if ('isFlagged' in body) {
        if (typeof body.isFlagged !== 'boolean') fail(400, 'isFlagged must be boolean');
        changes.isFlagged = body.isFlagged;
      }
      if ('noiseSource' in body) {
        if (body.noiseSource !== null && !isNoiseSource(body.noiseSource)) {
          fail(400, `noiseSource must be null or one of ${noiseSources.join(', ')}`);
        }
        changes.noiseSource = body.noiseSource;
      }
      if (Object.keys(changes).length === 0) {
        fail(400, 'PATCH must include isFlagged or noiseSource');
      }

      const updated = await (await getDb())
        .collection<Reading>('noise_readings')
        .findOneAndUpdate(
          { _id: parseId(request.params.id) },
          { $set: changes },
          { returnDocument: 'after' },
        );

      if (!updated) fail(404, 'Noise reading not found');
      return readingResponse(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/metrics/noise/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const database = await getDb();
      const deleted = await database
        .collection<Reading>('noise_readings')
        .findOneAndDelete({ _id: parseId(request.params.id) });

      if (!deleted) fail(404, 'Noise reading not found');
      await database
        .collection<Contributor>('contributors')
        .updateOne({ _id: deleted.contributorId }, { $inc: { readingsCount: -1 } });
      reply.code(204).send();
    },
  );
};

function isNoiseSource(value: unknown): value is typeof noiseSources[number] {
  return typeof value === 'string' && noiseSources.includes(value as typeof noiseSources[number]);
}

function createDateRange(from: unknown, to: unknown): Record<string, Date> | undefined {
  if (from === undefined && to === undefined) return undefined;

  const range: Record<string, Date> = {};
  if (from !== undefined) range.$gte = parseDate(from, 'from');
  if (to !== undefined) range.$lte = parseDate(to, 'to');
  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    fail(400, 'from must be earlier than or equal to to');
  }
  return range;
}
