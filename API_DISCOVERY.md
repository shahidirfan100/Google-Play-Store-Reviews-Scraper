## Selected API

- Endpoint: `https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=UsvDTd&hl=<lang>&gl=<country>&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213&rt=j`
- Method: `POST`
- Auth: None required for public app reviews
- Request body: `application/x-www-form-urlencoded` with `f.req` payload
- Pagination: Continuation token from response path `payload[1][1]`
- Fields available:
  - Review ID, reviewer display name, reviewer image
  - Rating score, review text, thumbs-up count
  - Review timestamp, app version
  - Developer reply text and reply timestamp (when available)
  - Additional criteria ratings (when available)
- Field count vs previous actor:
  - Previous actor fields were Remote.co job fields (different target)
  - New actor now returns full Google Play review records with reviewer, rating, text, version, and reply metadata

## Discovery Notes

- Target URL used: `https://play.google.com/store/apps/details?id=com.linkedin.android&hl=en&gl=us`
- URLScan search run confirmed active Play Store request chain and Google internal data-service calls.
- Live request validation was done against batchexecute with `rpcids=UsvDTd`.
- Pagination was validated with continuation token replay and returned distinct next-page reviews.

## Candidate Endpoints Considered

1. `rpcids=oCPfdb` (batchexecute)
- Works and returns review payload.
- Rejected for final implementation because request shape is less stable to maintain across pagination variations.

2. `rpcids=UsvDTd` (batchexecute)
- Works with a compact request format.
- Provides stable continuation token flow.
- Selected as primary extraction path.

3. Play Store HTML parsing
- Rejected by design goal.
- Actor is required to be API/data-service based, not DOM/selector based.

4. Browser-required extraction (Playwright Firefox)
- Not required in final implementation.
- Direct HTTP requests to selected endpoint worked reliably during local tests.

## Scoring (apify-updater selection model)

| Score Factor | Points |
|---|---|
| Returns JSON-like structured payload directly | +30 |
| More than 15 useful fields available | +25 |
| No auth required for public reviews | +20 |
| Supports pagination token | +15 |
| Covers and extends required review output | +10 |
| **Total** | **100** |
