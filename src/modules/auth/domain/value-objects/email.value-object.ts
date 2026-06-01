import { BadRequestException } from '@nestjs/common';

export class Email {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static create(email: string): Email {
    if (!email) {
      throw new BadRequestException('Email không được để trống!');
    }
    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      throw new BadRequestException('Email không đúng định dạng!');
    }
    return new Email(normalized);
  }

  public getValue(): string {
    return this.value;
  }
}
