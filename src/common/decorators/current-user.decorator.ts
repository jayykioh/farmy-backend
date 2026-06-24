import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  name: string;
}

type CurrentUserKey = keyof AuthenticatedUser;

export const CurrentUser = createParamDecorator(
  <TKey extends CurrentUserKey | undefined>(
    data: TKey,
    ctx: ExecutionContext,
  ): TKey extends CurrentUserKey
    ? AuthenticatedUser[TKey]
    : AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;

    if (!data) {
      return user as TKey extends CurrentUserKey ? never : AuthenticatedUser;
    }

    return user?.[data] as TKey extends CurrentUserKey
      ? AuthenticatedUser[TKey]
      : never;
  },
);
