## ADDED Requirements

### Requirement: Frozen API Response Contract
The system MUST use a consistent response wrapper for all Plant Scan API endpoints. Success responses MUST use `{ success: true, data: PlantScanResult }`. Error responses MUST use `{ success: false, errorCode: string, message: string }` at the top level.

#### Scenario: Successful diagnosis response shape
- **WHEN** the system completes a plant scan diagnosis
- **THEN** the response MUST follow:
```json
{
  "success": true,
  "data": {
    "scan_id": "string",
    "status": "completed | cached | failed",
    "crop_type": "string",
    "diagnosis": {
      "is_plant": true,
      "disease_name": "string",
      "confidence": 0.92,
      "symptoms": ["string"],
      "treatment": {
        "chemical": "string",
        "organic": "string",
        "phi_warning": "string | null",
        "safety_alert": "string | null"
      },
      "low_confidence_warning": "string | null",
      "disclaimer": "string"
    },
    "image_url": "https://signed-url",
    "thumbnail_url": "https://signed-url",
    "cache_hit_from_scan_id": "string | null"
  }
}
```
- **THEN** `image_key` and `thumbnail_key` MUST NOT appear anywhere in the response.

#### Scenario: Error response shape
- **WHEN** the system rejects a request with any error
- **THEN** the response MUST follow:
```json
{
  "success": false,
  "errorCode": "SCAN_IMAGE_BLURRY",
  "message": "Human-readable message in Vietnamese"
}
```

#### Scenario: Final frozen error codes
- **WHEN** a validation error occurs
- **THEN** the `errorCode` MUST be one of:
  - `SCAN_INVALID_FILE` (400) — missing/invalid/oversized image
  - `SCAN_INVALID_INPUT` (400) — missing crop_type
  - `SCAN_IMAGE_BLURRY` (422) — Laplacian variance < 100
  - `SCAN_QUOTA_EXCEEDED` (429) — user daily limit reached
  - `AI_SCAN_QUOTA_BUSY` (429) — Gemini quota exhausted
  - `NOT_A_PLANT_IMAGE` (422) — AI returned is_plant: false
  - `LLM_ERROR` (500) — Gemini returned invalid JSON or timed out
  - `PLANT_SCAN_PERSISTENCE_FAILED` (500) — DB save failed after R2 upload
  - `SCAN_NOT_FOUND` (404) — scan not found or ownership mismatch

### Requirement: Image Type and Size Validation
The system MUST validate uploaded image files using magic bytes and size constraints before accepting them.

#### Scenario: User uploads a valid WebP image
- **WHEN** user uploads a valid 3MB WebP image for plant scanning
- **THEN** the system MUST process the image and proceed with the scan pipeline

#### Scenario: User uploads an invalid file type
- **WHEN** user uploads a PDF or fake image extension
- **THEN** the system MUST reject the request with HTTP 400 and `errorCode: SCAN_INVALID_FILE`

#### Scenario: User uploads an oversized image
- **WHEN** user uploads an image larger than 5MB
- **THEN** the system MUST reject the request with HTTP 400 and `errorCode: SCAN_INVALID_FILE`

### Requirement: Blur Detection
The system MUST reject overly blurry images using Laplacian variance.

#### Scenario: User uploads a blurry image
- **WHEN** user uploads an image with Laplacian variance < 100
- **THEN** the system MUST reject the request with HTTP 422 and `errorCode: SCAN_IMAGE_BLURRY`

### Requirement: Perceptual Image Hash Caching
The system MUST use blockhash perceptual image hashing (via `blockhash-core`) to bypass LLM calls for recently scanned identical or similar images. This implementation MUST be documented as "blockhash perceptual hash" — NOT "DCT-based pHash" — unless a true DCT implementation replaces it.

#### Scenario: Cache hit on similar image
- **WHEN** user uploads an image with a pHash Hamming distance < 10 compared to a completed scan from the last 7 days (matching `crop_type`)
- **THEN** the system MUST return status `cached` without calling Gemini or creating a new MongoDB record, and MUST return fresh signed URLs

#### Scenario: Cache miss due to different crop type
- **WHEN** user uploads an identical image but specifies a different `crop_type`
- **THEN** the system MUST bypass the cache and run a fresh Gemini diagnosis

### Requirement: Guardrail Validation
The system MUST validate and sanitize the AI response before returning to the user.

#### Scenario: AI returns invalid JSON
- **WHEN** Gemini Vision returns malformed JSON or times out after retries
- **THEN** the system MUST reject the request with HTTP 500 and `errorCode: LLM_ERROR`

#### Scenario: AI determines the image is not a plant
- **WHEN** Gemini Vision returns `is_plant: false`
- **THEN** the system MUST save a failed scan record and return HTTP 422 with `errorCode: NOT_A_PLANT_IMAGE`

#### Scenario: AI returns low confidence
- **WHEN** Gemini Vision returns `confidence < 0.6`
- **THEN** the system MUST inject a `low_confidence_warning` into the final diagnosis response

#### Scenario: Treatment contains PHI-related keywords
- **WHEN** Gemini Vision suggests treatment containing PHI keywords (e.g. "thuốc", "phun", "liều lượng", "cách ly")
- **THEN** the system MUST inject `treatment.phi_warning` warning the user to respect pre-harvest interval periods

#### Scenario: Treatment contains banned/toxic pesticides
- **WHEN** Gemini Vision suggests treatment containing banned pesticide names (e.g. paraquat, chlorpyrifos, carbofuran)
- **THEN** the system MUST inject `treatment.safety_alert` warning the user that the suggested substance is prohibited
- **THEN** the injected `phi_warning` and `safety_alert` are SEPARATE fields — one MUST NOT replace the other

### Requirement: Persistence and R2 Cleanup
The system MUST handle database failures gracefully by cleaning up dangling R2 objects.

#### Scenario: MongoDB save failure after R2 upload
- **WHEN** the system successfully uploads images to R2 but fails to save the document to MongoDB
- **THEN** the system MUST make a best-effort attempt to delete the R2 objects and return HTTP 500 with `errorCode: PLANT_SCAN_PERSISTENCE_FAILED`

### Requirement: Endpoint Authorization
The system MUST restrict access to plant scan records to the owner.

#### Scenario: User requests their own scan record
- **WHEN** user requests `GET /api/v1/plant-scans/:id` with their own scan ID
- **THEN** the system MUST return the record with fresh signed URLs

#### Scenario: User requests another user's scan record
- **WHEN** user requests `GET /api/v1/plant-scans/:id` with a scan ID belonging to another user
- **THEN** the system MUST return HTTP 404 with `errorCode: SCAN_NOT_FOUND`

### Requirement: Quota Management
The system MUST enforce daily scanning limits based on the user's tier, and respect global LLM rate limits without bypassing them via fallback models.

#### Scenario: User daily quota exceeded
- **WHEN** user exceeds their daily quota (3 for free, 10 for premium, based on authenticated user profile)
- **THEN** the system MUST return HTTP 429 and `errorCode: SCAN_QUOTA_EXCEEDED`

#### Scenario: Global Gemini quota exceeded
- **WHEN** the system exceeds the `PLANT_SCAN_GEMINI_RPM_LIMIT` or `PLANT_SCAN_GEMINI_RPD_LIMIT`
- **THEN** the system MUST return HTTP 429 and `errorCode: AI_SCAN_QUOTA_BUSY` (no fallback bypassing is permitted)
