import { LoginDto } from '../../interface/dtos/login.dto';

export class LoginUserCommand {
  constructor(public readonly dto: LoginDto) {}
}
