import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;
let connection: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri)
    throw Object.assign(new Error("MONGODB_URI is not configured"), {
      statusCode: 503,
    });
  if (!connection) {
    client = new MongoClient(uri);
    connection = client.connect().then(async (connected) => {
      const db = connected.db(process.env.MONGODB_DATABASE);
      await Promise.all([
        db
          .collection("contributors")
          .createIndexes([{ key: { anonymousDeviceId: 1 }, unique: true }]),
        db
          .collection("neighborhoods")
          .createIndexes([
            { key: { slug: 1 }, unique: true },
            { key: { boundary: "2dsphere" } },
          ]),
        db
          .collection("noise_readings")
          .createIndexes([
            { key: { location: "2dsphere" } },
            { key: { neighborhoodId: 1, recordedAt: 1 } },
            { key: { contributorId: 1, recordedAt: -1 } },
          ]),
        db
          .collection("sensitive_sites")
          .createIndexes([{ key: { location: "2dsphere" } }]),
      ]);
      return db;
    });
  }
  return connection;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  connection = undefined;
}
