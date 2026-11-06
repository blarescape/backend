import type { FastifyPluginAsync } from "fastify";

import { analyticsRoutes } from "./api/analytics.js";
import { contributorRoutes } from "./api/contributors.js";
import { neighborhoodRoutes } from "./api/neighborhoods.js";
import { noiseRoutes } from "./api/noise.js";
import { setApiErrorHandler } from "./api/shared.js";
import { siteRoutes } from "./api/sites.js";

export const apiRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler(setApiErrorHandler);

  await app.register(noiseRoutes);
  await app.register(contributorRoutes);
  await app.register(neighborhoodRoutes);
  await app.register(siteRoutes);
  await app.register(analyticsRoutes);
};
