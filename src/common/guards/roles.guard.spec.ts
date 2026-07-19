/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    guard = new RolesGuard(reflector);
  });

  const createContext = (user?: { role: string }) =>
    ({
      getHandler: jest.fn(() => function handler() {}),
      getClass: jest.fn(() => class Controller {}),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as any;

  it('allows access when no roles metadata is defined', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows access when the user has a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    expect(guard.canActivate(createContext({ role: 'admin' }))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it('throws UnauthorizedException when no user is attached', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when the user lacks a required role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['admin']);

    expect(() => guard.canActivate(createContext({ role: 'user' }))).toThrow(
      ForbiddenException,
    );
  });
});
