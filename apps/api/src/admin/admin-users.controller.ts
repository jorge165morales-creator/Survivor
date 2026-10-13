import { Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { AdminGuard } from "../common/admin.guard";
import { UsersService } from "../users/users.service";

// Support lookup — e.g. a user forgot which email they signed up with and
// can't log in, so the admin needs to find the account by its @username
// (visible to them in a league's member list) to tell them or walk them
// through forgot-password.
@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get(":username")
  async findByUsername(@Param("username") username: string) {
    const user = await this.users.findByUsername(username);
    if (!user) {
      throw new NotFoundException("No user with that username");
    }
    return { id: user.id, email: user.email, username: user.username, displayName: user.displayName };
  }
}
