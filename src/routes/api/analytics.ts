import type { FastifyPluginAsync } from "fastify";
import type { Document, ObjectId } from "mongodb";

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
  statsFromTotals,
} from "./shared.js";

interface HeatmapGroup extends Document {
  _id: { neighborhoodId: ObjectId; hour: number };
  count: number;
  maxDecibelLevel: number;
  energy: number;
}

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
    const [neighborhoods, groups] = await Promise.all([
      database
        .collection<Neighborhood>("neighborhoods")
        .find(neighborhoodFilter)
        .sort({ city: 1, name: 1 })
        .toArray(),
      database
        .collection<Reading>("noise_readings")
        .aggregate<HeatmapGroup>([
          {
            $match: {
              recordedAt: { $gte: from, $lte: to },
              isFlagged: false,
              neighborhoodId: { $ne: null },
            },
          },
          {
            $group: {
              _id: {
                neighborhoodId: "$neighborhoodId",
                hour: { $hour: "$recordedAt" },
              },
              count: { $sum: 1 },
              maxDecibelLevel: { $max: "$decibelLevel" },
              energy: {
                $sum: { $pow: [10.0, { $divide: ["$decibelLevel", 10.0] }] },
              },
            },
          },
        ])
        .toArray(),
    ]);

    const hoursByNeighborhood = new Map<string, Map<number, HeatmapGroup>>();
    for (const group of groups) {
      const id = group._id.neighborhoodId.toHexString();
      const hours = hoursByNeighborhood.get(id) ?? new Map<number, HeatmapGroup>();
      hours.set(group._id.hour, group);
      hoursByNeighborhood.set(id, hours);
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      neighborhoods: neighborhoods.map((neighborhood) => {
        const hours = hoursByNeighborhood.get(neighborhood._id.toHexString());
        const hourGroups = hours
          ? [...hours.entries()]
              .sort(([hourA], [hourB]) => hourA - hourB)
              .map(([, group]) => group)
          : [];

        let count = 0;
        let energy = 0;
        let maxDecibelLevel = -Infinity;
        for (const group of hourGroups) {
          count += group.count;
          energy += group.energy;
          maxDecibelLevel = Math.max(maxDecibelLevel, group.maxDecibelLevel);
        }

        const hourly =
          groupBy === "hourOfDay"
            ? hourGroups.map((group) =>
                Object.assign(
                  { hour: group._id.hour },
                  statsFromTotals(group.count, group.maxDecibelLevel, group.energy),
                ),
              )
            : undefined;

        return Object.assign(
          {
            neighborhoodId: neighborhood._id.toHexString(),
            name: neighborhood.name,
            boundary: neighborhood.boundary,
          },
          statsFromTotals(count, maxDecibelLevel, energy),
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
