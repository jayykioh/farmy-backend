import { Controller, Get } from '@nestjs/common';
import { PetService } from '../../application/services/pet.service';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';

@Controller('api/v1/pet')
export class PetController {
  constructor(private readonly petService: PetService) {}

  @Get('state')
  async getPetState(@CurrentUser() user: { id: string }) {
    const data = await this.petService.getPetState(user.id);
    return { success: true, data };
  }
}
