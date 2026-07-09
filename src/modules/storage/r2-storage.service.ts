import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'R2_SECRET_ACCESS_KEY',
    );
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME', '');
    this.publicUrl = this.configService.get<string>('R2_PUBLIC_URL', '');

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucketName) {
      this.logger.warn(
        'Cloudflare R2 storage credentials are not fully configured. File operations may fail.',
      );
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  /**
   * Uploads a file buffer to Cloudflare R2 storage.
   * @param fileBuffer - The binary file contents.
   * @param key - The destination key (path/filename) in the bucket.
   * @param contentType - The MIME type of the file.
   * @returns The storage key of the uploaded file.
   */
  async uploadFile(
    fileBuffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully uploaded file to R2: ${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload file to R2: ${key}`, error);
      throw error;
    }
  }

  /**
   * Generates a temporary, time-limited presigned URL to download/view a private file.
   * @param key - The key of the file in the bucket.
   * @param expiresInSeconds - The validity duration in seconds (default is 3600s / 1 hour).
   * @returns The signed URL.
   */
  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
      return signedUrl;
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for key: ${key}`, error);
      throw error;
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      return getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error) {
      this.logger.error(`Failed to generate upload URL for key: ${key}`, error);
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    const normalizedBaseUrl = this.publicUrl.replace(/\/$/, '');
    const normalizedKey = key.replace(/^\//, '');
    return `${normalizedBaseUrl}/${normalizedKey}`;
  }

  /**
   * Deletes a file from Cloudflare R2 storage.
   * @param key - The key of the file to delete.
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`Successfully deleted file from R2: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from R2: ${key}`, error);
      throw error;
    }
  }
}
