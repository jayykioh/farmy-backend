require('dotenv').config();
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const TARGET_EMAIL = 'hoangnguyennick@gmail.com';
const SEASON_NAME = 'Lúa thơm · Vụ trải nghiệm · 2026';

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/farmy');
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({ email: TARGET_EMAIL });
  if (!user) throw new Error(`Không tìm thấy user ${TARGET_EMAIL}`);

  const plot = await db.collection('farm_plots').findOne(
    { user_id: user._id },
    { sort: { created_at: 1 } },
  );
  if (!plot) throw new Error(`User ${TARGET_EMAIL} chưa có mảnh vườn để liên kết diary`);

  const diaryResult = await db.collection('diaries').findOneAndUpdate(
    { plot_id: plot._id, season: SEASON_NAME },
    {
      $set: {
        crop_type: 'Lúa thơm',
        start_date: new Date('2026-07-21T00:00:00+07:00'),
        status: 'active',
      },
      $setOnInsert: {
        _id: randomUUID(),
        plot_id: plot._id,
        season: SEASON_NAME,
        metadata: { seeded_for_demo: true },
        created_at: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const diary = diaryResult.value || diaryResult;

  const remindAt = new Date(Date.now() + 30 * 60 * 1000);
  const reminderResult = await db.collection('reminders').findOneAndUpdate(
    {
      user_id: user._id,
      diary_id: diary._id,
      title: 'Tưới nước',
      status: { $in: ['pending', 'delivered'] },
    },
    {
      $set: {
        remind_at: remindAt,
        status: 'pending',
        is_sent: false,
        delivered_at: null,
      },
      $setOnInsert: {
        _id: randomUUID(),
        user_id: user._id,
        diary_id: diary._id,
        title: 'Tưới nước',
        type: 'water',
        schedule_slot: 'evening',
        action_type: 'water',
        action_detail: `Tưới nước cho ${SEASON_NAME}`,
        retry_count: 0,
        repeat: 'none',
        created_at: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const reminder = reminderResult.value || reminderResult;

  console.log(JSON.stringify({
    user: { _id: user._id, email: user.email },
    plot: { _id: plot._id, name: plot.name },
    diary: { _id: diary._id, crop_type: diary.crop_type, season: diary.season },
    reminder: { _id: reminder._id, title: reminder.title, remind_at: reminder.remind_at, status: reminder.status },
  }, null, 2));
}

seed()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
