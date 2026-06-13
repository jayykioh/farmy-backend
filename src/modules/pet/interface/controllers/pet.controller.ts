import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PetService } from '../../application/services/pet.service';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';

@Controller('api/v1/pet')
@UseGuards(JwtAuthGuard)
export class PetController {
  constructor(private readonly petService: PetService) {}

  /**
   * GET /api/v1/pet/status
   * Primary endpoint: returns full PetStatusResponse.
   * Recalculates mood based on current time and missed days.
   */
  @Get('status')
  async getStatus(@CurrentUser() user: { id: string }) {
    const data = await this.petService.getStatus(user.id);
    return { success: true, data };
  }

  /**
   * POST /api/v1/pet/recalculate
   * Force-recalculate pet mood (e.g., called after UI-level events).
   * Returns fresh PetStatusResponse.
   */
  @Post('recalculate')
  async recalculate(@CurrentUser() user: { id: string }) {
    const data = await this.petService.getStatus(user.id);
    return { success: true, data };
  }

  /**
   * GET /api/v1/pet/state
   * @deprecated — kept for backward compatibility. Use /status instead.
   */
  @Get('state')
  async getPetState(@CurrentUser() user: { id: string }) {
    const data = await this.petService.getPetState(user.id);
    return { success: true, data };
  }
}
