import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReminderService } from '../../application/services/reminder.service';
import { ReminderSchedulerService } from '../../application/services/reminder-scheduler.service';
import { CreateReminderDto } from '../dtos/create-reminder.dto';
import { UpdateReminderDto } from '../dtos/update-reminder.dto';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Public } from '../../../../common/decorators/public.decorator';

@Controller('api/v1/reminders')
export class ReminderController {
  constructor(
    private readonly reminderService: ReminderService,
    private readonly schedulerService: ReminderSchedulerService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReminderDto,
  ) {
    const data = await this.reminderService.create(user.id, dto);
    return { success: true, data };
  }

  @Get()
  async findAll(@CurrentUser() user: { id: string }) {
    const data = await this.reminderService.findAll(user.id);
    return { success: true, data };
  }

  @Get('pending')
  async findPending(@CurrentUser() user: { id: string }) {
    const data = await this.reminderService.findPending(user.id);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.reminderService.findOne(user.id, id);
    return { success: true, data };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    const data = await this.reminderService.update(user.id, id, dto);
    return { success: true, data };
  }

  /** Đánh dấu hoàn thành thủ công (user click "Đã xong") */
  @Patch(':id/complete')
  async complete(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.reminderService.complete(user.id, id);
    return { success: true, data };
  }

  /** Hủy reminder */
  @Patch(':id/cancel')
  async cancel(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.reminderService.cancel(user.id, id);
    return { success: true, data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.reminderService.remove(user.id, id);
  }

  // ─── Scheduler Debug ────────────────────────────────────────────────────

  /**
   * POST /api/v1/reminders/trigger-dispatch
   * Kích hoạt thủ công Cron để dispatch tất cả reminder pending đã đến giờ.
   * Hữu ích cho dev/testing mà không cần đợi Cron tick.
   */
  @Post('trigger-dispatch')
  @Public()
  @HttpCode(HttpStatus.OK)
  async triggerDispatch() {
    const count = await this.schedulerService.enqueueOverdueReminders();
    return {
      success: true,
      message: `Đã enqueue ${count} reminder(s) vào BullMQ queue.`,
      enqueued: count,
    };
  }
}
