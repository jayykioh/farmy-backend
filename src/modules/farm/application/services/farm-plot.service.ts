import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { FarmPlotDocument } from '../../infrastructure/persistence/farm-plot.schema';
import { CreatePlotDto } from '../../interface/dtos/create-plot.dto';
import { UpdatePlotDto } from '../../interface/dtos/update-plot.dto';

@Injectable()
export class FarmPlotService {
  constructor(
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
  ) {}

  async create(userId: string, dto: CreatePlotDto): Promise<FarmPlotDocument> {
    const plot = new this.farmPlotModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      name: dto.name,
      area_size: dto.area_size,
      description: dto.description,
    });
    return plot.save();
  }

  async findAll(userId: string): Promise<FarmPlotDocument[]> {
    return this.farmPlotModel.find({ user_id: userId }).exec();
  }

  async findOne(userId: string, id: string): Promise<FarmPlotDocument> {
    const plot = await this.farmPlotModel.findById(id).exec();
    if (!plot) {
      throw new NotFoundException('Không tìm thấy mảnh vườn!');
    }
    if (plot.user_id !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập mảnh vườn này!',
      );
    }
    return plot;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdatePlotDto,
  ): Promise<FarmPlotDocument> {
    const plot = await this.findOne(userId, id);

    if (dto.name !== undefined) plot.name = dto.name;
    if (dto.area_size !== undefined) plot.area_size = dto.area_size;
    if (dto.description !== undefined) plot.description = dto.description;

    return plot.save();
  }

  async remove(userId: string, id: string): Promise<void> {
    const plot = await this.findOne(userId, id);
    await this.farmPlotModel.deleteOne({ _id: plot._id }).exec();
  }
}
