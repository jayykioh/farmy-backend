/**
 * Queue v2 tách khỏi worker cũ chỉ hỗ trợ một insight/user/tuần.
 * Payload v2 bắt buộc hiểu diaryId để sinh báo cáo theo từng mùa vụ.
 */
export const INSIGHT_QUEUE = 'insight_generation_queue_v2';

/** Queue riêng cho repeatable orchestration; không tranh job với AI worker. */
export const INSIGHT_ORCHESTRATOR_QUEUE = 'insight_orchestrator_queue_v2';

/** Job orchestrator — trigger fan-out cho tất cả active users */
export const INSIGHT_JOB_ORCHESTRATE = 'schedule-weekly-insights';

/** Job worker — sinh AI insight cho từng user */
export const INSIGHT_JOB_GENERATE = 'generate_insight';

/** Cửa sổ phân tán tải: 2 tiếng = 7,200,000 ms */
export const INSIGHT_SPREAD_WINDOW_MS = 2 * 60 * 60 * 1000;
