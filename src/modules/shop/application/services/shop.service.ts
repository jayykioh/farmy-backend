import { Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ShopItemDocument, ShopItemCategory } from '../../infrastructure/persistence/shop-item.schema';
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
          image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAzSmV6cdrTVHzXBG0N7bXXKN3XoZOzRMPXfVSxi0cvLV86eZCvMCQUZfvsIwGmGFQCrdkVZZ0fPQlcFxA7lT7026GIQqk5q37hMvRuTScXcwmvL2MxEFkY_EjgDBSeSHb7xTRqUPbj1MRY_BqwkhLCcAZ36PrGji9H9EPDb67uNr4UmWBqmiirxAhuuidfFZvbiQYTWZytovpLIpFDBOt949vcQkwFPZijhl9qeWhHM_-dZdg6jkw_Rc8N5-0j2r42RYKLnkeCUeC1'
        },
        {
          _id: randomUUID(),
          name: 'Mũ Rơm Đi Biển',
          category: ShopItemCategory.HAT,
          price: 450,
          required_level: 2,
          image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARFPmbrP2z0o6zbdd7uP-bPyY-SYnnTKkCOADA4RXRYqu2DrDeYGWguF5cykN1-ipwc2P6p6Cdq96yLVJvgR1oqfJAvNSKCfqQBg_SSujhyLfnD2BgmghulIgXOt3-E7AF3ZQncims2yYMtwOubGUkLpo2UYElzRRbTXkWTIi2CCPypLVhBOKihE9dsp9a2IqHkXPe3bJtg8mF2y3G-fvmq7x0mHfYBvnuEy3WPQy9N0Eg5LVtORi1oHeGPGOIlDBT-CRD8PEElFRL'
        },
        {
          _id: randomUUID(),
          name: 'Kính Râm Ngầu',
          category: ShopItemCategory.HAT,
          price: 200,
          required_level: 1,
          image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC9cOVVDdur_i-PyVaZ5wgi_eWdCMep-I4DMSFJWI7uVcGdz5kFluH_59odvnj3HLiPOr8nZO2JAQhoVYU_T8hJ1ZPy0aL2Ufn-32LWyqO_inFt5Xk9aP1MUiR-l1odRI2kNKJ0blEaFsLoV6MGeYjhWz0QNUtERuxYcgICpIbiSQdTgCdjb_5N5Ao-tMDNIi23DK2xmSunDTB3D4fvQgPX_QpgYfxiugGxZTJPeTFFA7qBvhkQeo0NVUo4nMaeFLa6r96NpTBGOJaY'
        },
        {
          _id: randomUUID(),
          name: 'Mũ Ảo Thuật',
          category: ShopItemCategory.HAT,
          price: 800,
          required_level: 5,
          image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAzSmV6cdrTVHzXBG0N7bXXKN3XoZOzRMPXfVSxi0cvLV86eZCvMCQUZfvsIwGmGFQCrdkVZZ0fPQlcFxA7lT7026GIQqk5q37hMvRuTScXcwmvL2MxEFkY_EjgDBSeSHb7xTRqUPbj1MRY_BqwkhLCcAZ36PrGji9H9EPDb67uNr4UmWBqmiirxAhuuidfFZvbiQYTWZytovpLIpFDBOt949vcQkwFPZijhl9qeWhHM_-dZdg6jkw_Rc8N5-0j2r42RYKLnkeCUeC1' // Same image as non-la for demo purposes, since it was locked
        }
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

    return { success: true, newExp: petState.xp, ownedItems: petState.owned_items };
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
      _id: { $in: petState.equipped_items }
    });

    // Filter out items of the same category
    petState.equipped_items = petState.equipped_items.filter(equippedId => {
      const equippedItem = currentlyEquippedItems.find(i => i._id === equippedId);
      return equippedItem?.category !== item.category;
    });

    // If it wasn't already equipped, we add it. If it was, we just leave it filtered out (unequip toggle).
    const wasAlreadyEquipped = currentlyEquippedItems.some(i => i._id === itemId);
    if (!wasAlreadyEquipped) {
      petState.equipped_items.push(itemId);
    }

    await petState.save();

    return { success: true, equippedItems: petState.equipped_items };
  }
}
