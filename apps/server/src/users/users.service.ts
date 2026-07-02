import { Inject, Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

type UserWithPassword = Pick<User, "id" | "email" | "passwordHash" | "createdAt" | "updatedAt">;
type UserWithoutPassword = Pick<User, "id" | "email" | "createdAt" | "updatedAt">;

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { email }
    });
  }

  createUser(email: string, passwordHash: string): Promise<UserWithPassword> {
    return this.prisma.user.create({
      data: {
        email,
        passwordHash
      }
    });
  }

  findByIdWithPassword(id: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { id }
    });
  }

  findAuthUserById(id: string): Promise<UserWithoutPassword | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }
}
