import * as crypto from 'crypto';

export type DiaryHashInput = {
  diaryId: string;
  activityType: string;
  content: string;
  diaryDate: string | Date;
  cropType?: string | null;
  imageDigests?: string[] | null;
};

type CanonicalValue =
  | string
  | number
  | boolean
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const normalizeValue = (value: unknown): CanonicalValue | undefined => {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeValue(item))
      .filter((item): item is CanonicalValue => item !== undefined);
  }
  if (typeof value === 'object') {
    return canonicalizeObject(value as Record<string, unknown>);
  }
  return undefined;
};

const canonicalizeObject = (input: Record<string, unknown>): { [key: string]: CanonicalValue } => {
  return Object.keys(input)
    .sort((a, b) => a.localeCompare(b, 'en-US'))
    .reduce<{ [key: string]: CanonicalValue }>((result, key) => {
      const value = normalizeValue(input[key]);
      if (value !== undefined) {
        result[key] = value;
      }
      return result;
    }, {});
};

export const buildCanonicalDiaryPayload = (input: DiaryHashInput) => {
  return canonicalizeObject({
    diaryId: input.diaryId,
    activityType: input.activityType,
    content: input.content,
    diaryDate: new Date(input.diaryDate).toISOString(),
    cropType: input.cropType,
    imageDigests: input.imageDigests ?? [],
  });
};

export const buildCanonicalDiaryJson = (input: DiaryHashInput): string => {
  return JSON.stringify(buildCanonicalDiaryPayload(input));
};

export const createDiaryRequestHash = (input: DiaryHashInput): string => {
  return crypto.createHash('sha256').update(buildCanonicalDiaryJson(input), 'utf8').digest('hex');
};
