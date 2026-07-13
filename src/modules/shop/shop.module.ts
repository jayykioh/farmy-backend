import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopItemDocument, ShopItemSchema } from './infrastructure/persistence/shop-item.schema';
import { PetStateDocument, PetStateSchema } from '../pet/infrastructure/persistence/pet-state.schema';
import { ShopService } from './application/services/shop.service';
import { ShopController } from './interface/controllers/shop.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopItemDocument.name, schema: ShopItemSchema },
      { name: PetStateDocument.name, schema: PetStateSchema },
    ]),
  ],
  controllers: [ShopController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
