import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  async health() {
    let dbHost = "unknown";
    try {
      dbHost = new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      // leave as "unknown"
    }
    const seasonCount = await this.prisma.season.count();
    return { status: "ok", dbHost, seasonCount };
  }
}
