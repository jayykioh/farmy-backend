import { Email } from './value-objects/email.value-object';

export class User {
  private readonly id: string;
  private readonly email: Email;
  private passwordHash: string;
  private name: string;
  private role: string;
  private pushSubscription?: any;
  private isDeleted?: boolean;
  private deletedAt?: Date;

  constructor(
    id: string,
    email: Email,
    passwordHash: string,
    name: string,
    role: string,
    pushSubscription?: any,
    isDeleted?: boolean,
    deletedAt?: Date,
  ) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.name = name;
    this.role = role;
    this.pushSubscription = pushSubscription;
    this.isDeleted = isDeleted;
    this.deletedAt = deletedAt;
  }

  public getId(): string {
    return this.id;
  }

  public getEmail(): string {
    return this.email.getValue();
  }

  public getPasswordHash(): string {
    return this.passwordHash;
  }

  public getName(): string {
    return this.name;
  }

  public getRole(): string {
    return this.role;
  }

  public getPushSubscription(): any {
    return this.pushSubscription;
  }

  public setPushSubscription(subscription: any): void {
    this.pushSubscription = subscription;
  }

  public isDeletedUser(): boolean {
    return !!this.isDeleted;
  }

  public getDeletedAt(): Date | undefined {
    return this.deletedAt;
  }

  public softDelete(deletedEmail: string): void {
    this.isDeleted = true;
    this.deletedAt = new Date();
    // Recreate the email value object with the scrambled deleted email string
    (this as any).email = Email.create(deletedEmail);
    // Clear password hash to prevent login
    this.passwordHash = 'DELETED';
  }

  public updatePassword(newPasswordHash: string): void {
    this.passwordHash = newPasswordHash;
  }
}
