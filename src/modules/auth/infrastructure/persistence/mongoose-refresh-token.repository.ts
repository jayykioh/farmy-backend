import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RefreshToken } from '../../domain/refresh-token.aggregate';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { RefreshTokenDocument } from './refresh-token.schema';

@Injectable()
export class MongooseRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(
    @InjectModel(RefreshTokenDocument.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async create(refreshToken: RefreshToken): Promise<void> {
    const doc = new this.refreshTokenModel({
      _id: refreshToken.getId(),
      token: refreshToken.getToken(),
      userId: refreshToken.getUserId(),
      familyId: refreshToken.getFamilyId(),
      isUsed: refreshToken.getIsUsed(),
      isRevoked: refreshToken.getIsRevoked(),
      expiresAt: refreshToken.getExpiresAt(),
    });
    await doc.save();
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const doc = await this.refreshTokenModel.findOne({ token }).exec();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc);
  }

  async save(refreshToken: RefreshToken): Promise<void> {
    await this.refreshTokenModel
      .findByIdAndUpdate(refreshToken.getId(), {
        token: refreshToken.getToken(),
        userId: refreshToken.getUserId(),
        familyId: refreshToken.getFamilyId(),
        isUsed: refreshToken.getIsUsed(),
        isRevoked: refreshToken.getIsRevoked(),
        expiresAt: refreshToken.getExpiresAt(),
      })
      .exec();
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany({ familyId }, { $set: { isRevoked: true } })
      .exec();
  }

  private toDomain(doc: RefreshTokenDocument): RefreshToken {
    return new RefreshToken(
      doc._id.toString(),
      doc.token,
      doc.userId,
      doc.familyId,
      doc.isUsed,
      doc.isRevoked,
      doc.expiresAt,
    );
  }
}
