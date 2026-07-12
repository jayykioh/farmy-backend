import {
  Injectable,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { IdempotencyExecutionDocument } from '../../infrastructure/persistence/idempotency-execution.schema';

@Injectable()
export class IdempotencyExecutionService {
  constructor(
    @InjectModel(IdempotencyExecutionDocument.name)
    private readonly executionModel: Model<IdempotencyExecutionDocument>,
  ) {}

  async acquireOrTakeoverLock(
    userId: string,
    idempotencyKey: string,
    requestHash: string,
    leaseSeconds: number = 30,
  ): Promise<IdempotencyExecutionDocument> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000);
    const ownerToken = crypto.randomUUID();

    const existing = await this.executionModel
      .findOne({ userId, idempotencyKey })
      .exec();

    if (!existing) {
      try {
        const execution = new this.executionModel({
          userId,
          idempotencyKey,
          requestHash,
          status: 'processing',
          ownerToken,
          leaseUntil,
          heartbeatAt: now,
          attemptCount: 1,
          uploadedKeys: [],
        });
        return await execution.save();
      } catch (error: any) {
        if (error.code === 11000) {
          return this.acquireOrTakeoverLock(
            userId,
            idempotencyKey,
            requestHash,
            leaseSeconds,
          );
        }
        throw error;
      }
    }

    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        message: 'Idempotency key already used with different payload',
        errorCode: 'IDEMPOTENCY_KEY_REUSED',
      });
    }

    if (existing.status === 'completed') {
      return existing;
    }

    if (existing.status === 'processing' && existing.leaseUntil > now) {
      throw new HttpException(
        {
          message: 'Request in progress',
          errorCode: 'IDEMPOTENCY_IN_PROGRESS',
        },
        HttpStatus.CONFLICT,
      );
    }

    const updated = await this.executionModel
      .findOneAndUpdate(
        {
          _id: existing._id,
          status: existing.status,
          ownerToken: existing.ownerToken,
        },
        {
          $set: {
            status: 'processing',
            ownerToken,
            leaseUntil,
            heartbeatAt: now,
          },
          $inc: { attemptCount: 1 },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new HttpException(
        {
          message: 'Concurrent lock takeover conflict',
          errorCode: 'IDEMPOTENCY_IN_PROGRESS',
        },
        HttpStatus.CONFLICT,
      );
    }

    return updated;
  }
}
