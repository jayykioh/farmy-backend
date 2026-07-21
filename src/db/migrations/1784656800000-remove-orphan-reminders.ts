import type { Connection } from 'mongoose';

export default {
  async up(connection: Connection): Promise<void> {
    const db = connection.db;
    if (!db) throw new Error('MongoDB connection is not ready');

    const diaryIds = await db.collection('diaries').distinct('_id');
    const filter = {
      $or: [
        { diary_id: { $exists: false } },
        { diary_id: null },
        { diary_id: '' },
        { diary_id: { $nin: diaryIds } },
      ],
    };
    const invalidCount = await db.collection('reminders').countDocuments(filter);
    const result = await db.collection('reminders').deleteMany(filter);

    console.log(
      `Removed ${result.deletedCount}/${invalidCount} reminders without a valid diary link.`,
    );
  },

  async down(): Promise<void> {
    console.warn(
      'Orphan reminders cannot be restored because they had no valid season relationship.',
    );
  },
};
