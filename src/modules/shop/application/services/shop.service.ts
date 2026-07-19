import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  ShopItemDocument,
  ShopItemCategory,
} from '../../infrastructure/persistence/shop-item.schema';
import { PetStateDocument } from '../../../pet/infrastructure/persistence/pet-state.schema';

@Injectable()
export class ShopService implements OnModuleInit {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    @InjectModel(ShopItemDocument.name)
    private readonly shopItemModel: Model<ShopItemDocument>,
    @InjectModel(PetStateDocument.name)
    private readonly petStateModel: Model<PetStateDocument>,
  ) {}

  async onModuleInit() {
    await this.seedItems();
  }

  private async seedItems() {
    const count = await this.shopItemModel.countDocuments();
    if (count === 0) {
      this.logger.log('Seeding initial shop items...');
      const seedItems = [
        {
          _id: randomUUID(),
          name: 'Nón Lá Truyền Thống',
          category: ShopItemCategory.HAT,
          price: 300,
          required_level: 1,
          image_url: '/shop/non-la.svg',
          anchor: { width: '90%', top: '-15%' },
        },
        {
          _id: randomUUID(),
          name: 'Mũ Rơm Đi Biển',
          category: ShopItemCategory.HAT,
          price: 450,
          required_level: 2,
          image_url: '/shop/mu-rom.svg',
          anchor: { width: '80%', top: '-15%' },
        },
        {
          _id: randomUUID(),
          name: 'Kính Râm Ngầu',
          category: ShopItemCategory.HAT,
          price: 200,
          required_level: 1,
          image_url: '/shop/kinh-ram.svg',
          anchor: { width: '60%', top: '40%' },
        },
        {
          _id: randomUUID(),
          name: 'Mũ Ảo Thuật',
          category: ShopItemCategory.HAT,
          price: 800,
          required_level: 5,
          image_url: '/shop/mu-ao-thuat.svg',
          anchor: { width: '65%', top: '-25%' },
        },
        {
          _id: randomUUID(),
          name: 'Khăn Quàng Đỏ',
          category: ShopItemCategory.OUTFIT,
          price: 350,
          required_level: 3,
          image_url: '/shop/khan-quang.svg',
          anchor: { width: '70%', top: '70%' },
        },
        {
          _id: randomUUID(),
          name: 'Vương Miện',
          category: ShopItemCategory.HAT,
          price: 1500,
          required_level: 10,
          image_url: '/shop/vuong-mien.svg',
          anchor: { width: '50%', top: '-10%' },
        },
        {
          _id: randomUUID(),
          name: 'Kính Cận',
          category: ShopItemCategory.HAT,
          price: 250,
          required_level: 2,
          image_url: '/shop/kinh-can.svg',
          anchor: { width: '60%', top: '40%' },
        },
        {
          _id: randomUUID(),
          name: 'Cánh Thiên Thần',
          category: ShopItemCategory.BACKGROUND,
          price: 2000,
          required_level: 15,
          image_url: '/shop/canh-thien-than.svg',
          anchor: {
            width: '140%',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 0,
          },
        },
        {
          _id: randomUUID(),
          name: 'Vòng Hào Quang',
          category: ShopItemCategory.HAT,
          price: 3000,
          required_level: 20,
          image_url: '/shop/halo.svg',
          anchor: {
            width: '40%',
            top: '-20%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 5,
          },
        },
        {
          _id: randomUUID(),
          name: 'Dây Chuyền Vàng',
          category: ShopItemCategory.OUTFIT,
          price: 1200,
          required_level: 8,
          image_url: '/shop/gold-chain.svg',
          anchor: {
            width: '50%',
            top: '65%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 4,
          },
        },
        {
          _id: randomUUID(),
          name: 'Đám Mây Mưa',
          category: ShopItemCategory.EFFECT,
          price: 800,
          required_level: 6,
          image_url: '/shop/rain-cloud.svg',
          anchor: {
            width: '90%',
            top: '-30%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 6,
          },
        },
        {
          _id: randomUUID(),
          name: 'Áo Choàng Siêu Nhân',
          category: ShopItemCategory.BACKGROUND,
          price: 2500,
          required_level: 18,
          image_url: '/shop/superman-cape.svg',
          anchor: {
            width: '120%',
            top: '35%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 0,
          },
        },
      ];
      await this.shopItemModel.insertMany(seedItems);
      this.logger.log('Shop items seeded successfully.');
    }
  }

  async getItems() {
    return this.shopItemModel.find().lean();
  }

  async buyItem(userId: string, itemId: string) {
    const item = await this.shopItemModel.findById(itemId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy phụ kiện');
    }

    const petState = await this.petStateModel.findOne({ user_id: userId });
    if (!petState) {
      throw new NotFoundException('Không tìm thấy trạng thái thú cưng');
    }

    if (petState.level < item.required_level) {
      throw new BadRequestException('Chưa đủ cấp độ để mua phụ kiện này');
    }

    if (petState.owned_items?.includes(itemId)) {
      throw new BadRequestException('Bạn đã sở hữu phụ kiện này rồi');
    }

    if (petState.xp < item.price) {
      throw new BadRequestException('Không đủ XP để mua phụ kiện này');
    }

    // Deduct XP and add to owned items
    petState.xp -= item.price;
    if (!petState.owned_items) petState.owned_items = [];
    petState.owned_items.push(itemId);
    await petState.save();

    return {
      success: true,
      newExp: petState.xp,
      ownedItems: petState.owned_items,
    };
  }

  async equipItem(userId: string, itemId: string) {
    const item = await this.shopItemModel.findById(itemId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy phụ kiện');
    }

    const petState = await this.petStateModel.findOne({ user_id: userId });
    if (!petState) {
      throw new NotFoundException('Không tìm thấy trạng thái thú cưng');
    }

    if (!petState.owned_items?.includes(itemId)) {
      throw new BadRequestException('Bạn chưa sở hữu phụ kiện này');
    }

    if (!petState.equipped_items) {
      petState.equipped_items = [];
    }

    // Remove any currently equipped items in the same category
    // This requires us to know the categories of currently equipped items
    const currentlyEquippedItems = await this.shopItemModel.find({
      _id: { $in: petState.equipped_items },
    });

    // Filter out items of the same category
    petState.equipped_items = petState.equipped_items.filter((equippedId) => {
      const equippedItem = currentlyEquippedItems.find(
        (i) => i._id === equippedId,
      );
      return equippedItem?.category !== item.category;
    });

    // If it wasn't already equipped, we add it. If it was, we just leave it filtered out (unequip toggle).
    const wasAlreadyEquipped = currentlyEquippedItems.some(
      (i) => i._id === itemId,
    );
    if (!wasAlreadyEquipped) {
      petState.equipped_items.push(itemId);
    }

    await petState.save();

    return { success: true, equippedItems: petState.equipped_items };
  }

  async createItem(dto: {
    name: string;
    category: ShopItemCategory;
    price: number;
    required_level: number;
    image_url: string;
    anchor?: any;
  }) {
    const item = new this.shopItemModel({
      _id: randomUUID(),
      ...dto,
    });
    await item.save();
    return item;
  }

  async updateItem(
    id: string,
    dto: {
      name?: string;
      category?: ShopItemCategory;
      price?: number;
      required_level?: number;
      image_url?: string;
      anchor?: any;
    },
  ) {
    const item = await this.shopItemModel.findById(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy phụ kiện');
    }
    Object.assign(item, dto);
    await item.save();
    return item;
  }

  async deleteItem(id: string) {
    const item = await this.shopItemModel.findById(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy phụ kiện');
    }
    await this.shopItemModel.findByIdAndDelete(id).exec();
    return { success: true };
  }
}
