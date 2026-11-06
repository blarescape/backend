import type { FastifyPluginAsync } from 'fastify';
import { getDb } from '../../db.js';
import {
  type Contributor,
  type Reading,
  asObject,
  contributorResponse,
  fail,
  optionalString,
  parseId,
  requiredString,
} from './shared.js';

export const contributorRoutes: FastifyPluginAsync = async (app) => {
  app.post('/contributors', async (request, reply) => {
    const body = asObject(request.body);
    const anonymousDeviceId = requiredString(body.anonymousDeviceId, 'anonymousDeviceId');
    const displayName = optionalString(body.displayName, 'displayName');
    const contributors = (await getDb()).collection<Contributor>('contributors');

    if (await contributors.findOne({ anonymousDeviceId })) {
      fail(409, 'anonymousDeviceId is already registered');
    }

    const contributor = {
      anonymousDeviceId,
      ...(displayName ? { displayName } : {}),
      readingsCount: 0,
      createdAt: new Date(),
    };
    const { insertedId } = await contributors.insertOne(contributor);

    reply.code(201).send(contributorResponse({ ...contributor, _id: insertedId }));
  });

  app.get<{ Params: { id: string } }>('/contributors/:id', async (request) => {
    const contributor = await (await getDb())
      .collection<Contributor>('contributors')
      .findOne({ _id: parseId(request.params.id) });

    if (!contributor) fail(404, 'Contributor not found');
    return contributorResponse(contributor);
  });

  app.patch<{ Params: { id: string } }>('/contributors/:id', async (request) => {
    const body = asObject(request.body);
    if (!('displayName' in body)) fail(400, 'PATCH must include displayName');

    const displayName = body.displayName === null
      ? null
      : requiredString(body.displayName, 'displayName');
    const update = displayName === null
      ? { $unset: { displayName: '' } }
      : { $set: { displayName } };
    const contributor = await (await getDb())
      .collection<Contributor>('contributors')
      .findOneAndUpdate(
        { _id: parseId(request.params.id) },
        update,
        { returnDocument: 'after' },
      );

    if (!contributor) fail(404, 'Contributor not found');
    return contributorResponse(contributor);
  });

  app.delete<{ Params: { id: string } }>(
    '/contributors/:id',
    async (request, reply) => {
      const database = await getDb();
      const id = parseId(request.params.id);
      const hasReadings = await database
        .collection<Reading>('noise_readings')
        .findOne({ contributorId: id });

      if (hasReadings) fail(409, 'Contributor has readings and cannot be deleted');

      const result = await database
        .collection<Contributor>('contributors')
        .deleteOne({ _id: id });
      if (!result.deletedCount) fail(404, 'Contributor not found');

      reply.code(204).send();
    },
  );
};
