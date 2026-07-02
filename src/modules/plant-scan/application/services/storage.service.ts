import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appConfig } from '../../../../config/app.config';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    const cfg = appConfig();
    this.bucketName = cfg.r2.bucketName;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.r2.accessKeyId,
        secretAccessKey: cfg.r2.secretAccessKey,
      },
    });
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.debug(`Successfully uploaded to R2: ${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload to R2: ${key}`, error);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      this.logger.debug(`Successfully deleted from R2: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete from R2: ${key}`, error);
      // Best-effort deletion, we do not strictly throw here
    }
  }

  async generateSignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for: ${key}`, error);
      throw error;
    }
  }
}
