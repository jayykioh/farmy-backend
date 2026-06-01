import { BadRequestException } from '@nestjs/common';
import { Email } from './email.value-object';

describe('Email Value Object', () => {
  it('should successfully create a valid email', () => {
    const emailStr = 'test@example.com';
    const email = Email.create(emailStr);
    expect(email.getValue()).toBe(emailStr);
  });

  it('should lowercase and trim whitespace from the email', () => {
    const emailStr = '  TEST@ExamPle.CoM  ';
    const email = Email.create(emailStr);
    expect(email.getValue()).toBe('test@example.com');
  });

  it('should throw BadRequestException if email is empty', () => {
    expect(() => Email.create('')).toThrow(BadRequestException);
    expect(() => Email.create(null as unknown as string)).toThrow(
      BadRequestException,
    );
    expect(() => Email.create(undefined as unknown as string)).toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException if email format is invalid', () => {
    expect(() => Email.create('invalid-email')).toThrow(BadRequestException);
    expect(() => Email.create('test@')).toThrow(BadRequestException);
    expect(() => Email.create('@example.com')).toThrow(BadRequestException);
    expect(() => Email.create('test@example')).toThrow(BadRequestException);
  });
});
