import type { AuthResponse, AuthUser } from "@aldrym/shared";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hash, compare } from "bcryptjs";

import { isPrismaUniqueConstraintError } from "../prisma/prisma-error.util";
import { toAuthUser } from "../users/user.mapper";
import { UsersService } from "../users/users.service";
import type { AuthenticatedUser, JwtTokenPayload } from "./authenticated-user.interface";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JwtService) private readonly jwtService: JwtService
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(registerDto.email);
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await hash(registerDto.password, 12);

    try {
      const user = await this.usersService.createUser(email, passwordHash);
      return this.buildAuthResponse(user);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error, "email")) {
        throw new ConflictException("Email is already registered");
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const email = this.normalizeEmail(loginDto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await compare(loginDto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildAuthResponse(user);
  }

  async getCurrentUser(userId: string): Promise<AuthUser> {
    const user = await this.usersService.findAuthUserById(userId);

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return toAuthUser(user);
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtTokenPayload>(token);

      return {
        id: payload.sub,
        email: payload.email
      };
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  extractBearerToken(authorization?: string | string[]): string | null {
    const header = Array.isArray(authorization) ? authorization[0] : authorization;

    if (!header) {
      return null;
    }

    const [type, token] = header.split(" ");

    if (type !== "Bearer" || !token) {
      return null;
    }

    return token;
  }

  private async buildAuthResponse(user: {
    id: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<AuthResponse> {
    const payload: JwtTokenPayload = {
      sub: user.id,
      email: user.email
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: toAuthUser(user)
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
