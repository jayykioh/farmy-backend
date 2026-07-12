## MODIFIED Requirements

### Requirement: 8.2 Endpoint PlantScan
The PlantScan API endpoint MUST return a specific data shape containing the diagnosis wrapped in the standard success format.

#### Scenario: Successful Plant Diagnosis
- **WHEN** the user uploads a valid image of a plant and the Gemini Vision AI successfully diagnoses it
- **THEN** the system MUST return HTTP 200 with the following shape:
```json
{
  "success": true,
  "data": {
    "scan_id": "string",
    "status": "completed",
    "crop_type": "Lúa",
    "diagnosis": {
      "is_plant": true,
      "disease_name": "Bệnh Đạo Ôn (Pyricularia oryzae)",
      "confidence": 0.92,
      "symptoms": ["Vết bệnh hình thoi", "Tâm màu xám tro"],
      "treatment": {
        "chemical": "Phun Tricyclazole hoặc Fuji-one 40EC",
        "organic": "Dọn sạch cỏ dại, hạn chế phân đạm khi trổ bông",
        "phi_warning": "⚠️ Cách ly 14 ngày... (null if no PHI keywords)",
        "safety_alert": "🚨 CẢNH BÁO... (null if no banned pesticides)"
      },
      "low_confidence_warning": "⚠️ Độ tin cậy thấp... (null if confidence >= 0.6)",
      "disclaimer": "Kết quả AI chỉ mang tính tham khảo. Để chẩn đoán chính xác, hãy liên hệ cán bộ khuyến nông địa phương."
    },
    "image_url": "https://r2.farmdiaries.vn/scans/...",
    "thumbnail_url": "https://r2.farmdiaries.vn/scans/...-thumb.webp",
    "cache_hit_from_scan_id": null
  }
}
```

#### Scenario: Cache Hit Diagnosis
- **WHEN** the user uploads an image that has a pHash matching a previous successful scan within 7 days
- **THEN** the system MUST return HTTP 200 with `status: "cached"`, include `cache_hit_from_scan_id`, and MUST NOT create a new database record.

#### Scenario: Not A Plant
- **WHEN** the Gemini Vision AI determines `is_plant: false`
- **THEN** the system MUST return HTTP 422 with `errorCode: NOT_A_PLANT_IMAGE` and save the scan as `failed` in the database.
