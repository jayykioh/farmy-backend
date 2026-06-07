export class RefreshToken {
  private readonly id: string;
  private readonly token: string;
  private readonly userId: string;
  private readonly familyId: string;
  private isUsed: boolean;
  private isRevoked: boolean;
  private readonly expiresAt: Date;

  constructor(
    id: string,
    token: string,
    userId: string,
    familyId: string,
    isUsed: boolean,
    isRevoked: boolean,
    expiresAt: Date,
  ) {
    this.id = id;
    this.token = token;
    this.userId = userId;
    this.familyId = familyId;
    this.isUsed = isUsed;
    this.isRevoked = isRevoked;
    this.expiresAt = expiresAt;
  }

  public getId(): string {
    return this.id;
  }

  public getToken(): string {
    return this.token;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getFamilyId(): string {
    return this.familyId;
  }

  public getIsUsed(): boolean {
    return this.isUsed;
  }

  public getIsRevoked(): boolean {
    return this.isRevoked;
  }

  public getExpiresAt(): Date {
    return this.expiresAt;
  }

  public markAsUsed(): void {
    this.isUsed = true;
  }

  public revoke(): void {
    this.isRevoked = true;
  }
}
