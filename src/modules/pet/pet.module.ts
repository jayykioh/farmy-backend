import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PetStateDocument, PetStateSchema } from './infrastructure/persistence/pet-state.schema';
import { PetService } from './application/services/pet.service';
import { PetController } from './interface/controllers/pet.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PetStateDocument.name, schema: PetStateSchema },
    ]),
  ],
  controllers: [PetController],
  providers: [PetService],
  exports: [PetService],
})
export class PetModule {}
