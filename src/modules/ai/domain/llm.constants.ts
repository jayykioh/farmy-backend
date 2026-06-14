export const LLM_FALLBACK_MESSAGE =
  'Dạ, hệ thống tư vấn đang bận, bà con vui lòng thử lại sau vài giây nhé! 🌱';

export const LLM_SAFETY_MESSAGE =
  'Nội dung câu hỏi chưa phù hợp. Bà con vui lòng đặt câu hỏi rõ ràng hơn về kỹ thuật cây trồng nhé!';

// ─── RPM Rate-Limit Keys ────────────────────────────────────────────────────
// Các key này là GLOBAL (shared toàn bộ user), không per-user.
// Mục đích: bảo vệ Gemini API quota, không phải throttle từng user riêng.
// Nếu cần per-user throttle, dùng key format: `llm:rpm:flash:{userId}`
export const LLM_FLASH_RPM_KEY = 'llm:rpm:flash';
export const LLM_EMBED_RPM_KEY = 'llm:rpm:embed';

// Gemini Flash free-tier limit: 15 RPM → đặt 14 để giữ 1 request buffer an toàn
export const LLM_FLASH_RPM_LIMIT = 14;
// Gemini text-embedding-004 free-tier limit: 100 RPM → đặt 95 để giữ buffer
export const LLM_EMBED_RPM_LIMIT = 95;

export const LLM_RPM_WINDOW_SECONDS = 60;

