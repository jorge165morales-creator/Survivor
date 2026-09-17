import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MailService } from "./mail.service";

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe("MailService", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("warns at construction when no email provider is configured", () => {
    new MailService(makeConfig({ FRONTEND_URL: "https://survivor-web-one.vercel.app" }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No email provider configured"));
  });

  it("does not warn about the provider when RESEND_API_KEY is set", () => {
    new MailService(makeConfig({ RESEND_API_KEY: "re_test", FRONTEND_URL: "https://example.com" }));

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("No email provider configured"));
  });

  it("does not warn about the provider when SENDGRID_API_KEY is set", () => {
    new MailService(makeConfig({ SENDGRID_API_KEY: "sg_test", FRONTEND_URL: "https://example.com" }));

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("No email provider configured"));
  });

  it("does not warn about the provider when SMTP_HOST is set", () => {
    new MailService(
      makeConfig({
        SMTP_HOST: "smtp.gmail.com",
        SMTP_USER: "user@gmail.com",
        SMTP_PASS: "app-password",
        FRONTEND_URL: "https://example.com",
      }),
    );

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("No email provider configured"));
  });

  it("warns at construction when FRONTEND_URL is not set", () => {
    new MailService(makeConfig({ RESEND_API_KEY: "re_test" }));

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("FRONTEND_URL is not set"));
  });

  it("does not warn about FRONTEND_URL when it's set", () => {
    new MailService(makeConfig({ RESEND_API_KEY: "re_test", FRONTEND_URL: "https://example.com" }));

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("FRONTEND_URL is not set"));
  });
});

describe("MailService via SendGrid", () => {
  let fetchSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // This is the exact bug hit live: pasting MAIL_FROM with the same quotes
  // shown in .env.example (quotes included, not just the value) sent the
  // whole quoted string as the "email" field and SendGrid rejected it.
  it("strips surrounding quotes from a quoted MAIL_FROM before sending", async () => {
    const service = new MailService(
      makeConfig({
        SENDGRID_API_KEY: "sg_test",
        MAIL_FROM: '"Survivor <survivorpoolapp@gmail.com>"',
        FRONTEND_URL: "https://example.com",
      }),
    );

    await service.sendPasswordResetEmail("user@example.com", "https://example.com/reset?token=abc");

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toEqual({ name: "Survivor", email: "survivorpoolapp@gmail.com" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // The actual live bug: MAIL_FROM entered without the "<...>" wrapper at
  // all, e.g. "Survivor survivorpoolapp@gmail.com" — previously the whole
  // string was sent as the email address and SendGrid rejected it outright.
  it("extracts the address from MAIL_FROM with no angle brackets", async () => {
    const service = new MailService(
      makeConfig({
        SENDGRID_API_KEY: "sg_test",
        MAIL_FROM: "Survivor survivorpoolapp@gmail.com",
        FRONTEND_URL: "https://example.com",
      }),
    );

    await service.sendPasswordResetEmail("user@example.com", "https://example.com/reset?token=abc");

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toEqual({ name: "Survivor", email: "survivorpoolapp@gmail.com" });
  });

  it("parses an unquoted MAIL_FROM the same way", async () => {
    const service = new MailService(
      makeConfig({
        SENDGRID_API_KEY: "sg_test",
        MAIL_FROM: "Survivor <survivorpoolapp@gmail.com>",
        FRONTEND_URL: "https://example.com",
      }),
    );

    await service.sendPasswordResetEmail("user@example.com", "https://example.com/reset?token=abc");

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.from).toEqual({ name: "Survivor", email: "survivorpoolapp@gmail.com" });
  });
});
