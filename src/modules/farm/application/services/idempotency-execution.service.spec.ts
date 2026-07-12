import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { IdempotencyExecutionService } from './idempotency-execution.service';
import { IdempotencyExecutionDocument } from '../../infrastructure/persistence/idempotency-execution.schema';
import { ConflictException, HttpException } from '@nestjs/common';

describe('IdempotencyExecutionService', () => {
  let service: IdempotencyExecutionService;
  let mockExecutionModel: any;

  beforeEach(async () => {
    mockExecutionModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    mockExecutionModel.prototype.save = jest.fn();

    // Mock constructor for new this.executionModel()
    const ModelClass = function(this: any, data: any) {
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
    };
    ModelClass.findOne = mockExecutionModel.findOne;
    ModelClass.findOneAndUpdate = mockExecutionModel.findOneAndUpdate;
    ModelClass.create = mockExecutionModel.create;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyExecutionService,
        {
          provide: getModelToken(IdempotencyExecutionDocument.name),
          useValue: ModelClass,
        },
      ],
    }).compile();

    service = module.get<IdempotencyExecutionService>(IdempotencyExecutionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('acquireOrTakeoverLock', () => {
    it('creates new lock if none exists', async () => {
      mockExecutionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.acquireOrTakeoverLock('user-1', 'key-1', 'hash-1');
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe('processing');
      expect(result.attemptCount).toBe(1);
    });

    it('returns completed execution directly', async () => {
      const completedDoc = { status: 'completed', requestHash: 'hash-1' };
      mockExecutionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(completedDoc) });

      const result = await service.acquireOrTakeoverLock('user-1', 'key-1', 'hash-1');
      expect(result).toBe(completedDoc);
    });

    it('throws IDEMPOTENCY_KEY_REUSED if hash differs', async () => {
      const existingDoc = { status: 'processing', requestHash: 'different-hash' };
      mockExecutionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingDoc) });

      await expect(service.acquireOrTakeoverLock('user-1', 'key-1', 'hash-1'))
        .rejects.toThrow(ConflictException);
    });

    it('throws IDEMPOTENCY_IN_PROGRESS if processing and lease is active', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 10000);
      const existingDoc = { status: 'processing', requestHash: 'hash-1', leaseUntil: future };
      mockExecutionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingDoc) });

      await expect(service.acquireOrTakeoverLock('user-1', 'key-1', 'hash-1'))
        .rejects.toThrow(HttpException);
    });

    it('takes over lock if processing but lease expired', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);
      const existingDoc = { _id: 'doc-1', status: 'processing', requestHash: 'hash-1', leaseUntil: past, ownerToken: 'old-token' };
      mockExecutionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingDoc) });

      const updatedDoc = { _id: 'doc-1', status: 'processing', ownerToken: 'new-token' };
      mockExecutionModel.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedDoc) });

      const result = await service.acquireOrTakeoverLock('user-1', 'key-1', 'hash-1');
      expect(result).toBe(updatedDoc);
      expect(mockExecutionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'doc-1', status: 'processing', ownerToken: 'old-token' },
        expect.any(Object),
        { new: true }
      );
    });
  });
});
