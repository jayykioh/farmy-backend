## Context

The backend has implemented the Plant Scan API (module `PlantScanModule`), which uses a multi-stage pipeline: magic bytes validation -> Sharp.js compression -> pHash caching -> R2 storage -> Gemini Vision API -> BVTV Guardrails -> MongoDB persistence. 
However, before releasing this to the frontend, this change hardens the backend implementation by adding strict environment-based configurations, removing duplicated R2 logic, adding missing tests, and freezing the API contract.

## Goals / Non-Goals

**Goals:**
- Resolve duplicated Cloudflare R2 configurations by using the shared `StorageModule`.
- Guarantee that `GeminiDiagnosisSchema` correctly outputs the diagnosis shape including safety injections (like `phi_warning` and `disclaimer`) and validates confidence.
- Guarantee that `PlantScanController` respects all HTTP status codes (400, 422, 429, 404, 500) and never leaks R2 object keys.
- Write tests to ensure edge cases (e.g., `is_plant=false`, Gemini limits, MongoDB save failures) are safely handled and rolled back appropriately.
- Mock `S3Client` and `LLMService.completeVision` for E2E tests so tests are deterministic and free.

**Non-Goals:**
- We will not implement the frontend camera capture or upload API calls.
- We will not redesign the diagnosis schema to add new features (e.g. weather conditions).
- We will not migrate away from Cloudflare R2 or Gemini 2.5 Flash to other providers.

## Decisions

- **Storage Duplication**: We will remove `src/modules/plant-scan/application/services/storage.service.ts` and instead inject the existing `R2StorageService` from the core `StorageModule`. PlantScanModule will handle the specific pathing (`scans/:userId/:fileId.webp`) but defer the actual AWS SDK S3Client calls to the core module.
- **Model Config & Quotas**: Replace hardcoded `gemini-1.5-flash` with a dynamically loaded config from `PLANT_SCAN_MODEL`, `PLANT_SCAN_GEMINI_RPM_LIMIT`, and `PLANT_SCAN_GEMINI_RPD_LIMIT`. Add `PLANT_SCAN_FREE_DAILY_LIMIT=3` and `PLANT_SCAN_PREMIUM_DAILY_LIMIT=10`. The user's tier MUST be derived from their authenticated profile (not from the request body). For MVP, if there is no subscription system, all users will fall back to the free limit. We will NOT implement a fallback model (e.g. `PLANT_SCAN_FALLBACK_MODEL`); if Gemini returns 429, we will return `AI_SCAN_QUOTA_BUSY` instead of bypassing quotas.
- **pHash Accuracy**: The current implementation uses `blockhash-core` (`bmvbhash`). We will document this correctly as a **blockhash perceptual hash** — NOT DCT-based pHash. All comments and docs referencing "DCT" must be removed unless a true DCT implementation is added. Hamming distance logic will be tested to confirm distances < 10 correctly trigger cache hits.
- **Cache Hit DB Strategy**: Cache hits will return the `cached` status along with the original `scan_id` (via `cache_hit_from_scan_id`) and will NOT create a duplicate record in MongoDB to save space.

## Risks / Trade-offs

- **Risk: E2E Test flakiness due to Mocks** -> *Mitigation*: The mocks for S3Client and Gemini must be highly strict and simulate real-world delays or errors to mimic the actual dependencies.
- **Risk: Shared StorageModule lacking Signed URL capability** -> *Mitigation*: If `R2StorageService` does not currently support `generateSignedUrl`, we will add it to the shared module rather than keeping a duplicated PlantScan storage service.
