import { RefreshToken } from '../refresh-token.aggregate';

export interface IRefreshTokenRepository {
  create(refreshToken: RefreshToken): Promise<void>;
  findByToken(token: string): Promise<RefreshToken | null>;
  save(refreshToken: RefreshToken): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export const IRefreshTokenRepositoryToken = Symbol('IRefreshTokenRepository');
