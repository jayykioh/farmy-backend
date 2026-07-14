import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ShopService } from '../../application/services/shop.service';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';

@Controller('api/v1/shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('items')
  async getItems() {
    const items = await this.shopService.getItems();
    return {
      success: true,
      data: items,
    };
  }

  @Post('buy')
  async buyItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body('itemId') itemId: string,
  ) {
    const result = await this.shopService.buyItem(user.id, itemId);
    return {
      success: true,
      message: 'Mua phụ kiện thành công',
      data: result,
    };
  }

  @Post('equip')
  async equipItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body('itemId') itemId: string,
  ) {
    const result = await this.shopService.equipItem(user.id, itemId);
    return {
      success: true,
      message: 'Thay đổi trang bị thành công',
      data: result,
    };
  }
}
