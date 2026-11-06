import type { FastifyPluginAsync } from "fastify";
import type { WithId } from "mongodb";

import { getDb } from "../../db.js";
import {
  type Neighborhood,
  type Reading,
  type Site,
  fail,
  logarithmicStatistics,
  parseDate,
  parseId,
  requiredString,
  siteResponse,
} from "./shared.js";

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/analytics/heatmap", async (request) => {
    const query = request.query as Record<string, unknown>;
    const { from, to } = dateRange(query.from, query.to);
    const groupBy = query.groupBy ?? "none";
    if (groupBy !== "none" && groupBy !== "hourOfDay") {
      fail(400, "groupBy must be none or hourOfDay");
    }

    const database = await getDb();
    const neighborhoodFilter =
      query.city === undefined ? {} : { city: requiredString(query.city, "city") };
    const [neighborhoods, readings] = await Promise.all([
      database
        .collection<Neighborhood>("neighborhoods")
        .find(neighborhoodFilter)
        .sort({ city: 1, name: 1 })
        .toArray(),
      database
        .collection<Reading>("noise_readings")
        .find({
          recordedAt: { $gte: from, $lte: to },
          isFlagged: false,
          neighborhoodId: { $ne: null },
        })
        .toArray(),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      neighborhoods: neighborhoods.map((neighborhood) => {
        const matchingReadings = readings.filter((reading) =>
          reading.neighborhoodId?.equals(neighborhood._id),
        );
        const hourly =
          groupBy === "hourOfDay" ? createHourlyBreakdown(matchingReadings) : undefined;

        return Object.assign(
          {
            neighborhoodId: neighborhood._id.toHexString(),
            name: neighborhood.name,
            boundary: neighborhood.boundary,
          },
          logarithmicStatistics(matchingReadings),
          hourly ? { hourly } : {},
        );
      }),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/analytics/sensitive-sites/:id/exposure",
    async (request) => {
      const query = request.query as Record<string, unknown>;
      const { from, to } = dateRange(query.from, query.to);
      const database = await getDb();
      const site = await database
        .collection<Site>("sensitive_sites")
        .findOne({ _id: parseId(request.params.id) });

      if (!site) fail(404, "Sensitive site not found");
      const [longitude, latitude] = site.location.coordinates;
      const readings = await database
        .collection<Reading>("noise_readings")
        .find({
          recordedAt: { $gte: from, $lte: to },
          isFlagged: false,
          location: {
            $geoWithin: {
              $centerSphere: [
                [longitude, latitude],
                site.protectionRadiusMeters / 6_371_000,
              ],
            },
          },
        })
        .toArray();

      return {
        site: siteResponse(site),
        from: from.toISOString(),
        to: to.toISOString(),
        ...logarithmicStatistics(readings),
      };
    },
  );
};

function dateRange(fromValue: unknown, toValue: unknown) {
  const from = parseDate(fromValue, "from");
  const to = parseDate(toValue, "to");
  if (from > to) fail(400, "from must be earlier than or equal to to");
  return { from, to };
}

function createHourlyBreakdown(readings: WithId<Reading>[]) {
  const groups = new Map<number, WithId<Reading>[]>();
  for (const reading of readings) {
    const hour = reading.recordedAt.getUTCHours();
    const group = groups.get(hour) ?? [];
    group.push(reading);
    groups.set(hour, group);
  }

  return [...groups.entries()]
    .sort(([hourA], [hourB]) => hourA - hourB)
    .map(([hour, group]) => Object.assign({ hour }, logarithmicStatistics(group)));
}
