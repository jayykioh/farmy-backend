/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { R2StorageService } from './r2-storage.service';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mocking AWS S3 SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('R2StorageService', () => {
  let service: R2StorageService;
  let mockS3ClientInstance: any;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'R2_ACCOUNT_ID':
          return 'test-account-id';
        case 'R2_ACCESS_KEY_ID':
          return 'test-access-key-id';
        case 'R2_SECRET_ACCESS_KEY':
          return 'test-secret-access-key';
        case 'R2_BUCKET_NAME':
          return 'test-bucket-name';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    mockS3ClientInstance = {
      send: jest.fn(),
    } as any;

    (S3Client as jest.Mock).mockImplementation(() => mockS3ClientInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2StorageService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<R2StorageService>(R2StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should successfully upload a file buffer and return the key', async () => {
      const fileBuffer = Buffer.from('test file data');
      const key = 'uploads/test.txt';
      const contentType = 'text/plain';

      mockS3ClientInstance.send.mockResolvedValueOnce({} as any);

      const result = await service.uploadFile(fileBuffer, key, contentType);

      expect(result).toBe(key);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket-name',
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });
      expect(mockS3ClientInstance.send).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if s3Client.send fails', async () => {
      const fileBuffer = Buffer.from('test file data');
      const key = 'uploads/test.txt';
      const contentType = 'text/plain';
      const mockError = new Error('R2 Upload Failed');

      mockS3ClientInstance.send.mockRejectedValueOnce(mockError);

      await expect(
        service.uploadFile(fileBuffer, key, contentType),
      ).rejects.toThrow(mockError);
      expect(mockS3ClientInstance.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSignedUrl', () => {
    it('should generate a signed URL successfully', async () => {
      const key = 'uploads/test.txt';
      const mockUrl = 'https://signed-url.com/uploads/test.txt';

      (getSignedUrl as jest.Mock).mockResolvedValueOnce(mockUrl);

      const result = await service.getSignedUrl(key, 3600);

      expect(result).toBe(mockUrl);
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket-name',
        Key: key,
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3ClientInstance,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
    });

    it('should default to 3600 seconds expiration if not provided', async () => {
      const key = 'uploads/test.txt';
      const mockUrl = 'https://signed-url.com/uploads/test.txt';

      (getSignedUrl as jest.Mock).mockResolvedValueOnce(mockUrl);

      const result = await service.getSignedUrl(key);

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3ClientInstance,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
    });

    it('should throw an error if getSignedUrl function throws', async () => {
      const key = 'uploads/test.txt';
      const mockError = new Error('Signing Failed');

      (getSignedUrl as jest.Mock).mockRejectedValueOnce(mockError);

      await expect(service.getSignedUrl(key)).rejects.toThrow(mockError);
    });
  });

  describe('deleteFile', () => {
    it('should successfully delete a file', async () => {
      const key = 'uploads/test.txt';

      mockS3ClientInstance.send.mockResolvedValueOnce({} as any);

      await service.deleteFile(key);

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket-name',
        Key: key,
      });
      expect(mockS3ClientInstance.send).toHaveBeenCalledTimes(1);
    });

    it('should throw an error if delete command fails', async () => {
      const key = 'uploads/test.txt';
      const mockError = new Error('R2 Delete Failed');

      mockS3ClientInstance.send.mockRejectedValueOnce(mockError);

      await expect(service.deleteFile(key)).rejects.toThrow(mockError);
      expect(mockS3ClientInstance.send).toHaveBeenCalledTimes(1);
    });
  });
});
