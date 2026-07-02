## ADDED Requirements

### Requirement: PlantScan Validation Pipeline
The system SHALL validate incoming scan requests for rate limits, file size, mime types, magic bytes, and blurriness.

#### Scenario: Rate limit exceeded
- **WHEN** user uploads an image but has exceeded their daily scan quota
- **THEN** system rejects with 429 SCAN_QUOTA_EXCEEDED.

#### Scenario: Image is blurry
- **WHEN** user uploads a valid image but Laplacian variance computed from raw grayscale pixels is < 100
- **THEN** system rejects with 422 SCAN_IMAGE_BLURRY.

### Requirement: PlantScan Caching
The system SHALL compute a pHash for the optimized image and check for similarity against recent scans (last 7 days) of the same `crop_type` for the same user in MongoDB.

#### Scenario: Cache Hit
- **WHEN** Hamming distance between the incoming pHash and a recent scan is < 10
- **THEN** system returns the cached diagnosis (with fresh signed URLs), deducts from the rate limit quota, and does NOT upload a new image or call Gemini Vision API.

### Requirement: Gemini Vision Integration
The system SHALL upload the optimized image to Cloudflare R2 and use AiModule to call Gemini Vision with the image and BuildVisionPromptInput.

#### Scenario: Valid Vision Response
- **WHEN** Gemini Vision returns a valid JSON diagnosis
- **THEN** system validates the JSON schema and passes it to the Guardrail Service.

#### Scenario: Invalid Vision Response or Failure
- **WHEN** Gemini Vision returns invalid JSON or the API fails
- **THEN** system saves the `plant_scans` record with `status='failed'`, `image_key`, and an `error_code`, and returns a failed status to the user without a fake diagnosis.

### Requirement: BVTV & Safety Guardrails
The system SHALL process the AI's diagnosis through a PlantScanGuardrailService to enforce safe agricultural practices and AI disclaimers.

#### Scenario: PHI Warning Required
- **WHEN** the treatment text contains keywords like 'thuốc', 'phun', 'liều lượng', 'PHI', 'cách ly'
- **THEN** system automatically injects a `phi_warning` into the treatment object.

#### Scenario: Banned Pesticide Detected
- **WHEN** the treatment text contains banned pesticides (e.g., 'paraquat', 'carbofuran', sourced from an extensible constant list)
- **THEN** system injects a `safety_alert` warning.

#### Scenario: Low Confidence and Disclaimers
- **WHEN** the AI's confidence score is < 0.6
- **THEN** system injects a `low_confidence_warning`.
- **AND** the system ALWAYS injects a standard `disclaimer` emphasizing that AI is for reference only.

### Requirement: PlantScan API Security and Signed URL Access
The system SHALL protect all PlantScan endpoints with authenticated ownership checks and short-lived signed URL access.

#### Scenario: Protected scan upload
- **WHEN** the client uploads to POST /api/v1/plant-scans
- **THEN** the system MUST require JwtAuthGuard
- **AND** user_id MUST come from JWT context, never request body.

#### Scenario: Protected scan retrieval
- **WHEN** the client requests GET /api/v1/plant-scans/:id
- **THEN** the system MUST find by _id + user_id
- **AND** cross-user access MUST return 404
- **AND** the response MUST NOT expose image_key or thumbnail_key
- **AND** image_url / thumbnail_url MUST be short-lived signed URLs.

### Requirement: PlantScan Persistence Failure Cleanup

#### Scenario: DB save fails after R2 upload
- **WHEN** optimized image and thumbnail were uploaded to R2
- **AND** MongoDB persistence fails
- **THEN** the system MUST best-effort delete the uploaded R2 objects
- **AND** return HTTP 500 PLANT_SCAN_PERSISTENCE_FAILED
- **AND** MUST NOT return signed URLs.

### Requirement: PlantScan Quota Ordering and Non-Plant Handling

#### Scenario: Gemini quota after cache miss
- **WHEN** a scan matches a completed cached scan
- **THEN** the system MUST bypass Gemini RPM/RPD quota checks
- **AND** MUST NOT call Gemini Vision.

#### Scenario: Non-plant image
- **WHEN** Gemini returns is_plant=false
- **THEN** the system MUST save status='failed'
- **AND** return HTTP 422 NOT_A_PLANT_IMAGE
- **AND** MUST NOT return disease_name or treatment advice.
