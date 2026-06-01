import { User } from '../user.aggregate';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
  create(user: User): Promise<void>;
}

export const IUserRepositoryToken = Symbol('IUserRepository');
