/** Tên BullMQ Queue dùng để dispatch reminder notifications */
export const REMINDER_QUEUE = 'reminder-dispatch';

/** Job name trong queue */
export const REMINDER_JOB_DISPATCH = 'dispatch-reminder';

/** Thông số retry */
export const REMINDER_MAX_RETRIES = 3;

/** Giờ mặc định cho từng schedule_slot (giờ địa phương UTC+7) */
export const SCHEDULE_SLOT_HOURS: Record<string, number> = {
  morning: 7, // 07:00
  noon: 12, // 12:00
  afternoon: 16, // 16:00
  evening: 20, // 20:00
};
