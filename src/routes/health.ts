import type { FastifyPluginAsync } from "fastify";

import { getDb } from "../db.js";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => ({ name: "blarescape-backend" }));

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    const ready = await isDbReady();
    reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "unavailable",
    });
  });
};

async function isDbReady(): Promise<boolean> {
  try {
    await (await getDb()).command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
