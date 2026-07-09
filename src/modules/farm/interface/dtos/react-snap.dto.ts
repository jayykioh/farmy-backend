import { IsIn } from 'class-validator';
import type { SnapReactionType } from '../../infrastructure/persistence/snap-reaction.schema';

export class ReactSnapDto {
  @IsIn(['like', 'helpful', 'worry', 'celebrate'])
  type: SnapReactionType;
}
