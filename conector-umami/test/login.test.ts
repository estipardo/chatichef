import { describe, expect, it, vi } from "vitest";
import { allowedEmails, handleLogin } from "../src/login.js";
import { UmamiError } from "../src/umami/errors.js";

const oauth = {
  parseAuthRequest: vi.fn(async () => ({ clientId: "c1", redirectUri: "https://claude.ai/cb", scope: [], state: "s", responseType: "code" }) as any),
  lookupClient: vi.fn(async () => ({ clientId: "c1", clientName: "Claude", redirectUris: [] }) as any),
  completeAuthorization: vi.fn(async () => ({ redirectTo: "https://claude.ai/cb?code=1" })),
};
const env = { ALLOWED_EMAILS: "Me@Example.com, other@example.com" };
const url = "https://worker.example/authorize?client_id=c1";

async function post(fields: Record<string, string>, signIn = vi.fn(async () => ({ refreshToken: "r", uid: "u" }))) {
  const page = await handleLogin(new Request(url), env, oauth);
  const token = /name="form_token" value="([^"]+)"/.exec(await page.text())![1]!;
  const cookie = page.headers.get("set-cookie")!.split(";")[0]!;
  const body = new URLSearchParams({ form_token: token, ...fields });
  const response = await handleLogin(new Request(url, { method: "POST", body, headers: { cookie } }), env, oauth, signIn);
  return { response, signIn };
}

describe("login page", () => {
  it("parses the allow-list", () => {
    expect([...allowedEmails("a@x.com; B@x.com\nc@x.com")]).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("signs in and stores only email and refresh token in the grant", async () => {
    const { response } = await post({ email: "me@example.com", password: "pw" });
    expect(response.status).toBe(302);
    expect(oauth.completeAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "umami-u", props: { email: "me@example.com", umamiRefreshToken: "r" } }),
    );
  });

  it("never contacts Umami for emails outside the allow-list", async () => {
    const { response, signIn } = await post({ email: "stranger@example.com", password: "pw" });
    expect(response.status).toBe(403);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejects a form without its cookie token", async () => {
    const body = new URLSearchParams({ form_token: "forged", email: "me@example.com", password: "pw" });
    const response = await handleLogin(new Request(url, { method: "POST", body }), env, oauth);
    expect(response.status).toBe(400);
  });

  it("explains a wrong password in the browser's language", async () => {
    const signIn = vi.fn(async () => {
      throw new UmamiError("x", 400, "INVALID_LOGIN_CREDENTIALS");
    });
    const page = await handleLogin(new Request(url, { headers: { "accept-language": "es-ES" } }), env, oauth);
    const token = /name="form_token" value="([^"]+)"/.exec(await page.text())![1]!;
    const cookie = page.headers.get("set-cookie")!.split(";")[0]!;
    const body = new URLSearchParams({ form_token: token, email: "me@example.com", password: "bad" });
    const response = await handleLogin(
      new Request(url, { method: "POST", body, headers: { cookie, "accept-language": "es-ES" } }),
      env,
      oauth,
      signIn,
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("la contraseña no son correctos");
  });
});
