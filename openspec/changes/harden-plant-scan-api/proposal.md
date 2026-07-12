## Why

The G15 Plant Scan feature has an established backend pipeline in `PlantScanModule` covering validation, perceptual hashing, Cloudflare R2 uploads, Gemini Vision integration, and safety guardrails. However, before the frontend integrates with this API, we must ensure the backend is robust, the API contract is strictly frozen, duplicated R2 storage logic is resolved, and there is comprehensive test coverage. Integrating an unverified backend poses significant risk of rework if the response shapes, caching edge cases, or rate limits behave unexpectedly.

## What Changes

- Resolve the duplicated Cloudflare R2 storage logic between `src/modules/storage/r2-storage.service.ts` and `src/modules/plant-scan/application/services/storage.service.ts`, favoring the shared module.
- Freeze the canonical API response contract for `POST /api/v1/plant-scans` and `GET /api/v1/plant-scans/:id` to strictly match the OpenSpec requirements.
- Strictly enforce rate limit boundaries (3 scans/day upfront; Gemini quota only on cache miss).
- Ensure configuration properties like `PLANT_SCAN_MODEL`, RPM, and RPD limits are read from environment variables rather than hardcoded.
- Complete the backend test suite (unit and integration) to cover edge cases such as invalid schema, `is_plant=false`, blur detection rejection, pHash cache hit logic, and persistence failures.
- Do not introduce any new PlantScan product features, UI redesigns, or frontend changes.

## Capabilities

### New Capabilities
- `plant-scan-hardening`: Backend verification, testing, and contract freeze for the Plant Scan API pipeline.

### Modified Capabilities
- `aifeature`: Ensure the AI integration respects strict quota limits and returns a heavily validated Zod schema with proper fallback error handling without creating fake DB records on failure.

## Impact

- **Affected Code**: `src/modules/plant-scan/` (Controllers, Services, DTOs).
- **Storage**: Duplicated R2 storage code will be refactored, which might impact `StorageModule` slightly.
- **Testing**: Addition of significant mock setups for S3/R2 and Gemini APIs in the E2E tests.
- **Frontend**: Zero code changes. The frontend will merely be unblocked to integrate securely once this backend change completes.
