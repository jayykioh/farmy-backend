export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
  jti?: string;
}

export interface RefreshTokenDecoded {
  sub: string;
  jti?: string;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

export interface ITokenService {
  generateAccessToken(payload: TokenPayload): string;
  generateRefreshToken(payload: TokenPayload): string;
  verifyRefreshToken(token: string): RefreshTokenDecoded;
}

export const ITokenServiceToken = Symbol('ITokenService');
