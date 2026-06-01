import { BadRequestException } from '@nestjs/common';
import { Password } from './password.value-object';

describe('Password Value Object', () => {
  it('should successfully create a valid strong password', () => {
    const passwordStr = 'Password123';
    const password = Password.create(passwordStr);
    expect(password.getValue()).toBe(passwordStr);
  });

  it('should throw BadRequestException if password is empty', () => {
    expect(() => Password.create('')).toThrow(BadRequestException);
    expect(() => Password.create(null as unknown as string)).toThrow(
      BadRequestException,
    );
    expect(() => Password.create(undefined as unknown as string)).toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException if password is less than 8 characters', () => {
    expect(() => Password.create('Ab1')).toThrow(BadRequestException);
    expect(() => Password.create('Pass123')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException if password is missing an uppercase letter', () => {
    expect(() => Password.create('password123')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException if password is missing a lowercase letter', () => {
    expect(() => Password.create('PASSWORD123')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException if password is missing a digit or special character', () => {
    expect(() => Password.create('Password')).toThrow(BadRequestException);
  });
});
