import { PushService } from "./push.service";
import { PrismaService } from "../prisma/prisma.service";

function makePrisma() {
  return {
    pushToken: { deleteMany: jest.fn() },
  } as unknown as PrismaService;
}

describe("PushService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does nothing when given no tokens", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const prisma = makePrisma();
    const service = new PushService(prisma);

    await service.sendToTokens([], "Title", "Body");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts one batch for tokens under the 100 cap", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: "ok" }, { status: "ok" }] }),
    } as Response);
    const prisma = makePrisma();
    const service = new PushService(prisma);

    await service.sendToTokens(["token-1", "token-2"], "Title", "Body");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body).toEqual([
      { to: "token-1", title: "Title", body: "Body", sound: "default" },
      { to: "token-2", title: "Title", body: "Body", sound: "default" },
    ]);
  });

  it("splits into multiple batches above the 100 cap", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    } as Response);
    const prisma = makePrisma();
    const service = new PushService(prisma);
    const tokens = Array.from({ length: 150 }, (_, i) => `token-${i}`);

    await service.sendToTokens(tokens, "Title", "Body");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("prunes tokens Expo reports as no longer registered", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }],
        }),
    } as Response);
    const prisma = makePrisma();
    const service = new PushService(prisma);

    await service.sendToTokens(["good-token", "stale-token"], "Title", "Body");

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["stale-token"] } } });
  });

  it("doesn't throw when one batch's request fails — best effort", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" } as Response);
    const prisma = makePrisma();
    const service = new PushService(prisma);

    await expect(service.sendToTokens(["token-1"], "Title", "Body")).resolves.toBeUndefined();
  });
});
