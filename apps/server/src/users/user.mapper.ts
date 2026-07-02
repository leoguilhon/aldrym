import type { AuthUser } from "@aldrym/shared";
import type { User } from "@prisma/client";

type UserForAuth = Pick<User, "id" | "email" | "createdAt" | "updatedAt">;

export function toAuthUser(user: UserForAuth): AuthUser {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}
