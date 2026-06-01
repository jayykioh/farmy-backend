import { RegisterDto } from '../../interface/dtos/register.dto';

export class RegisterUserCommand {
  constructor(public readonly dto: RegisterDto) {}
}
