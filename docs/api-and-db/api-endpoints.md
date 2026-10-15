# SoundScape: API Endpoint Design

## 1. Conventions

- **Base URL:** `/api/v1`. All paths below are relative to it.
- **Format:** JSON request and response bodies (`Content-Type: application/json`).
- **IDs:** MongoDB `ObjectId` values, sent as 24-character hex strings.
- **Dates:** ISO 8601 strings in UTC, for example `2026-10-23T14:05:00Z`.
- **Coordinates:** `{ "longitude": 19.9449, "latitude": 50.0647 }` in requests. The server converts them to a GeoJSON Point.
- **Pagination:** list endpoints accept `limit` (default `50`, maximum `200`) and `offset` (default `0`) and return:

  ```json
  { "items": [], "total": 0, "limit": 50, "offset": 0 }
  ```

- **Errors:** Fastify's default error shape:

  ```json
  { "statusCode": 400, "error": "Bad Request", "message": "body/decibelLevel must be <= 140" }
  ```

- **Access:** endpoints marked *(admin)* are meant for city planners and moderators only. The authentication method is still an open question (see section 7).

## 2. Noise readings: `/metrics/noise`

| Method | Path | Request body / query | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/metrics/noise` | Body: see below | `201` created reading | `400` invalid body, `422` unknown `contributorId` |
| `GET` | `/metrics/noise` | Query: `neighborhoodId`, `contributorId`, `from`, `to`, `includeFlagged` (default `false`), `limit`, `offset` | `200` paginated list | `400` invalid query |
| `GET` | `/metrics/noise/{id}` | none | `200` reading | `404` not found |
| `PATCH` | `/metrics/noise/{id}` *(admin)* | `{ "isFlagged": true, "noiseSource": "construction" }` (any subset) | `200` updated reading | `400`, `404` |
| `DELETE` | `/metrics/noise/{id}` *(admin)* | none | `204` | `404` |

There is no `PUT` for readings on purpose: a measurement must not be rewritten after upload. Moderators can only flag it, correct its source category, or delete it.

`POST /metrics/noise` request body:

```json
{
  "contributorId": "6718f1e0c1e5b3a9d0f41a10",
  "longitude": 19.9449,
  "latitude": 50.0647,
  "decibelLevel": 72.4,
  "recordedAt": "2026-10-23T14:05:00Z",
  "noiseSource": "traffic",
  "measurementDurationSeconds": 30
}
```

| Field | Rule |
| :--- | :--- |
| `contributorId` | Required. Must reference an existing contributor. |
| `longitude` | Required. Number from `-180` to `180`. |
| `latitude` | Required. Number from `-90` to `90`. |
| `decibelLevel` | Required. Number from `0` to `140`. |
| `recordedAt` | Required. Must not be in the future (with a small tolerance for clock drift). |
| `noiseSource` | Optional. One of `traffic`, `construction`, `nightlife`, `industry`, `aircraft`, `other`. |
| `measurementDurationSeconds` | Optional. Positive integer. |

`201` response:

```json
{
  "id": "6718f2a4c1e5b3a9d0f41a27",
  "contributorId": "6718f1e0c1e5b3a9d0f41a10",
  "neighborhoodId": "6718f0b2c1e5b3a9d0f41a01",
  "longitude": 19.9449,
  "latitude": 50.0647,
  "decibelLevel": 72.4,
  "recordedAt": "2026-10-23T14:05:00Z",
  "receivedAt": "2026-10-23T14:05:02Z",
  "noiseSource": "traffic",
  "measurementDurationSeconds": 30,
  "isFlagged": false
}
```

## 3. Contributors: `/contributors`

| Method | Path | Request body / query | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/contributors` | `{ "anonymousDeviceId": "c3f1…", "displayName": "NightOwl" }` | `201` created contributor | `400`, `409` device already registered |
| `GET` | `/contributors/{id}` | none | `200` contributor with `readingsCount` | `404` |
| `PATCH` | `/contributors/{id}` | `{ "displayName": "QuietStreet" }` | `200` updated contributor | `400`, `404` |
| `DELETE` | `/contributors/{id}` | none | `204` | `404` |

The client app registers once with `POST /contributors`, stores the returned `id`, and sends it with every reading. There is no list endpoint, so contributors cannot be enumerated.

## 4. Neighborhoods: `/neighborhoods`

| Method | Path | Request body / query | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/neighborhoods` *(admin)* | `{ "name": "Stare Miasto", "slug": "stare-miasto", "city": "Kraków", "boundary": { "type": "Polygon", "coordinates": [[[19.93, 50.06], …]] } }` | `201` | `400` invalid GeoJSON, `409` duplicate `slug` |
| `GET` | `/neighborhoods` | Query: `city`, `limit`, `offset` | `200` paginated list (without `boundary`) | `400` |
| `GET` | `/neighborhoods/{id}` | none | `200` neighborhood with `boundary` | `404` |
| `PUT` | `/neighborhoods/{id}` *(admin)* | Full neighborhood object | `200` | `400`, `404`, `409` |
| `DELETE` | `/neighborhoods/{id}` *(admin)* | none | `204` | `404`, `409` readings or sites still reference it |

The list endpoint leaves out `boundary` because polygons are large. Clients fetch a single neighborhood or the heatmap when they need the shape.

## 5. Sensitive sites: `/sensitive-sites`

| Method | Path | Request body / query | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/sensitive-sites` *(admin)* | `{ "name": "Szpital Uniwersytecki", "siteType": "hospital", "longitude": 19.95, "latitude": 50.07, "protectionRadiusMeters": 300 }` | `201` (server resolves `neighborhoodId`) | `400`, `422` location outside every neighborhood |
| `GET` | `/sensitive-sites` | Query: `neighborhoodId`, `siteType`, `limit`, `offset` | `200` paginated list | `400` |
| `GET` | `/sensitive-sites/{id}` | none | `200` | `404` |
| `PUT` | `/sensitive-sites/{id}` *(admin)* | Full site object | `200` | `400`, `404`, `422` |
| `DELETE` | `/sensitive-sites/{id}` *(admin)* | none | `204` | `404` |

## 6. Analytics: `/analytics`

These endpoints are read-only. They aggregate unflagged readings and return averages as the equivalent continuous sound level (a logarithmic average).

| Method | Path | Query | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/analytics/heatmap` | `from` and `to` (required), `city`, `groupBy` = `none` (default) or `hourOfDay` | `200` | `400` missing or reversed date range |
| `GET` | `/analytics/sensitive-sites/{id}/exposure` | `from` and `to` (required) | `200` | `400`, `404` |

`GET /analytics/heatmap?from=2026-10-01T00:00:00Z&to=2026-10-31T23:59:59Z` response:

```json
{
  "from": "2026-10-01T00:00:00Z",
  "to": "2026-10-31T23:59:59Z",
  "neighborhoods": [
    {
      "neighborhoodId": "6718f0b2c1e5b3a9d0f41a01",
      "name": "Stare Miasto",
      "boundary": { "type": "Polygon", "coordinates": [[[19.93, 50.06], "…"]] },
      "averageDecibelLevel": 68.9,
      "maxDecibelLevel": 97.2,
      "readingsCount": 1342
    }
  ]
}
```

With `groupBy=hourOfDay`, each neighborhood also contains `"hourly": [{ "hour": 0, "averageDecibelLevel": 51.3, "readingsCount": 40 }, …]`. Hours are in UTC.

The exposure endpoint returns the same statistics for readings inside the site's `protectionRadiusMeters`. It gives planners a direct answer to "how loud is it around this school?".
