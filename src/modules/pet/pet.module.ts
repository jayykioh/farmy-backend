import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PetStateDocument,
  PetStateSchema,
} from './infrastructure/persistence/pet-state.schema';
import { PetService } from './application/services/pet.service';
import { PetController } from './interface/controllers/pet.controller';

import {
  UserDocument,
  UserSchema,
} from '../auth/infrastructure/persistence/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PetStateDocument.name, schema: PetStateSchema },
      { name: UserDocument.name, schema: UserSchema },
    ]),
  ],
  controllers: [PetController],
  providers: [PetService],
  exports: [PetService],
})
export class PetModule {}
