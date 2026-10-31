# SoundScape API

![API status: in development](https://img.shields.io/badge/API-in%20development-yellow)

## Project Overview

Urban noise pollution can harm residents' well-being and make it harder for cities to identify areas that need attention. Residents experience this problem as persistent noise in the neighborhoods where they live, work, and rest. SoundScape is being built as a REST API for collecting neighborhood noise readings and giving residents and city planners data to understand and address exposure.

## Tech Stack & Prerequisites

- **Language and runtime:** TypeScript on Node.js 24.x
- **Web framework:** Fastify 5
- **Database:** MongoDB; the data model is documented in [the database schema](docs/api-and-db/database-schema.md).
- **Production dependencies:**
  - `fastify` (^5.12.7) — HTTP server and routing.
  - `@fastify/cors` (^11.3.1) — configurable cross-origin request handling.
- **Development dependencies:** `tsx` for running TypeScript, `typescript` for type checking, and `vitest` for tests.

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

   Open `http://localhost:3000/` to see the greeting. Run `npm start` to start without watch mode.

## API Reference Guide

The current server exposes these endpoints. The noise collection and analytics endpoints in the [API design document](docs/api-and-db/api-endpoints.md) are planned and are not implemented yet.

| HTTP Method | URL Path | Request body | Response | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | None | `200 text/plain` — `Hello World!` | Confirms the server is responding. |
| `GET` | `/health` | None | `200 application/json` — `{ "status": "ok" }` | Reports service health. |

### Error responses

Fastify returns its standard JSON error response for errors, for example:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Route GET:/missing not found"
}
```
