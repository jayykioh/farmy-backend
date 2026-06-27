import { Email } from './value-objects/email.value-object';

export class User {
  private readonly id: string;
  private readonly email: Email;
  private passwordHash: string;
  private name: string;
  private role: string;
  private pushSubscription?: any;

  constructor(
    id: string,
    email: Email,
    passwordHash: string,
    name: string,
    role: string,
    pushSubscription?: any,
  ) {
    this.id = id;
    this.email = email;
    this.passwordHash = passwordHash;
    this.name = name;
    this.role = role;
    this.pushSubscription = pushSubscription;
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

  public updatePassword(newPasswordHash: string): void {
    this.passwordHash = newPasswordHash;
  }
}
