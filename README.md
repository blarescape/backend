# SoundScape API

![API status: developed](https://img.shields.io/badge/developed-green)

## Project Overview

Urban noise pollution can harm residents' well-being and make it harder for cities to identify areas that need attention. Residents experience this problem as persistent noise in the neighborhoods where they live, work, and rest. SoundScape is being built as a REST API for collecting neighborhood noise readings and giving residents and city planners data to understand and address exposure.

## Tech Stack & Prerequisites

- **Language and runtime:** TypeScript on Node.js 24.x
- **Web framework:** Fastify 5
- **Database:** MongoDB; the data model is documented in [the database schema](docs/api-and-db/database-schema.md).
- **Production dependencies:**
- `fastify` (^5.12.8) — HTTP server and routing.
- `@fastify/cors` (^11.4.1) — configurable cross-origin request handling.
- `mongodb` (^7.8.0) — official MongoDB driver.
- `@fastify/swagger` (^9.9.3) and `@fastify/swagger-ui` (^6.1.3) — OpenAPI specification and interactive `/docs` UI.
- **Development dependencies:** `tsx` for running TypeScript, `typescript` for type checking, `vitest` for tests, `oxlint` for linting, `oxfmt` for formatting, `pino-pretty` for pretty-printing logs, and `@types/node` for Node.js type definitions.

## Installation & Setup

1. **Clone** the repository and enter the project directory:

   ```bash
   git clone https://github.com/blarescape/backend.git
   cd backend
   ```

2. **Install** the project dependencies:

   ```bash
   npm install
   ```

3. **Configure** the local environment by copying the example file:

   ```bash
   cp .env.example .env
   ```

   Set `PORT` to choose the local port (defaults to `3000`) and `CORS_ORIGIN` to a comma-separated list of allowed origins. An empty `CORS_ORIGIN` disables CORS.

4. **Start** the development server:

   ```bash
   npm run dev
   ```
  Open `http://localhost:3000/` to see the greeting. Run `npm start` to start without watch mode (note: unlike `npm run dev`, `npm start` does not load `.env` automatically and expects environment variables to be set in the environment). You can also run `npm run typecheck`, `npm test` (or `npm run test:watch`), `npm run lint`, and `npm run format` during development.

## API Reference Guide

The `/` and `/health` service routes are available without a database; `/ready` reports MongoDB readiness and requires `MONGODB_URI`. The business API described in the [API design document](docs/api-and-db/api-endpoints.md) is implemented under `/api/v1` and requires a reachable MongoDB configured with `MONGODB_URI`. Set `MONGODB_DATABASE` to choose the database and `ADMIN_API_TOKEN` to enable admin routes and flagged-reading access. Admin requests use `Authorization: Bearer <token>`. See `.env.example` for local configuration.

Interactive API documentation is available at `/docs`; download the OpenAPI JSON from `/openapi.json`. The source specification is [docs/openapi.yaml](docs/openapi.yaml).

| HTTP Method | URL Path | Request body | Response | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | None | `200 application/json` — `{ "name": "blarescape-backend" }` | Confirms the server is responding. |
| `GET` | `/health` | None | `200 application/json` — `{ "status": "ok" }` | Reports service health. |
| `GET` | `/ready` | None | `200 application/json` — `{ "status": "ready" }`; `503 application/json` — `{ "status": "unavailable" }` | Reports database readiness. |

### Error responses

Fastify returns its standard JSON error response for errors, for example:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Route GET:/missing not found"
}
```
