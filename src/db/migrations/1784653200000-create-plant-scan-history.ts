import * as mongoose from 'mongoose';

const COLLECTION = 'plant_scans';

export default {
  name: '1784653200000-create-plant-scan-history',

  async up(connection: mongoose.Connection): Promise<void> {
    const db = connection.db;
    if (!db) return;

    const collections = await db
      .listCollections({ name: COLLECTION }, { nameOnly: true })
      .toArray();

    if (collections.length === 0) {
      await db.createCollection(COLLECTION);
    }

    const scans = db.collection(COLLECTION);
    const indexes = await scans.indexes();
    const hasIndex = (expected: Record<string, number>) =>
      indexes.some((index) => {
        const actual = index.key as Record<string, number>;
        const expectedEntries = Object.entries(expected);
        return (
          Object.keys(actual).length === expectedEntries.length &&
          expectedEntries.every(([key, value]) => actual[key] === value)
        );
      });

    if (!hasIndex({ user_id: 1, created_at: -1 })) {
      await scans.createIndex(
        { user_id: 1, created_at: -1 },
        { name: 'PlantScanUserHistoryIndex' },
      );
    }
    if (!hasIndex({ p_hash: 1, status: 1 })) {
      await scans.createIndex(
        { p_hash: 1, status: 1 },
        { name: 'PlantScanCacheLookupIndex' },
      );
    }
  },

  async down(connection: mongoose.Connection): Promise<void> {
    const db = connection.db;
    if (!db) return;

    const scans = db.collection(COLLECTION);
    const indexes = await scans.indexes();
    const names = new Set(indexes.map((index) => index.name));
    if (names.has('PlantScanUserHistoryIndex')) {
      await scans.dropIndex('PlantScanUserHistoryIndex');
    }
    if (names.has('PlantScanCacheLookupIndex')) {
      await scans.dropIndex('PlantScanCacheLookupIndex');
    }
  },
};
