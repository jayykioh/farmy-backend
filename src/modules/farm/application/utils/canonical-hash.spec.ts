import { buildCanonicalDiaryJson, createDiaryRequestHash } from './canonical-hash';

describe('canonical-hash', () => {
  it('builds the canonical JSON fixture with A-Z keys and NFC text', () => {
    const json = buildCanonicalDiaryJson({
      diaryId: 'diary-1',
      activityType: 'Tưới nước', // NFD
      content: 'Café cây lúa', // NFD
      diaryDate: '2026-07-12T03:30:00.000Z',
      cropType: 'Lúa', // NFD
      imageDigests: ['abc', 'def'],
    });

    expect(json).toBe(
      '{"activityType":"Tưới nước","content":"Café cây lúa","cropType":"Lúa","diaryDate":"2026-07-12T03:30:00.000Z","diaryId":"diary-1","imageDigests":["abc","def"]}',
    );
  });

  it('matches the shared SHA-256 lowercase hex fixture', () => {
    const hash = createDiaryRequestHash({
      diaryId: 'diary-1',
      activityType: 'Tưới nước',
      content: 'Café cây lúa',
      diaryDate: new Date('2026-07-12T03:30:00.000Z'),
      cropType: 'Lúa',
      imageDigests: ['abc', 'def'],
    });

    expect(hash).toBe('751d61c46cb61b9a2655ec3da754a50d2fe5be31da64d776f75b8333d732ba36');
  });
});
