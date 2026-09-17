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
