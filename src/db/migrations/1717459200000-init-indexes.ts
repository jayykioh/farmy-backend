import * as mongoose from 'mongoose';

export default {
  name: '1717459200000-init-indexes',

  async up(connection: mongoose.Connection): Promise<void> {
    console.log('Running up migration: 1717459200000-init-indexes');
    const db = connection.db;
    if (db) {
      // 1. Text Search Index for Knowledge Sources
      const knowledgeSourcesCol = db.collection('knowledge_sources');
      await knowledgeSourcesCol.createIndex(
        { title: 'text', content: 'text' },
        { name: 'KnowledgeSourceTextIndex' },
      );
      console.log('Created text index on knowledge_sources.');

      // 2. Compound Index for Diary Logs
      const diaryLogsCol = db.collection('diary_logs');
      await diaryLogsCol.createIndex(
        { diary_id: 1, activity_type: 1 },
        { name: 'DiaryLogIdAndActivityTypeIndex' },
      );
      console.log('Created compound index on diary_logs.');
    }
  },

  async down(connection: mongoose.Connection): Promise<void> {
    console.log('Running down migration: 1717459200000-init-indexes');
    const db = connection.db;
    if (db) {
      const knowledgeSourcesCol = db.collection('knowledge_sources');
      await knowledgeSourcesCol.dropIndex('KnowledgeSourceTextIndex');
      console.log('Dropped text index on knowledge_sources.');

      const diaryLogsCol = db.collection('diary_logs');
      await diaryLogsCol.dropIndex('DiaryLogIdAndActivityTypeIndex');
      console.log('Dropped compound index on diary_logs.');
    }
  },
};
