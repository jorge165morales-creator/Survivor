import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

/** Must run after JwtAuthGuard (relies on request.userId being set). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) {
      throw new ForbiddenException("Admin access required");
    }
    return true;
  }
}
