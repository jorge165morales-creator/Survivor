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
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: Number(this.config.get<string>("SMTP_PORT")) || 587,
          secure: this.config.get<string>("SMTP_SECURE") === "true",
          auth: {
            user: this.config.getOrThrow<string>("SMTP_USER"),
            pass: this.config.getOrThrow<string>("SMTP_PASS"),
          },
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
  }
}
