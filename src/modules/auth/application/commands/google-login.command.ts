export class GoogleLoginCommand {
  constructor(
    public readonly payload: {
      email: string;
      firstName?: string;
      lastName?: string;
      name?: string;
      picture?: string;
    },
  ) {}
}
