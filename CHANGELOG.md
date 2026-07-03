# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **PlantScanModule**: Extracted `PlantScan` logic from `AiModule` to a standalone top-level module to reduce domain coupling.
- **ImageProcessorService**: Added image processing utilities including magic bytes validation (JPEG/PNG/WEBP), Sharp image optimization (resize to 1024x1024, WebP), Laplacian variance blur detection, and DCT-based Perceptual Hashing (pHash).
- **StorageService**: Integrated `@aws-sdk/client-s3` for uploading optimized images and thumbnails to Cloudflare R2 via private buckets, producing temporary signed URLs.
- **PlantScanGuardrailService**: Added AI safety checks using Zod schemas for diagnosis output, injecting PHI warnings (14 days isolation), flagging banned pesticides (e.g., paraquat, chlorpyrifos), and tagging low-confidence results (<60%).
- **Rate Limiting**: Layered rate limiting enforcing a daily user quota (3 scans/day) and deferring Gemini quota validation (RPM/RPD) until after cache-misses to conserve resources.
- **Unit Tests**: Added robust `Jest` unit tests for `ImageProcessorService` and `PlantScanGuardrailService`.

### Changed
- **AiModule**: Removed `PlantScanController` and `PlantScanService` dependencies.
- **Privacy Processor**: Updated user account deletion workflow (`privacy.processor.ts`) to cleanly purge both `image_key` and `thumbnail_key` from Cloudflare R2 when a user deletes their data.
- **Dependencies**: Added `sharp`, `zod`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `file-type`, and `blockhash-core`.

### Fixed
- Replaced ambiguous `is_plant=false` diagnosis behavior with explicit HTTP 422 failure (`NOT_A_PLANT_IMAGE`), halting further processing.
- Resolved type compilation errors resulting from obsolete schema paths.
