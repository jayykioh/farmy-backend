import * as mongoose from 'mongoose';

const OLD_INDEX = 'user_id_1_week_start_date_1';
const NEW_INDEX = 'user_id_1_diary_id_1_week_start_date_1';

export default {
  name: '1784512800000-insight-per-diary-index',

  async up(connection: mongoose.Connection): Promise<void> {
    const collection = connection.db?.collection('weekly_insights');
    if (!collection) return;

    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === OLD_INDEX)) {
      await collection.dropIndex(OLD_INDEX);
    }

    if (!indexes.some((index) => index.name === NEW_INDEX)) {
      await collection.createIndex(
        { user_id: 1, diary_id: 1, week_start_date: 1 },
        {
          name: NEW_INDEX,
          unique: true,
          partialFilterExpression: { diary_id: { $type: 'string' } },
        },
      );
    }
  },

  async down(connection: mongoose.Connection): Promise<void> {
    const collection = connection.db?.collection('weekly_insights');
    if (!collection) return;

    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === NEW_INDEX)) {
      await collection.dropIndex(NEW_INDEX);
    }
    await collection.createIndex(
      { user_id: 1, week_start_date: 1 },
      { name: OLD_INDEX, unique: true },
    );
  },
};
