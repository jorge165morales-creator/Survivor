import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Expo's own documented cap per request.
const BATCH_SIZE = 100;

interface ExpoPushTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Thin wrapper over Expo's push-notification relay — a single free HTTPS
 * endpoint that delivers to both iOS (APNs) and Android (FCM) behind the
 * scenes, so there's no Apple/Google push credential management here.
 * Expo tokens (not platform-native ones) are what's stored in PushToken,
 * matching what expo-notifications' getExpoPushTokenAsync() returns
 * client-side.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sends the same title/body to every token given. Best-effort per token —
   * one bad token never blocks the rest of the batch. A token Expo reports
   * as DeviceNotRegistered (uninstalled app, expired token) is pruned from
   * our table so it stops being sent to every time.
   */
  async sendToTokens(tokens: string[], title: string, body: string): Promise<void> {
    if (tokens.length === 0) return;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(batch.map((to) => ({ to, title, body, sound: "default" }))),
        });
        if (!res.ok) {
          this.logger.error(`Expo push batch failed: ${res.status} ${res.statusText}`);
          continue;
        }
        const { data: tickets } = (await res.json()) as { data: ExpoPushTicket[] };
        const staleTokens = batch.filter((_, idx) => tickets[idx]?.details?.error === "DeviceNotRegistered");
        if (staleTokens.length > 0) {
          await this.prisma.pushToken.deleteMany({ where: { token: { in: staleTokens } } });
        }
      } catch (err) {
        this.logger.error("Expo push batch threw", err instanceof Error ? err.stack : err);
      }
    }
  }
}
