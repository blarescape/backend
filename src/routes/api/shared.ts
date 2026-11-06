import type { FastifyReply, FastifyRequest } from "fastify";
import { ObjectId, type Document, type WithId } from "mongodb";

export type Point = { type: "Point"; coordinates: [number, number] };
export type Ring = number[][];
export type Boundary =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

export interface Contributor extends Document {
  anonymousDeviceId: string;
  displayName?: string;
  readingsCount: number;
  createdAt: Date;
}

export interface Neighborhood extends Document {
  name: string;
  slug: string;
  city: string;
  boundary: Boundary;
}

export interface Site extends Document {
  neighborhoodId: ObjectId;
  name: string;
  siteType: string;
  location: Point;
  protectionRadiusMeters: number;
}

export interface Reading extends Document {
  contributorId: ObjectId;
  neighborhoodId: ObjectId | null;
  location: Point;
  decibelLevel: number;
  recordedAt: Date;
  receivedAt: Date;
  noiseSource?: string;
  measurementDurationSeconds?: number;
  isFlagged: boolean;
}

export const noiseSources = [
  "traffic",
  "construction",
  "nightlife",
  "industry",
  "aircraft",
  "other",
] as const;

export const siteTypes = ["school", "hospital", "kindergarten", "care_home"] as const;

export function fail(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function setApiErrorHandler(
  error: Error & { statusCode?: number; code?: number },
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error({ err: error }, "API request failed");
  const statusCode = error.code === 11000 ? 409 : Number(error.statusCode) || 500;
  const messages: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    503: "Service Unavailable",
  };

  reply.code(statusCode).send({
    statusCode,
    error: messages[statusCode] ?? "Internal Server Error",
    message:
      statusCode >= 500 && statusCode !== 503 ? "Internal Server Error" : error.message,
  });
}

export function asObject(value: unknown, label = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(400, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

export function queryString(value: unknown, field: string): string {
  if (typeof value !== "string") fail(400, `${field} must be a string`);
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, field);
}

export function numberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(400, `${field} must be a number between ${min} and ${max}`);
  }
  return value;
}

export function parseId(value: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    fail(400, "id must be a 24-character hexadecimal ObjectId");
  }
  return new ObjectId(value);
}

export function parseDate(value: unknown, field: string): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
  ) {
    fail(400, `${field} must be an ISO 8601 date with timezone`);
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(400, `${field} must be a valid date`);
  return date;
}

export function parsePoint(longitude: unknown, latitude: unknown): Point {
  return {
    type: "Point",
    coordinates: [
      numberInRange(longitude, "longitude", -180, 180),
      numberInRange(latitude, "latitude", -90, 90),
    ],
  };
}

export function parseBoundary(value: unknown): Boundary {
  const boundary = asObject(value, "boundary");
  if (boundary.type !== "Polygon" && boundary.type !== "MultiPolygon") {
    fail(400, "boundary.type must be Polygon or MultiPolygon");
  }
  if (!Array.isArray(boundary.coordinates)) {
    fail(400, "boundary.coordinates must be an array");
  }

  const polygons: unknown[] =
    boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  if (polygons.length === 0) fail(400, "boundary must contain at least one polygon");

  for (const polygon of polygons) validatePolygon(polygon);
  return boundary as unknown as Boundary;
}

function validatePolygon(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, "polygon must contain a ring");
  }

  for (const ring of value) {
    if (!Array.isArray(ring) || ring.length < 4) {
      fail(400, "GeoJSON rings need at least four positions");
    }

    for (const position of ring) {
      if (!Array.isArray(position) || position.length < 2) {
        fail(400, "boundary contains an invalid coordinate");
      }
      numberInRange(position[0], "longitude", -180, 180);
      numberInRange(position[1], "latitude", -90, 90);
    }

    const first = ring[0] as number[];
    const last = ring[ring.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      fail(400, "GeoJSON rings must be closed");
    }
  }
}

export function pagination(query: Record<string, unknown>) {
  return {
    limit: parseIntegerQuery(query.limit, "limit", 50, 200),
    offset: parseIntegerQuery(query.offset, "offset", 0),
  };
}

function parseIntegerQuery(
  value: unknown,
  field: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    fail(400, `${field} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (parsed > max) fail(400, `${field} must be between 0 and ${max}`);
  return parsed;
}

export function paginated<T>(items: T[], total: number, limit: number, offset: number) {
  return { items, total, limit, offset };
}

export function requireAdmin(request: FastifyRequest): void {
  const token = process.env.ADMIN_API_TOKEN;
  if (!token) fail(503, "ADMIN_API_TOKEN is not configured");
  if (request.headers.authorization !== `Bearer ${token}`) {
    fail(401, "A valid admin bearer token is required");
  }
}

export function contributorResponse(doc: WithId<Contributor>) {
  return {
    id: doc._id.toHexString(),
    anonymousDeviceId: doc.anonymousDeviceId,
    ...(doc.displayName ? { displayName: doc.displayName } : {}),
    readingsCount: doc.readingsCount,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function neighborhoodResponse(doc: WithId<Neighborhood>, includeBoundary = true) {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    city: doc.city,
    ...(includeBoundary ? { boundary: doc.boundary } : {}),
  };
}

export function siteResponse(doc: WithId<Site>) {
  return {
    id: doc._id.toHexString(),
    neighborhoodId: doc.neighborhoodId.toHexString(),
    name: doc.name,
    siteType: doc.siteType,
    longitude: doc.location.coordinates[0],
    latitude: doc.location.coordinates[1],
    protectionRadiusMeters: doc.protectionRadiusMeters,
  };
}

export function readingResponse(doc: WithId<Reading>) {
  return {
    id: doc._id.toHexString(),
    contributorId: doc.contributorId.toHexString(),
    neighborhoodId: doc.neighborhoodId?.toHexString() ?? null,
    longitude: doc.location.coordinates[0],
    latitude: doc.location.coordinates[1],
    decibelLevel: doc.decibelLevel,
    recordedAt: doc.recordedAt.toISOString(),
    receivedAt: doc.receivedAt.toISOString(),
    ...(doc.noiseSource ? { noiseSource: doc.noiseSource } : {}),
    ...(doc.measurementDurationSeconds === undefined
      ? {}
      : { measurementDurationSeconds: doc.measurementDurationSeconds }),
    isFlagged: doc.isFlagged,
  };
}

export function logarithmicStatistics(rows: WithId<Reading>[]) {
  if (rows.length === 0) {
    return {
      averageDecibelLevel: null,
      maxDecibelLevel: null,
      readingsCount: 0,
    };
  }

  const energyMean =
    rows.reduce((sum, row) => sum + 10 ** (row.decibelLevel / 10), 0) / rows.length;

  return {
    averageDecibelLevel: Number((10 * Math.log10(energyMean)).toFixed(2)),
    maxDecibelLevel: Math.max(...rows.map((row) => row.decibelLevel)),
    readingsCount: rows.length,
  };
}
