## 1. Refactoring and Setup

- [ ] 1.1 Extract `PlantScanService` from `AiModule` into a new `PlantScanModule`.
- [ ] 1.2 Update MongoDB schema `PlantScanDocument`: remove `image_url`, add `image_key`, `thumbnail_key`, `status`, `p_hash`, `diagnosis`, `confidence`, `model_used`, `prompt_version`, `latency_ms`, `cache_hit_from_scan_id`, and `error_code`. Add `created_at` and `updated_at`.
- [ ] 1.3 Add `@types/multer` and configure Cloudflare R2 using AWS SDK v3 with private bucket credentials.
- [ ] 1.4 Create `CreatePlantScanDto` (`crop_type`, `notes?`) for the upload endpoint.

## 2. Validation and Image Processing Pipeline

- [ ] 2.1 Update Multer middleware configuration (5MB limit, whitelist mimetypes) and integrate `file-type` magic bytes validation.
- [ ] 2.2 Implement actual Laplacian variance blur detection in `checkBlurry()` (replace current `return false` mock).
- [ ] 2.3 Add Sharp.js image optimization (resize max 1024px, WebP/JPEG format, quality 80%) before the LLM call.
- [ ] 2.4 Implement perceptual hash using DCT-based pHash. Do not use plain 8x8 average hash as the final MVP cache key.

## 3. Caching and Storage

- [ ] 3.1 Update cache lookup logic: Cache lookup ignores failed scans and only queries status: 'completed'. Cache hit should return the cached diagnosis but skip LLM and R2 upload.
- [ ] 3.2 Implement R2 upload logic for optimized image and thumbnail (replacing the `mockImageUrl` logic).
- [ ] 3.3 Implement `GET /api/v1/plant-scans/:id` endpoint to verify ownership and generate short-lived signed URLs for `image_key` and `thumbnail_key`.
- [ ] 3.4 Implement persistence failure handling: If DB save fails after R2 upload, best-effort delete uploaded files from R2 and return 500 `PLANT_SCAN_PERSISTENCE_FAILED`.

## 4. AI and Guardrail Services

- [ ] 4.1 Define strict Zod schema for the Gemini Vision JSON output.
- [ ] 4.2 Enhance `applyBVTVGuardrail` to inject a mandatory AI `disclaimer` and ensure `low_confidence_warning` is accurate.
- [ ] 4.3 Implement failure handling: If Gemini returns invalid JSON or fails, save `status='failed'`, `error_code`, `image_key` without a fake diagnosis. If `is_plant=false`, save `status='failed'`, return `NOT_A_PLANT_IMAGE` HTTP 422.

## 5. Integration and Controller

- [ ] 5.1 Create `PlantScanController` with `POST /api/v1/plant-scans` endpoint applying `JwtAuthGuard`, extracting `userId`. Enforce user daily quota immediately, and Gemini RPM/RPD quota only after a cache miss.
- [ ] 5.2 Register `PlantScanModule` in the root application module and clean up imports in `AiModule`.

## 6. Testing

- [ ] 6.1 Unit: file magic bytes rejects fake image
- [ ] 6.2 Unit: actual blur detection rejects variance < 100
- [ ] 6.3 Unit: pHash Hamming distance cache hit
- [ ] 6.4 Unit: BVTV guardrail injects `phi_warning` and mandatory disclaimer
- [ ] 6.5 Unit: invalid Gemini JSON returns failed status
- [ ] 6.6 Integration: POST /plant-scans success stores `image_key` to R2 (mocked) and DB
- [ ] 6.7 Integration: cache hit does not call `LLMService.completeVision`
- [ ] 6.8 Integration: GET /plant-scans/:id verifies ownership and returns fresh signed URL
- [ ] 6.9 Integration: cache lookup ignores failed scans
- [ ] 6.10 Integration: same pHash but different crop_type does not cache hit
- [ ] 6.11 Integration: User A cannot access User B scan
- [ ] 6.12 Integration: rate limit exceeded returns 429
- [ ] 6.13 Integration: LLMService.completeVision failure saves failed scan
- [ ] 6.14 Unit: confidence < 0.6 injects low_confidence_warning
- [ ] 6.15 Unit: is_plant=false returns NOT_A_PLANT_IMAGE behavior
- [ ] 6.16 Contract: response never exposes image_key or thumbnail_key
- [ ] 6.17 Integration: DB save failure after R2 upload triggers R2 cleanup and returns 500
