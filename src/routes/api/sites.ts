import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '../../db.js';
import {
  type Neighborhood,
  type Site,
  asObject,
  fail,
  numberInRange,
  paginated,
  pagination,
  parseId,
  parsePoint,
  requireAdmin,
  requiredString,
  siteResponse,
  siteTypes,
} from './shared.js';

export const siteRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sensitive-sites', { preHandler: requireAdmin }, async (request, reply) => {
    const site = await parseSite(request.body, false);
    const { insertedId } = await (await getDb())
      .collection<Site>('sensitive_sites')
      .insertOne(site);

    reply.code(201).send(siteResponse({ ...site, _id: insertedId }));
  });

  app.get('/sensitive-sites', async (request) => {
    const query = request.query as Record<string, unknown>;
    const { limit, offset } = pagination(query);
    const filter: Record<string, unknown> = {};

    if (query.neighborhoodId !== undefined) {
      filter.neighborhoodId = parseId(String(query.neighborhoodId));
    }
    if (query.siteType !== undefined) {
      if (!isSiteType(query.siteType)) fail(400, 'Invalid siteType');
      filter.siteType = query.siteType;
    }

    const sites = (await getDb()).collection<Site>('sensitive_sites');
    const [total, results] = await Promise.all([
      sites.countDocuments(filter),
      sites
        .find(filter)
        .sort({ name: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);

    return paginated(results.map(siteResponse), total, limit, offset);
  });

  app.get<{ Params: { id: string } }>('/sensitive-sites/:id', async (request) => {
    const site = await (await getDb())
      .collection<Site>('sensitive_sites')
      .findOne({ _id: parseId(request.params.id) });

    if (!site) fail(404, 'Sensitive site not found');
    return siteResponse(site);
  });

  app.put<{ Params: { id: string } }>(
    '/sensitive-sites/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const replacement = await parseSite(request.body, true);
      const updated = await (await getDb())
        .collection<Site>('sensitive_sites')
        .findOneAndUpdate(
          { _id: parseId(request.params.id) },
          { $set: replacement },
          { returnDocument: 'after' },
        );

      if (!updated) fail(404, 'Sensitive site not found');
      return siteResponse(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/sensitive-sites/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const result = await (await getDb())
        .collection<Site>('sensitive_sites')
        .deleteOne({ _id: parseId(request.params.id) });

      if (!result.deletedCount) fail(404, 'Sensitive site not found');
      reply.code(204).send();
    },
  );
};

async function parseSite(value: unknown, isReplacement: boolean) {
  const body = asObject(value);
  const name = requiredString(body.name, 'name');
  if (!isSiteType(body.siteType)) {
    fail(400, `siteType must be one of ${siteTypes.join(', ')}`);
  }

  const location = parsePoint(body.longitude, body.latitude);
  const neighborhood = await findNeighborhood(location.coordinates);
  if (!neighborhood) fail(422, 'location is outside every neighborhood');

  const radius = body.protectionRadiusMeters === undefined && !isReplacement
    ? 200
    : numberInRange(body.protectionRadiusMeters, 'protectionRadiusMeters', 0, 100_000);

  return {
    name,
    siteType: body.siteType,
    location,
    neighborhoodId: neighborhood._id,
    protectionRadiusMeters: radius,
  };
}

async function findNeighborhood([longitude, latitude]: [number, number]) {
  return (await getDb()).collection<Neighborhood>('neighborhoods').findOne({
    boundary: {
      $geoIntersects: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
      },
    },
  });
}

function isSiteType(value: unknown): value is typeof siteTypes[number] {
  return typeof value === 'string' && siteTypes.includes(value as typeof siteTypes[number]);
}
