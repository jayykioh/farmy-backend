import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../domain/user.aggregate';
import { Email } from '../../domain/value-objects/email.value-object';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { UserDocument } from './user.schema';

@Injectable()
export class MongooseUserRepository implements IUserRepository {
  constructor(
    @InjectModel(UserDocument.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findById(id: string): Promise<User | null> {
    const userDoc = await this.userModel.findById(id).exec();
    if (!userDoc) {
      return null;
    }
    return this.toDomain(userDoc);
  }

  async findByEmail(email: string): Promise<User | null> {
    const userDoc = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .exec();
    if (!userDoc) {
      return null;
    }
    return this.toDomain(userDoc);
  }

  async save(user: User): Promise<void> {
    await this.userModel
      .findByIdAndUpdate(user.getId(), {
        email: user.getEmail(),
        passwordHash: user.getPasswordHash(),
        name: user.getName(),
        role: user.getRole(),
      })
      .exec();
  }

  async create(user: User): Promise<void> {
    const newUser = new this.userModel({
      _id: user.getId(),
      email: user.getEmail(),
      passwordHash: user.getPasswordHash(),
      name: user.getName(),
      role: user.getRole(),
    });
    await newUser.save();
  }

  private toDomain(doc: UserDocument): User {
    return new User(
      doc._id.toString(),
      Email.create(doc.email),
      doc.passwordHash,
      doc.name,
      doc.role,
    );
  }
}
