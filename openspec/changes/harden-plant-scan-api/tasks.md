## 1. Storage and Configuration Refactor

- [x] 1.1 Delete `src/modules/plant-scan/application/services/storage.service.ts` and replace its usages in `PlantScanService` with the shared `R2StorageService` from `StorageModule`.
- [x] 1.2 Update `R2StorageService` to support generating signed URLs if it doesn't already.
- [x] 1.3 Update `.env.example` and config loaders to include `PLANT_SCAN_MODEL`, `PLANT_SCAN_GEMINI_RPM_LIMIT`, `PLANT_SCAN_GEMINI_RPD_LIMIT`, `PLANT_SCAN_FREE_DAILY_LIMIT`, and `PLANT_SCAN_PREMIUM_DAILY_LIMIT`.
- [x] 1.4 Refactor `PlantScanService` and `PlantScanController` to read Gemini models and quotas dynamically from config, determining user tier from authenticated profile.

## 2. Testing Setup

- [x] 2.1 Create Jest mocks for `S3Client` (or `R2StorageService` directly) in the Plant Scan E2E/Integration test suites to prevent actual R2 bucket uploads during tests.
- [x] 2.2 Create Jest mocks for `LLMService.completeVision` to return predictable, deterministic JSON responses without hitting the Gemini API.

## 3. Core Logic Hardening

- [x] 3.1 Verify that `blockhash-core` is used for perceptual image hashing and update all documentation/comments to call it "blockhash perceptual hash" — remove any references to "DCT-based pHash" unless a true DCT implementation is added.
- [x] 3.2 Update `PlantScanService` cache hit logic: ensure it returns `status: "cached"`, includes `cache_hit_from_scan_id`, and does NOT create a new duplicate MongoDB record.
- [x] 3.3 Ensure that `image_key` and `thumbnail_key` are NEVER returned in the API responses from `PlantScanController`.
- [x] 3.4 Verify that `GET /api/v1/plant-scans/:id` strictly checks `user_id` ownership (returning 404 for cross-user requests).

## 4. Test Coverage Execution

- [x] 4.1 Write/fix unit tests for validation: reject fake image magic bytes; reject variance < 100 with `SCAN_IMAGE_BLURRY`; reject oversized files.
- [x] 4.2 Write/fix unit tests for pHash: verify Hamming distance < 10 triggers cache hit; verify identical hash but different `crop_type` triggers cache miss.
- [x] 4.3 Write/fix integration tests for edge cases: `is_plant=false` returns 422 `NOT_A_PLANT_IMAGE` and saves failed scan.
- [x] 4.4 Write/fix integration tests for quota: User daily quota exceeded returns 429 `SCAN_QUOTA_EXCEEDED`; Gemini quota exceeded returns 429 `AI_SCAN_QUOTA_BUSY`.
- [x] 4.5 Write/fix integration tests for guardrails: confidence < 0.6 injects `low_confidence_warning`; PHI keywords ("thuốc", "phun", "cách ly") inject `treatment.phi_warning`; banned pesticide names (paraquat, carbofuran) inject `treatment.safety_alert` (separate from `phi_warning`); disclaimer is always present in every successful response.
- [x] 4.6 Write/fix integration tests for persistence failure: simulate MongoDB save failure, ensure R2 best-effort cleanup is called, and API returns 500 `PLANT_SCAN_PERSISTENCE_FAILED`.
- [x] 4.7 Write/fix integration tests for cache hit: verify `completeVision` is NOT called, R2 upload is NOT called, MongoDB `save` is NOT called, and Gemini RPM/RPD checks are bypassed.
- [x] 4.8 Write/fix integration tests for API contract: verify response is not double-wrapped by global interceptor (i.e. `{ success: true, data: { success: true, ... } }`), verify `GET` own scan returns signed URLs, and verify `GET` cross-user returns 404 `SCAN_NOT_FOUND`.
- [x] 4.9 Write/fix integration tests for invalid Gemini JSON: verify malformed LLM response correctly returns 500 `LLM_ERROR`.

## 5. Contract Freeze Gate

- [x] 5.1 Produce sample JSON for a successful `completed` response and confirm it matches the frozen shape in `specs/plant-scan-hardening/spec.md`.
- [x] 5.2 Produce sample JSON for a `cached` response and confirm `cache_hit_from_scan_id` is populated and no new DB record is created.
- [x] 5.3 Write/run an HTTP integration test to confirm the API response only has a single `{ success: true/false, ... }` wrapper and is not double-wrapped by a global interceptor.
- [x] 5.4 Produce sample JSON for error responses and confirm `{ success: false, errorCode, message }` shape — confirm all 8 error codes are covered.
- [x] 5.5 Confirm no response leaks `image_key` or `thumbnail_key`.
- [x] 5.6 Confirm wrapper is consistently `{ success: true, data: PlantScanResult }` in all success paths.
- [x] 5.7 Confirm all tests pass (unit + integration) before issuing verdict.
- [x] 5.8 Write final verdict comment in this file:
  - Either: `<!-- VERDICT: BACKEND READY FOR FRONTEND INTEGRATION -->`
  - Or: `<!-- VERDICT: BLOCKED (List reasons) -->`

<!-- VERDICT: BACKEND READY FOR FRONTEND INTEGRATION -->
