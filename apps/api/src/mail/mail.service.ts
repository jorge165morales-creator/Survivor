import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

const RESEND_API_URL = "https://api.resend.com/emails";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>("SMTP_HOST");
    const resendApiKey = this.config.get<string>("RESEND_API_KEY");

    // Neither of these failing closed is visible any other way: forgotPassword
    // deliberately resolves the same way whether or not the send succeeds (so
    // the response can't be used to enumerate accounts), and the "no provider
    // configured" branch below logs instead of throwing. Both are correct for
    // local dev, but if they're still true in a deployed environment, real
    // users silently never get a password-reset email at all — flag it loudly
    // at boot, once, rather than let that go unnoticed like it already did.
    if (!resendApiKey && !host) {
      this.logger.warn(
        "No email provider configured (RESEND_API_KEY or SMTP_HOST) — outgoing emails will be logged, not sent. " +
          "Fine for local dev; if this is a deployed environment, password reset and other emails are not reaching users.",
      );
    }
    if (!this.config.get<string>("FRONTEND_URL")) {
      this.logger.warn(
        "FRONTEND_URL is not set — password-reset links will point to http://localhost:8081, which real users can't open.",
      );
    }

    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.config.get<string>("SMTP_PORT")) || 587,
          secure: this.config.get<string>("SMTP_SECURE") === "true",
          auth: {
            user: this.config.getOrThrow<string>("SMTP_USER"),
            pass: this.config.getOrThrow<string>("SMTP_PASS"),
          },
          // Some hosts (e.g. Render) block or silently drop outbound SMTP
          // connections entirely. Nodemailer's defaults (2 min connection
          // timeout, 10 min socket timeout) would otherwise hang the whole
          // request that triggered the email — fail fast instead so a broken
          // mail provider can never block auth/reset requests.
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 10_000,
        })
      : null;
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send(
      to,
      "Reset your Survivor password",
      `We received a request to reset your Survivor password. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    );
  }

  async sendOAuthOnlyAccountNotice(to: string, provider: "Apple" | "Google"): Promise<void> {
    await this.send(
      to,
      "About your Survivor account",
      `We received a password reset request for this email, but your Survivor account was created with ${provider} sign-in and has no password to reset. Just sign in with ${provider} instead.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    const from = this.config.get<string>("MAIL_FROM") ?? "Survivor <no-reply@survivor.app>";
    const resendApiKey = this.config.get<string>("RESEND_API_KEY");

    // A failed/hung send must never surface to the caller: forgotPassword
    // deliberately resolves the same way whether or not the email actually
    // goes out, so the response can't be used to enumerate accounts (see
    // auth.service.ts). Log it instead — that's the only way a real delivery
    // problem (bad credentials, a blocked SMTP port, a provider outage) is
    // ever going to be visible.
    try {
      if (resendApiKey) {
        const res = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to, subject, text }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Resend request failed: ${res.status} ${body}`);
        }
        return;
      }

      if (this.transporter) {
        await this.transporter.sendMail({ from, to, subject, text });
        return;
      }

      // Neither Resend nor SMTP configured (the local-dev default) — log
      // instead of sending, so the reset flow stays fully testable without
      // real mail infrastructure. Set RESEND_API_KEY (or SMTP_HOST/USER/PASS)
      // to send for real.
      this.logger.log(`[DEV EMAIL] To: ${to}\nSubject: ${subject}\n\n${text}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
