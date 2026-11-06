import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '../../db.js';
import {
  type Neighborhood,
  type Reading,
  type Site,
  asObject,
  fail,
  neighborhoodResponse,
  paginated,
  pagination,
  parseBoundary,
  parseId,
  requiredString,
  requireAdmin,
} from './shared.js';

export const neighborhoodRoutes: FastifyPluginAsync = async (app) => {
  app.post('/neighborhoods', { preHandler: requireAdmin }, async (request, reply) => {
    const neighborhood = parseNeighborhood(request.body);
    const neighborhoods = (await getDb()).collection<Neighborhood>('neighborhoods');

    if (await neighborhoods.findOne({ slug: neighborhood.slug })) {
      fail(409, 'slug already exists');
    }

    const { insertedId } = await neighborhoods.insertOne(neighborhood);
    reply.code(201).send(neighborhoodResponse({ ...neighborhood, _id: insertedId }));
  });

  app.get('/neighborhoods', async (request) => {
    const query = request.query as Record<string, unknown>;
    const { limit, offset } = pagination(query);
    const filter = query.city === undefined
      ? {}
      : { city: requiredString(query.city, 'city') };
    const neighborhoods = (await getDb()).collection<Neighborhood>('neighborhoods');
    const [total, results] = await Promise.all([
      neighborhoods.countDocuments(filter),
      neighborhoods
        .find(filter)
        .sort({ city: 1, name: 1, _id: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
    ]);

    return paginated(
      results.map((item) => neighborhoodResponse(item, false)),
      total,
      limit,
      offset,
    );
  });

  app.get<{ Params: { id: string } }>('/neighborhoods/:id', async (request) => {
    const neighborhood = await (await getDb())
      .collection<Neighborhood>('neighborhoods')
      .findOne({ _id: parseId(request.params.id) });

    if (!neighborhood) fail(404, 'Neighborhood not found');
    return neighborhoodResponse(neighborhood);
  });

  app.put<{ Params: { id: string } }>(
    '/neighborhoods/:id',
    { preHandler: requireAdmin },
    async (request) => {
      const replacement = parseNeighborhood(request.body);
      const neighborhoods = (await getDb()).collection<Neighborhood>('neighborhoods');
      const id = parseId(request.params.id);
      const slugInUse = await neighborhoods.findOne({
        slug: replacement.slug,
        _id: { $ne: id },
      });
      if (slugInUse) fail(409, 'slug already exists');

      const updated = await neighborhoods.findOneAndUpdate(
        { _id: id },
        { $set: replacement },
        { returnDocument: 'after' },
      );
      if (!updated) fail(404, 'Neighborhood not found');

      return neighborhoodResponse(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/neighborhoods/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const database = await getDb();
      const id = parseId(request.params.id);
      const [reading, site] = await Promise.all([
        database.collection<Reading>('noise_readings').findOne({ neighborhoodId: id }),
        database.collection<Site>('sensitive_sites').findOne({ neighborhoodId: id }),
      ]);
      if (reading || site) fail(409, 'Neighborhood is still referenced by readings or sites');

      const result = await database
        .collection<Neighborhood>('neighborhoods')
        .deleteOne({ _id: id });
      if (!result.deletedCount) fail(404, 'Neighborhood not found');

      reply.code(204).send();
    },
  );
};

function parseNeighborhood(value: unknown) {
  const body = asObject(value);
  return {
    name: requiredString(body.name, 'name'),
    slug: requiredString(body.slug, 'slug'),
    city: requiredString(body.city, 'city'),
    boundary: parseBoundary(body.boundary),
  };
}

