import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from '../../application/services/admin.service';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { ShopService } from '../../../shop/application/services/shop.service';

@Controller('api/v1/admin')
@Roles('admin', 'moderator')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly shopService: ShopService,
  ) {}

  @Get('stats')
  async getStats() {
    const data = await this.adminService.getStats();
    return { success: true, data };
  }

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    const data = await this.adminService.getUsers(
      p,
      l,
      search || '',
      role || '',
    );
    return { success: true, data };
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body('role') role: string,
  ) {
    const data = await this.adminService.updateUserRole(userId, role);
    return { success: true, data };
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') userId: string) {
    const data = await this.adminService.deleteUser(userId);
    return { success: true, data };
  }

  @Get('rag/sessions')
  async getChatSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    const data = await this.adminService.getChatSessions(p, l);
    return { success: true, data };
  }

  @Get('rag/files')
  async getRAGFiles() {
    const data = await this.adminService.getRAGFiles();
    return { success: true, data };
  }

  @Delete('rag/files/:id')
  async deleteRAGFile(@Param('id') fileId: string) {
    const data = await this.adminService.deleteRAGFile(fileId);
    return { success: true, data };
  }

  @Get('scans')
  async getScans(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    const data = await this.adminService.getScans(p, l);
    return { success: true, data };
  }

  @Get('config')
  async getSystemConfig() {
    const data = this.adminService.getSystemConfig();
    return { success: true, data };
  }

  @Post('config')
  async updateSystemConfig(
    @Body() config: { maintenanceMode?: boolean; rateLimit?: number },
  ) {
    const data = this.adminService.updateSystemConfig(config);
    return { success: true, data };
  }

  @Get('reminders')
  async getReminders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    const data = await this.adminService.getReminders(p, l);
    return { success: true, data };
  }

  @Post('reminders/notify')
  async triggerManualNotification(
    @Body('userId') userId: string,
    @Body('title') title: string,
    @Body('body') body: string,
  ) {
    const data = await this.adminService.triggerManualNotification(
      userId,
      title,
      body,
    );
    return { success: true, data };
  }

  @Patch('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      currentPassword?: string;
      newPassword?: string;
      confirmNewPassword?: string;
    },
  ) {
    const data = await this.adminService.changePassword(user.id, body);
    return { success: true, data };
  }

  @Get('skins')
  async getSkins() {
    const data = await this.shopService.getItems();
    return { success: true, data };
  }

  @Post('skins')
  async createSkin(@Body() body: any) {
    const data = await this.shopService.createItem(body);
    return { success: true, data };
  }

  @Put('skins/:id')
  async updateSkin(@Param('id') id: string, @Body() body: any) {
    const data = await this.shopService.updateItem(id, body);
    return { success: true, data };
  }

  @Delete('skins/:id')
  async deleteSkin(@Param('id') id: string) {
    const data = await this.shopService.deleteItem(id);
    return { success: true, data };
  }
}
