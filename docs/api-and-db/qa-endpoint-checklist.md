# QA: Endpoint Checklist and Path Matrix (Draft)


This is a test plan, not an execution report. The 21 business endpoints are designed but not implemented. Only the two service endpoints currently exist. Business paths include the planned `/api/v1` prefix; service paths do not.

**Verification note:** `GET /` returns `200 application/json` with `{ "name": "blarescape-backend" }`, matching the existing automated test in `test/health.test.ts`.

## Endpoint matrix


| ID | Method | Full path | Access | Success | Documented errors | Main checks | Implementation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | GET | `/` | Unspecified | 200 | None | `text/plain`; exact body `Hello World!` | Implemented; existing automated test is inconsistent with implementation |
| S02 | GET | `/health` | Unspecified | 200 | None | Exact body `{"status":"ok"}` | Implemented; existing automated test |
| N01 | POST | `/api/v1/metrics/noise` | Unspecified | 201 | 400, 422 | Required fields; coordinate/dB boundaries; existing contributor; generated ID and receivedAt; default isFlagged=false; resolved neighborhood or null | Planned |
| N02 | GET | `/api/v1/metrics/noise` | Unspecified | 200 | 400 | Filters: neighborhoodId, contributorId, from, to, includeFlagged; pagination; flagged readings excluded by default | Planned |
| N03 | GET | `/api/v1/metrics/noise/{id}` | Unspecified | 200 | 404 | Read back created reading; unknown valid ID | Planned |
| N04 | PATCH | `/api/v1/metrics/noise/{id}` | Admin | 200 | 400, 404 | Update isFlagged and/or noiseSource; untouched fields preserved; measurement fields cannot be rewritten | Planned |
| N05 | DELETE | `/api/v1/metrics/noise/{id}` | Admin | 204 | 404 | Empty response; subsequent GET returns 404; repeated DELETE returns 404 | Planned |
| C01 | POST | `/api/v1/contributors` | Unspecified | 201 | 400, 409 | Required anonymousDeviceId; optional displayName; duplicate device; initial readingsCount=0 | Planned |
| C02 | GET | `/api/v1/contributors/{id}` | Unspecified | 200 | 404 | Correct contributor and readingsCount; unknown valid ID | Planned |
| C03 | PATCH | `/api/v1/contributors/{id}` | Unspecified | 200 | 400, 404 | Update displayName; preserve other fields; invalid body; unknown valid ID | Planned |
| C04 | DELETE | `/api/v1/contributors/{id}` | Unspecified | 204 | 404 | Empty response; subsequent GET returns 404; linked-reading policy requires a decision | Planned |
| B01 | POST | `/api/v1/neighborhoods` | Admin | 201 | 400, 409 | Required name, slug, city, boundary; valid GeoJSON; duplicate slug | Planned |
| B02 | GET | `/api/v1/neighborhoods` | Unspecified | 200 | 400 | City filter; pagination; boundary omitted; empty result | Planned |
| B03 | GET | `/api/v1/neighborhoods/{id}` | Unspecified | 200 | 404 | Boundary included; unknown valid ID | Planned |
| B04 | PUT | `/api/v1/neighborhoods/{id}` | Admin | 200 | 400, 404, 409 | Full replacement; invalid/missing fields; invalid GeoJSON; duplicate slug; unknown valid ID | Planned |
| B05 | DELETE | `/api/v1/neighborhoods/{id}` | Admin | 204 | 404, 409 | Delete unreferenced neighborhood; reject when readings or sites reference it; unknown valid ID | Planned |
| T01 | POST | `/api/v1/sensitive-sites` | Admin | 201 | 400, 422 | Required fields; siteType enum; coordinates; server resolves neighborhoodId; outside all neighborhoods | Planned |
| T02 | GET | `/api/v1/sensitive-sites` | Unspecified | 200 | 400 | neighborhoodId and siteType filters separately/together; pagination; invalid query | Planned |
| T03 | GET | `/api/v1/sensitive-sites/{id}` | Unspecified | 200 | 404 | Correct site; unknown valid ID | Planned |
| T04 | PUT | `/api/v1/sensitive-sites/{id}` | Admin | 200 | 400, 404, 422 | Full replacement; invalid fields; move inside/outside neighborhoods; unknown valid ID | Planned |
| T05 | DELETE | `/api/v1/sensitive-sites/{id}` | Admin | 204 | 404 | Empty response; subsequent GET returns 404; repeated DELETE returns 404 | Planned |
| A01 | GET | `/api/v1/analytics/heatmap` | Unspecified | 200 | 400 | Required from/to; reversed range; city filter; groupBy=none/hourOfDay; UTC hours; unflagged readings only; logarithmic average | Planned |
| A02 | GET | `/api/v1/analytics/sensitive-sites/{id}/exposure` | Unspecified | 200 | 400, 404 | Required from/to; invalid/reversed range; unknown site; protection radius; unflagged readings only; logarithmic statistics | Planned |

## Shared checklist

Apply relevant checks to each matrix row. Record `Pass`, `Fail`, `Blocked`, or `N/A`, with evidence; leave unexecuted cases `Not run`.

- [ ] Verify method, full path, expected status, JSON content type and response fields/types. A 204 response must have no body.
- [ ] Check missing required fields, nulls, wrong types, invalid enum values and malformed JSON. For errors, check `statusCode`, `error`, and `message` against the documented error format.
- [ ] Test each `{id}` with an existing ID and a valid but unknown 24-character hexadecimal ID. Track malformed-ID behavior separately until its status code is agreed.
- [ ] On lists, verify `{items,total,limit,offset}`; defaults limit=50 and offset=0; limit=200; offset beyond the result set; and an empty result. Confirm policy for limit=0, limit>200, negative/fractional values and invalid types before assigning expected outcomes.
- [ ] Verify each filter individually and in combination; confirm results and total match the filters.
- [ ] Verify persisted state after writes and unchanged state after rejected writes. Check that PATCH preserves fields and PUT applies the agreed replacement rules.
- [ ] For noise creation, test longitude -180/180, latitude -90/90, dB 0/140 and values just outside each range; positive integer duration versus zero, negative and fractional values; past and future timestamps.
- [ ] Check all noiseSource values: traffic, construction, nightlife, industry, aircraft, other. Check siteType values: school, hospital, kindergarten, care_home.
- [ ] Test analytics with known fixtures: equal-duration readings of 60 and 70 dB should produce approximately 67.40 dB, not 65 dB. Verify max/count and exclusion of flagged readings.
- [ ] After the access contract is agreed, test missing/invalid credentials, ordinary-user access to admin routes, and contributor ownership. Agree 401/403 expectations before execution.
- [ ] Probe deliberately absent routes: GET `/api/v1/contributors` and PUT `/api/v1/metrics/noise/{id}`. Confirm no enumeration or measurement rewrite; agree 404/405 behavior.

## Fixtures and execution order

Use an isolated test database. Create two neighborhoods with distinct non-overlapping boundaries, two contributors, and a sensitive site in one neighborhood. Add readings from both contributors, in both neighborhoods and outside them, at distinct UTC times. Include flagged/unflagged readings and readings inside/outside the site's radius. Use fresh device IDs and slugs for repeatable runs.

Run service smoke checks, create fixtures, test reads/filters, updates, analytics, conflicts, then deletion. Verify neighborhood deletion returns 409 while references exist; remove dependent sites/readings before deleting neighborhoods. Record the contributor's count before and after an accepted reading and verify it increases by one.

## Contract decisions needed

These gaps block only their related assertions, not the entire checklist:

1. Authentication, contributor ownership, authorization for includeFlagged, and expected 401/403 responses. The API design references section 7, but that section is missing.
2. Malformed ObjectId handling, unknown request fields, empty PATCH, and unsupported-method response codes.
3. Exact clock-drift tolerance, date-range boundary inclusion and invalid/reversed range behavior on the noise list.
4. Pagination rejection versus clamping, stable list ordering, and string length/empty-value rules.
5. Contributor deletion with existing readings; count behavior after reading deletion; reassignment of references after neighborhood boundary changes.
6. Protection-radius constraints/default behavior, radius-edge inclusion, overlapping-neighborhood resolution, and Polygon versus MultiPolygon support (the schema permits both).
7. Analytics with no matching readings, response shape for exposure, numeric precision, and whether measurement duration weights the logarithmic average.

## Execution record template

| Case ID | Endpoint ID | Scenario / request and fixture | Expected status and body/state | Actual result | Status | Evidence / issue |
| --- | --- | --- | --- | --- | --- | --- |
| N01-01 | N01 | Valid reading for an existing contributor | 201; generated fields; persisted reading; contributor count +1 | Pending | Not run | Pending |
| N01-02 | N01 | Valid payload with unknown contributorId | 422; no reading created | Pending | Not run | Pending |
| B05-01 | B05 | Delete a neighborhood referenced by a site | 409; neighborhood remains | Pending | Not run | Pending |

Record environment/base URL, commit, tester and execution time with each run. Do not mark planned endpoints as passed until they are implemented and tested.

