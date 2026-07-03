## Why

FarmDiaries already has a partial implementation of `PlantScanService` nested inside the `AiModule`. However, it relies on mocked R2 uploads, mocked blur detection, and uses `image_url` instead of `image_key`. To prepare for production, we need to extract this into an independent `PlantScanModule`, complete the missing logic (R2, Blur detection, Controller), and enforce strict security contracts and guardrails.

## What Changes

- **Refactoring**: Extract `PlantScanService` out of `AiModule` into a new, independent `PlantScanModule`.
- **Schema Update**: Migrate the existing `PlantScanDocument` schema from `image_url` to `image_key` and `thumbnail_key` to support secure, short-lived signed URLs via private R2 bucket.
- **Implement Missing Logic**: 
  - Replace the mocked `checkBlurry` method with an actual Laplacian variance calculation using Sharp's raw grayscale pixels.
  - Replace the mocked image URL generation with an actual Cloudflare R2 upload (AWS SDK v3) for both optimized image and thumbnail.
- **Controller & Security**: Add `PlantScanController` with `CreatePlantScanDto`, enforcing `JwtAuthGuard` and strict ownership checks.
- **Enhance Guardrails**: Update the existing `applyBVTVGuardrail` to include a mandatory `disclaimer` and ensure failed Gemini calls do not save fake diagnoses.

## Capabilities

### New Capabilities
- `plant-scan`: Completion and extraction of the PlantScan pipeline, encompassing actual R2 integration, working blur detection, and strict JSON API contracts.

### Modified Capabilities
- (None)

## Impact

- **Architecture**: `PlantScanModule` becomes a top-level module, decoupling it from `AiModule`.
- **Storage**: Actually integrates Cloudflare R2 (Private Bucket) instead of generating mock URLs.
- **Database**: Modifies `plant_scans` schema (`image_url` -> `image_key`, `thumbnail_key`).
- **API**: Formalizes `POST /api/v1/plant-scans` and `GET /api/v1/plant-scans/:id` with strict DTOs.
