import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
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
      token_hash: this.hashToken(refreshToken.getToken()),
      user_id: refreshToken.getUserId(),
      family_id: refreshToken.getFamilyId(),
      is_used: refreshToken.getIsUsed(),
      is_revoked: refreshToken.getIsRevoked(),
      expires_at: refreshToken.getExpiresAt(),
    });
    await doc.save();
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const doc = await this.refreshTokenModel
      .findOne({ token_hash: this.hashToken(token) })
      .exec();
    if (!doc) {
      return null;
    }
    return this.toDomain(doc);
  }

  async save(refreshToken: RefreshToken): Promise<void> {
    await this.refreshTokenModel
      .findByIdAndUpdate(refreshToken.getId(), {
        user_id: refreshToken.getUserId(),
        family_id: refreshToken.getFamilyId(),
        is_used: refreshToken.getIsUsed(),
        is_revoked: refreshToken.getIsRevoked(),
        expires_at: refreshToken.getExpiresAt(),
      })
      .exec();
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokenModel
      .updateMany({ family_id: familyId }, { $set: { is_revoked: true } })
      .exec();
  }

  private toDomain(doc: RefreshTokenDocument): RefreshToken {
    return new RefreshToken(
      doc._id.toString(),
      doc.token_hash,
      doc.user_id,
      doc.family_id,
      doc.is_used,
      doc.is_revoked,
      doc.expires_at,
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
