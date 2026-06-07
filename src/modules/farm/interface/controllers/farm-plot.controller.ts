import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FarmPlotService } from '../../application/services/farm-plot.service';
import { CreatePlotDto } from '../dtos/create-plot.dto';
import { UpdatePlotDto } from '../dtos/update-plot.dto';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';

@Controller('api/v1/plots')
export class FarmPlotController {
  constructor(private readonly farmPlotService: FarmPlotService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePlotDto,
  ) {
    const data = await this.farmPlotService.create(user.id, dto);
    return {
      success: true,
      data,
    };
  }

  @Get()
  async findAll(@CurrentUser() user: { id: string }) {
    const data = await this.farmPlotService.findAll(user.id);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    const data = await this.farmPlotService.findOne(user.id, id);
    return {
      success: true,
      data,
    };
  }

  @Put(':id')
  async update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdatePlotDto,
  ) {
    const data = await this.farmPlotService.update(user.id, id, dto);
    return {
      success: true,
      data,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.farmPlotService.remove(user.id, id);
  }
}
