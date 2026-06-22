import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeSourceDocument } from './knowledge-source.schema';

@Injectable()
export class KnowledgeRepository {
  constructor(
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
  ) {}

  async findByIds(ids: string[]): Promise<KnowledgeSourceDocument[]> {
    return this.knowledgeModel.find({
      _id: { $in: ids }
    }).exec();
  }

  async findById(id: string): Promise<KnowledgeSourceDocument | null> {
    return this.knowledgeModel.findById(id).exec();
  }
}
