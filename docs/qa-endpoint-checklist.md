# QA: Endpoint Checklist and Path Matrix

This is a test plan, not an execution report. Service routes and the 21 business routes below are implemented. Business routes use `/api/v1`; service routes do not. `Implemented; not verified` means code exists, not that runtime checks have passed. Business routes require MongoDB configured with `MONGODB_URI` and `MONGODB_DATABASE`. Routes marked Admin require `Authorization: Bearer <ADMIN_API_TOKEN>`.

## Endpoint matrix

| ID | Method | Full path | Access | Success | Documented errors | Main checks | Implementation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | GET | `/` | Public | 200 | None | JSON `{ "name": "blarescape-backend" }` | Implemented; existing automated test |
| S02 | GET | `/health` | Public | 200 | None | JSON `{ "status": "ok" }` | Implemented; existing automated test |
| N01 | POST | `/api/v1/metrics/noise` | Public | 201 | 400, 422 | Required fields; coordinate/dB boundaries; existing contributor; generated ID and receivedAt; default isFlagged=false; resolved neighborhood or null | Implemented; not verified |
| N02 | GET | `/api/v1/metrics/noise` | Public; Admin for includeFlagged=true | 200 | 400, 401 | Filters: neighborhoodId, contributorId, from, to, includeFlagged; pagination; flagged readings excluded by default | Implemented; not verified |
| N03 | GET | `/api/v1/metrics/noise/{id}` | Public | 200 | 400, 404 | Read back created reading; unknown valid ID | Implemented; not verified |
| N04 | PATCH | `/api/v1/metrics/noise/{id}` | Admin | 200 | 400, 401, 404 | Update isFlagged and/or noiseSource; untouched fields preserved; measurement fields cannot be rewritten | Implemented; not verified |
| N05 | DELETE | `/api/v1/metrics/noise/{id}` | Admin | 204 | 400, 401, 404 | Empty response; subsequent GET returns 404; repeated DELETE returns 404; contributor count decremented | Implemented; not verified |
| C01 | POST | `/api/v1/contributors` | Public | 201 | 400, 409 | Required anonymousDeviceId; optional displayName; duplicate device; initial readingsCount=0 | Implemented; not verified |
| C02 | GET | `/api/v1/contributors/{id}` | Public | 200 | 400, 404 | Correct contributor and readingsCount; unknown valid ID | Implemented; not verified |
| C03 | PATCH | `/api/v1/contributors/{id}` | Public | 200 | 400, 404 | Update displayName; preserve other fields; invalid body; unknown valid ID | Implemented; not verified |
| C04 | DELETE | `/api/v1/contributors/{id}` | Public | 204 | 400, 404, 409 | Empty response; subsequent GET returns 404; reject deletion while readings reference contributor | Implemented; not verified |
| B01 | POST | `/api/v1/neighborhoods` | Admin | 201 | 400, 401, 409 | Required name, slug, city, boundary; valid GeoJSON; duplicate slug | Implemented; not verified |
| B02 | GET | `/api/v1/neighborhoods` | Public | 200 | 400 | City filter; pagination; boundary omitted; empty result | Implemented; not verified |
| B03 | GET | `/api/v1/neighborhoods/{id}` | Public | 200 | 400, 404 | Boundary included; unknown valid ID | Implemented; not verified |
| B04 | PUT | `/api/v1/neighborhoods/{id}` | Admin | 200 | 400, 401, 404, 409 | Full replacement; invalid/missing fields; invalid GeoJSON; duplicate slug; unknown valid ID | Implemented; not verified |
| B05 | DELETE | `/api/v1/neighborhoods/{id}` | Admin | 204 | 400, 401, 404, 409 | Delete unreferenced neighborhood; reject when readings or sites reference it; unknown valid ID | Implemented; not verified |
| T01 | POST | `/api/v1/sensitive-sites` | Admin | 201 | 400, 401, 422 | Required fields; siteType enum; coordinates; server resolves neighborhoodId; outside all neighborhoods | Implemented; not verified |
| T02 | GET | `/api/v1/sensitive-sites` | Public | 200 | 400 | neighborhoodId and siteType filters separately/together; pagination; invalid query | Implemented; not verified |
| T03 | GET | `/api/v1/sensitive-sites/{id}` | Public | 200 | 400, 404 | Correct site; unknown valid ID | Implemented; not verified |
| T04 | PUT | `/api/v1/sensitive-sites/{id}` | Admin | 200 | 400, 401, 404, 422 | Full replacement; invalid fields; move inside/outside neighborhoods; unknown valid ID | Implemented; not verified |
| T05 | DELETE | `/api/v1/sensitive-sites/{id}` | Admin | 204 | 400, 401, 404 | Empty response; subsequent GET returns 404; repeated DELETE returns 404 | Implemented; not verified |
| A01 | GET | `/api/v1/analytics/heatmap` | Public | 200 | 400 | Required from/to; reversed range; city filter; groupBy=none/hourOfDay; UTC hours; unflagged readings only; logarithmic average | Implemented; not verified |
| A02 | GET | `/api/v1/analytics/sensitive-sites/{id}/exposure` | Public | 200 | 400, 404 | Required from/to; invalid/reversed range; unknown site; protection radius; unflagged readings only; logarithmic statistics | Implemented; not verified |

## Shared checklist

Record `Pass`, `Fail`, `Blocked`, or `N/A`, with evidence; leave unexecuted cases `Not run`.

- [ ] Verify method, full path, expected status, JSON content type and response fields/types. A 204 response must have no body.
- [ ] Check missing required fields, nulls, wrong types, invalid enum values and malformed JSON. Check error fields `statusCode`, `error`, and `message`.
- [ ] Test each `{id}` with an existing ID and a valid but unknown 24-character hexadecimal ID. Malformed IDs return 400.
- [ ] On lists, verify `{items,total,limit,offset}`; defaults limit=50 and offset=0; limit=200; offset beyond the result set; and an empty result. Limit=0 is accepted; limit>200, negative/fractional values and invalid types are rejected.
- [ ] Verify each filter individually and in combination; confirm results and total match the filters.
- [ ] Verify persisted state after writes and unchanged state after rejected writes. Check PATCH preserves fields and PUT applies full replacement.
- [ ] For noise creation, test longitude -180/180, latitude -90/90, dB 0/140 and values just outside each range; positive integer duration versus zero, negative and fractional values; past and future timestamps.
- [ ] Check all noiseSource values: traffic, construction, nightlife, industry, aircraft, other. Check siteType values: school, hospital, kindergarten, care_home.
- [ ] Test analytics with known fixtures: equal-duration readings of 60 and 70 dB should produce approximately 67.40 dB, not 65 dB. Verify max/count and exclusion of flagged readings.
- [ ] Verify missing and invalid admin bearer tokens return 401, and an unset `ADMIN_API_TOKEN` returns 503.
- [ ] Probe deliberately absent routes: GET `/api/v1/contributors` and PUT `/api/v1/metrics/noise/{id}`. Confirm no enumeration or measurement rewrite; verify Fastify's 404 behavior.

## Fixtures and execution order

Use an isolated test database. Create two neighborhoods with distinct non-overlapping boundaries, two contributors, and a sensitive site in one neighborhood. Add readings from both contributors, in both neighborhoods and outside them, at distinct UTC times. Include flagged/unflagged readings and readings inside/outside the site's radius. Use fresh device IDs and slugs for repeatable runs.

Run service smoke checks, create fixtures, test reads/filters, updates, analytics, conflicts, then deletion. Verify neighborhood deletion returns 409 while references exist; remove dependent sites/readings before deleting neighborhoods. Record the contributor's count before and after an accepted reading, and verify it increases by one and decreases when a reading is deleted.

## Contract decisions

Authentication uses a shared bearer token from `ADMIN_API_TOKEN`; contributor ownership is not implemented. Contributor deletion returns 409 while readings exist. The implementation uses 30 seconds of future clock tolerance, inclusive date range boundaries, rejects pagination outside its documented limits, and sorts lists deterministically. Protection radius defaults to 200 meters; radius boundary points are included. Overlapping neighborhood resolution uses the first matching document returned by MongoDB, so deployments should ensure boundaries do not overlap. Analytics currently use an unweighted logarithmic average. The exposure response contains `site`, `from`, `to`, `averageDecibelLevel`, `maxDecibelLevel`, and `readingsCount` (statistics are null/zero when no readings match).

## Execution record template

| Case ID | Endpoint ID | Scenario / request and fixture | Expected status and body/state | Actual result | Status | Evidence / issue |
| --- | --- | --- | --- | --- | --- | --- |
| N01-01 | N01 | Valid reading for an existing contributor | 201; generated fields; persisted reading; contributor count +1 | Pending | Not run | Pending |
| N01-02 | N01 | Valid payload with unknown contributorId | 422; no reading created | Pending | Not run | Pending |
| B05-01 | B05 | Delete a neighborhood referenced by a site | 409; neighborhood remains | Pending | Not run | Pending |

Record environment/base URL, commit, tester and execution time with each run. Do not mark cases as passed until they are executed.
