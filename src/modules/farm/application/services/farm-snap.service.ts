import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  FarmSnapDocument,
  SnapCondition,
} from '../../infrastructure/persistence/farm-snap.schema';
import {
  SnapReactionDocument,
  SnapReactionType,
} from '../../infrastructure/persistence/snap-reaction.schema';
import { SnapCommentDocument } from '../../infrastructure/persistence/snap-comment.schema';
import { UserDocument } from '../../../auth/infrastructure/persistence/user.schema';
import { CreateSnapDto } from '../../interface/dtos/create-snap.dto';
import { CreateSnapCommentDto } from '../../interface/dtos/create-snap-comment.dto';

const REACTION_TYPES: SnapReactionType[] = [
  'like',
  'helpful',
  'worry',
  'celebrate',
];

export type FeedQuery = {
  limit?: string;
  cursor?: string;
  condition?: SnapCondition;
  mine?: string;
};

@Injectable()
export class FarmSnapService {
  constructor(
    @InjectModel(FarmSnapDocument.name)
    private readonly snapModel: Model<FarmSnapDocument>,
    @InjectModel(SnapReactionDocument.name)
    private readonly reactionModel: Model<SnapReactionDocument>,
    @InjectModel(SnapCommentDocument.name)
    private readonly commentModel: Model<SnapCommentDocument>,
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(userId: string, dto: CreateSnapDto) {
    const snap = new this.snapModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      image_url: dto.imageUrl,
      caption: dto.caption?.trim() || undefined,
      crop_type: dto.cropType,
      condition: dto.condition,
      condition_note: dto.conditionNote?.trim() || undefined,
      location: dto.location,
      weather: dto.weather,
      captured_at: new Date(dto.capturedAt),
      xp_earned: 10,
      is_public: dto.isPublic ?? true,
      is_flagged: false,
    });

    const savedSnap = await snap.save();
    return this.toSnapDto(savedSnap, userId);
  }

  async findFeed(userId: string, query: FeedQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
    const filter: Record<string, unknown> = {
      is_public: true,
      is_flagged: false,
      deleted_at: { $exists: false },
    };

    if (query.condition) filter.condition = query.condition;
    if (query.mine === 'true') filter.user_id = userId;
    if (query.cursor) filter.created_at = { $lt: new Date(query.cursor) };

    const snaps = await this.snapModel
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit + 1)
      .exec();

    const page = snaps.slice(0, limit);
    const data = await Promise.all(
      page.map((snap) => this.toSnapDto(snap, userId)),
    );

    return {
      data,
      nextCursor:
        snaps.length > limit
          ? page[page.length - 1]?.created_at?.toISOString()
          : null,
    };
  }

  async findOne(userId: string, snapId: string) {
    const snap = await this.findVisibleSnap(snapId, userId);
    const dto = await this.toSnapDto(snap, userId);
    const comments = await this.findComments(userId, snapId);
    return { ...dto, comments };
  }

  async toggleReaction(userId: string, snapId: string, type: SnapReactionType) {
    await this.findVisibleSnap(snapId, userId);

    const existing = await this.reactionModel
      .findOne({ snap_id: snapId, user_id: userId, type })
      .exec();

    if (existing) {
      await this.reactionModel.deleteOne({ _id: existing._id }).exec();
    } else {
      await new this.reactionModel({
        _id: crypto.randomUUID(),
        snap_id: snapId,
        user_id: userId,
        type,
      }).save();
    }

    return this.getReactions(snapId, userId);
  }

  async findComments(userId: string, snapId: string) {
    await this.findVisibleSnap(snapId, userId);

    const comments = await this.commentModel
      .find({ snap_id: snapId })
      .sort({ created_at: 1 })
      .exec();

    const users = await this.getUsersByIds(
      comments.map((comment) => comment.user_id),
    );

    return comments.map((comment) => ({
      id: comment._id,
      userId: comment.user_id,
      userName: users.get(comment.user_id)?.name ?? 'Nhà nông Farmy',
      userAvatar: users.get(comment.user_id)?.avatar_url,
      content: comment.content,
      createdAt: comment.created_at?.toISOString(),
    }));
  }

  async createComment(
    userId: string,
    snapId: string,
    dto: CreateSnapCommentDto,
  ) {
    await this.findVisibleSnap(snapId, userId);

    const comment = await new this.commentModel({
      _id: crypto.randomUUID(),
      snap_id: snapId,
      user_id: userId,
      content: dto.content.trim(),
    }).save();

    const user = await this.userModel.findById(userId).exec();

    return {
      id: comment._id,
      userId,
      userName: user?.name ?? 'Nhà nông Farmy',
      userAvatar: user?.avatar_url,
      content: comment.content,
      createdAt: comment.created_at?.toISOString(),
    };
  }

  async remove(userId: string, snapId: string) {
    const snap = await this.snapModel.findById(snapId).exec();
    if (!snap) throw new NotFoundException('Không tìm thấy snap!');
    if (snap.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa snap này!');
    }

    snap.deleted_at = new Date();
    await snap.save();
  }

  private async findVisibleSnap(snapId: string, userId: string) {
    const snap = await this.snapModel.findById(snapId).exec();
    if (!snap || snap.deleted_at || snap.is_flagged) {
      throw new NotFoundException('Không tìm thấy snap!');
    }
    if (!snap.is_public && snap.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem snap này!');
    }
    return snap;
  }

  private async toSnapDto(snap: FarmSnapDocument, userId: string) {
    const [user, reactions, commentCount] = await Promise.all([
      this.userModel.findById(snap.user_id).exec(),
      this.getReactions(snap._id, userId),
      this.commentModel.countDocuments({ snap_id: snap._id }).exec(),
    ]);

    return {
      id: snap._id,
      userId: snap.user_id,
      userName: user?.name ?? 'Nhà nông Farmy',
      userAvatar: user?.avatar_url,
      imageUrl: snap.image_url,
      caption: snap.caption,
      cropType: snap.crop_type,
      condition: snap.condition,
      conditionNote: snap.condition_note,
      location: snap.location,
      weather: snap.weather,
      capturedAt: snap.captured_at.toISOString(),
      xpEarned: snap.xp_earned,
      reactions,
      commentCount,
      createdAt: snap.created_at?.toISOString(),
    };
  }

  private async getReactions(snapId: string, userId: string) {
    const reactions = await this.reactionModel.find({ snap_id: snapId }).exec();

    return REACTION_TYPES.map((type) => ({
      type,
      count: reactions.filter((reaction) => reaction.type === type).length,
      userReacted: reactions.some(
        (reaction) => reaction.type === type && reaction.user_id === userId,
      ),
    }));
  }

  private async getUsersByIds(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)];
    const users = await this.userModel.find({ _id: { $in: uniqueIds } }).exec();
    return new Map(users.map((user) => [user._id, user]));
  }
}
