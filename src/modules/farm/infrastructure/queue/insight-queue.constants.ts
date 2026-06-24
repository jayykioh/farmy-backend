/** Tên BullMQ queue cho weekly insight */
export const INSIGHT_QUEUE = 'insight_queue';

/** Job orchestrator — trigger fan-out cho tất cả active users */
export const INSIGHT_JOB_ORCHESTRATE = 'schedule-weekly-insights';

/** Job worker — sinh AI insight cho từng user */
export const INSIGHT_JOB_GENERATE = 'generate_insight';

/** Cửa sổ phân tán tải: 2 tiếng = 7,200,000 ms */
export const INSIGHT_SPREAD_WINDOW_MS = 2 * 60 * 60 * 1000;
