## Context

FarmDiaries needs an MVP feature to allow users to take a photo of a sick plant and receive an AI-generated diagnosis, including disease identification, confidence score, treatment suggestions, and safety warnings. This is handled by the `PlantScanModule` leveraging Gemini Vision API.

## Goals / Non-Goals

**Goals:**
- Provide a robust image validation pipeline (size, format, blurriness).
- Reduce cost and API latency via pHash image caching (distance < 10) in MongoDB.
- Reduce latency and memory usage via Sharp image compression (max 1024px, WebP/JPEG 80%).
- Ensure safe agricultural recommendations through BVTV guardrails (PHI, banned pesticides, disclaimers).
- Provide short-lived signed URLs for image rendering on the client.

**Non-Goals:**
- Custom ML model training (we rely entirely on Gemini Vision for the MVP).
- Persisting scan results inside the ChatModule message history on the backend. (The frontend handles the display of the result card).
- MVP does not create a new PlantScan document on cache hit. Scan history will show the original cached scan, not duplicate cached attempts.

## Decisions

- **Image Optimization (Sharp)**: Instead of sending raw 5MB uploads to Gemini, we decode, normalize orientation, resize to max 1024px, and re-encode to WebP/JPEG at 80% quality. 
- **Blur Detection**: Convert image to grayscale raw pixels with Sharp, then apply a Laplacian kernel manually in Node.js to compute variance. Reject if variance < 100.
- **Cache Strategy (pHash in MongoDB)**: Fetch the user's recent scans (last 7 days, specific `crop_type`, `status: 'completed'`) from MongoDB and compute the Hamming distance in-memory. **pHash Implementation:** Implement perceptual hash using DCT-based pHash. Do not use plain 8x8 average hash as the final MVP cache key. 
- **Cache Hit Behavior**: A cache hit consumes rate limit quota but does not trigger a new R2 upload or Gemini call. It returns the result of the old scan with a fresh signed URL (no new DB record is created for MVP). The response will set `scan_id` to the original cached scan ID, `status` to `cached`, and `cache_hit_from_scan_id` to the original cached scan ID.
- **AI Failure Behavior**: If Gemini fails or returns invalid JSON after R2 upload, save the `plant_scans` record with `status='failed'`, `image_key`, and `error_code`. Return a failed response to the client. Failed scans are excluded from pHash cache lookup and are visible only as failed status to the owner. Failed images follow retention cleanup.
- **Persistence Failure Behavior**: If DB save fails after a successful R2 upload, best-effort delete the uploaded `image_key` and `thumbnail_key` from R2, return HTTP 500 `PLANT_SCAN_PERSISTENCE_FAILED`, and do not leak signed URLs.
- **R2 Private Storage**: Images are stored in a private bucket with `image_key` and `thumbnail_key` in the DB. A proxy/fetch endpoint `GET /api/v1/plant-scans/:id` will generate short-lived signed URLs.
- **Prompt/LLM Boundary**: PlantScanModule imports AiModule. PlantScanModule uses PromptService.buildVisionPrompt() and LLMService.completeVision(). PlantScanModule must not instantiate Gemini SDK directly.

## Security & API Contracts

**PlantScan API Security and Signed URL Access:**
- `POST /api/v1/plant-scans` requires `JwtAuthGuard`.
- `user_id` is always extracted from the JWT context, never from the request body.
- `GET /api/v1/plant-scans/:id` finds by `_id` + `user_id`.
- Cross-user access returns 404 (do not leak existence of the resource).
- Responses never expose `image_key` or `thumbnail_key`.
- Signed URLs use `PLANT_SCAN_SIGNED_URL_TTL_SECONDS`.

**POST /api/v1/plant-scans**
- DTO: `CreatePlantScanDto { crop_type: string; notes?: string; }`
- Multipart field: `image`
- Does not log raw image buffers, Gemini prompts, or full Gemini raw outputs in production logs.
- Rate Limit Enforcement:
  - **User daily quota** (`scan:limit:{userId}:{yyyyMMdd}`): Checked immediately after basic image validation.
  - **Gemini quota** (`gemini:vision:rpm:{minute}`, `gemini:vision:rpd:{yyyyMMdd}`): Checked ONLY after a cache miss, right before calling Gemini. Cache hits bypass Gemini quota checks. Returns HTTP 429 `AI_SCAN_QUOTA_BUSY` when approaching Gemini limits.
- If `is_plant=false`:
  - `status` = `'failed'`
  - `error_code` = `'NOT_A_PLANT_IMAGE'`
  - Return HTTP 422
  - Do not return disease_name or treatment advice.

**GET /api/v1/plant-scans/:id**
- Response includes `scan_id`, `status`, `crop_type`, `diagnosis`, `image_url`, `thumbnail_url`, `created_at`.

**DB vs Response Status:**
- `PlantScanDocument.status` = `completed` | `failed`
- API response `status` = `completed` | `failed` | `cached`

**Response Contract:**
```json
{
  "scan_id": "string",
  "status": "completed | failed | cached",
  "crop_type": "string",
  "diagnosis": { // Optional (e.g. absent if failed)
    "is_plant": true,
    "disease_name": "string?",
    "confidence": 0.95,
    "symptoms": ["string"],
    "treatment": ["string"],
    "phi_warning": "string?",
    "safety_alert": "string?",
    "low_confidence_warning": "string?",
    "disclaimer": "string"
  },
  "image_url": "string?",
  "thumbnail_url": "string?",
  "cache_hit_from_scan_id": "string?",
  "error_code": "string?"
}
```

## Configuration & Environment Limits

```env
PLANT_SCAN_MODEL=gemini-2.5-flash
PLANT_SCAN_FALLBACK_MODEL=gemini-2.5-flash-lite
PLANT_SCAN_FREE_DAILY_LIMIT=3
PLANT_SCAN_PREMIUM_DAILY_LIMIT=10
PLANT_SCAN_GEMINI_RPM_LIMIT=<from AI Studio>
PLANT_SCAN_GEMINI_RPD_LIMIT=<from AI Studio>
PLANT_SCAN_IMAGE_MAX_DIMENSION=1024
PLANT_SCAN_IMAGE_QUALITY=80
PLANT_SCAN_SIGNED_URL_TTL_SECONDS=3600
```
Note: Do not use `gemini-2.5-flash-image` as it is an image generation model.

## Risks / Trade-offs

- [Risk] Sharp compression could obscure fine details needed for disease identification. → Mitigation: Keep the max dimension at 1024px and quality at 80-85%, which is proven sufficient for Gemini Vision.
- [Risk] Gemini Vision might hallucinate invalid JSON. → Mitigation: Use a strict `Zod` validation schema and a fallback error response, saving the failed state for auditing.
