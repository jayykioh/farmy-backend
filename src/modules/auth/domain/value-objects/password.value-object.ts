import { BadRequestException } from '@nestjs/common';

export class Password {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(password: string): Password {
    if (!password) {
      throw new BadRequestException('Mật khẩu không được để trống!');
    }
    if (password.length < 8) {
      throw new BadRequestException('Mật khẩu phải chứa ít nhất 8 ký tự!');
    }
    const passwordRegex =
      /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException(
        'Mật khẩu quá yếu! Phải gồm chữ hoa, chữ thường và chữ số.',
      );
    }
    return new Password(password);
  }

  public getValue(): string {
    return this.value;
  }
}
