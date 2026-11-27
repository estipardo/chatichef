/**
 * The page Claude (or any MCP client) opens to connect: the user types their
 * Umami email and password once. The password is exchanged for a Firebase
 * refresh token and immediately forgotten; only the refresh token is kept,
 * inside the OAuth grant, which the OAuth library stores encrypted.
 */
import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Session, UmamiError } from "./umami/index.js";

export type SignIn = (email: string, password: string) => Promise<{ refreshToken: string; uid: string }>;

const realSignIn: SignIn = async (email, password) => {
  const session = await Session.signIn(email, password);
  return { refreshToken: session.refreshToken, uid: await session.userId() };
};

const COOKIE = "__Host-umami-mcp-form";

/** Emails allowed to connect: ALLOWED_EMAILS, separated by commas, spaces or semicolons. */
export function allowedEmails(setting: string | undefined): Set<string> {
  return new Set(
    (setting ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

type Helpers = Pick<OAuthHelpers, "parseAuthRequest" | "lookupClient" | "completeAuthorization">;

export async function handleLogin(
  request: Request,
  env: { ALLOWED_EMAILS?: string },
  oauth: Helpers,
  signIn: SignIn = realSignIn,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/" && request.method === "GET") {
    return Response.json({ name: "umami-mcp", ok: true, mcp: "/mcp" });
  }
  if (url.pathname !== "/authorize") return Response.json({ error: "not_found" }, { status: 404 });

  const t = strings(request.headers.get("accept-language"));
  let authRequest: AuthRequest;
  let client: ClientInfo | null;
  try {
    authRequest = await oauth.parseAuthRequest(request);
    client = await oauth.lookupClient(authRequest.clientId);
  } catch {
    return Response.json({ error: "invalid_request", error_description: "Bad authorization request" }, { status: 400 });
  }
  if (!client) return Response.json({ error: "invalid_client" }, { status: 400 });

  const show = (message?: string, status = 200) => page(t, url, client!, authRequest.redirectUri, message, status);
  if (request.method === "GET") return show();
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "GET, POST" } });

  const form = await request.formData();
  const token = form.get("form_token");
  if (typeof token !== "string" || !(await equal(token, cookie(request, COOKIE) ?? ""))) {
    return show(t.expired, 400);
  }

  const allowed = allowedEmails(env.ALLOWED_EMAILS);
  if (!allowed.size) return show(t.notConfigured, 503);

  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return show(t.missing, 400);
  // Checked before contacting Umami, so the server cannot be used to try
  // passwords for other people's accounts.
  if (!allowed.has(email.toLowerCase())) return show(t.notAllowed, 403);

  let account: { refreshToken: string; uid: string };
  try {
    account = await signIn(email, password);
  } catch (error) {
    return show(explain(t, error), 401);
  }

  const { redirectTo } = await oauth.completeAuthorization({
    request: authRequest,
    userId: `umami-${account.uid}`,
    scope: [],
    metadata: {},
    props: { email: email.toLowerCase(), umamiRefreshToken: account.refreshToken },
  });
  return new Response(null, {
    status: 302,
    headers: { location: redirectTo, "cache-control": "no-store", "set-cookie": `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0` },
  });
}

function explain(t: Strings, error: unknown): string {
  if (!(error instanceof UmamiError)) return t.unreachable;
  const code = error.code ?? "";
  const ref = ` (${code || "?"}, HTTP ${error.status ?? "?"})`;
  if (/TOO_MANY_ATTEMPTS/.test(code)) return t.tooMany + ref;
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(code)) return t.badPassword + ref;
  if (/USER_DISABLED/.test(code)) return t.disabled + ref;
  return t.rejected + ref;
}

function page(t: Strings, url: URL, client: ClientInfo, redirectUri: string, message: string | undefined, status: number): Response {
  const formToken = crypto.randomUUID();
  const who = esc(client.clientName?.trim() || client.clientId);
  let redirectOrigin = "";
  try {
    const target = new URL(redirectUri);
    if (target.protocol === "https:" || target.protocol === "http:") redirectOrigin = " " + target.origin;
  } catch {
    // keep only 'self'
  }
  const html = `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<style>
  :root { color-scheme: light dark; --bg:#f4f1ea; --card:#fff; --ink:#1f1d1a; --soft:#6b665d; --accent:#c8502d; --bad:#a3271a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151412; --card:#22201d; --ink:#f3efe6; --soft:#b3ab9e; --bad:#ff8a78; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:var(--bg); color:var(--ink); font:16px/1.5 system-ui, -apple-system, sans-serif; }
  form { width:min(26rem, calc(100% - 2rem)); background:var(--card); padding:1.75rem; border-radius:14px; box-shadow:0 10px 40px #0002; }
  h1 { font-size:1.35rem; margin:0 0 .5rem; }
  p { margin:.5rem 0; }
  label { display:block; font-weight:600; margin:1rem 0 .35rem; }
  input { width:100%; padding:.7rem .8rem; border:1px solid #9994; border-radius:8px; font:inherit; background:transparent; color:inherit; }
  button { width:100%; margin-top:1.25rem; padding:.8rem; border:0; border-radius:8px; background:var(--accent); color:#fff; font:inherit; font-weight:700; }
  .soft { color:var(--soft); font-size:.9rem; }
  .bad { color:var(--bad); font-weight:600; }
</style>
</head>
<body>
<form method="post" action="${esc(url.pathname + url.search)}">
  <h1>${t.title}</h1>
  <p><strong>${who}</strong> ${t.asks}</p>
  ${message ? `<p class="bad" role="alert">${esc(message)}</p>` : ""}
  <input type="hidden" name="form_token" value="${formToken}">
  <label for="email">${t.email}</label>
  <input id="email" name="email" type="email" autocomplete="username" required autofocus>
  <label for="password">${t.password}</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <p class="soft">${t.privacy}</p>
  <button type="submit">${t.button}</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${redirectOrigin}; frame-ancestors 'none'; base-uri 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "set-cookie": `${COOKIE}=${formToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=900`,
    },
  });
}

type Strings = (typeof TEXT)["en"];
const TEXT = {
  en: {
    lang: "en",
    title: "Connect Umami Recipes",
    asks: "wants to read, create and edit recipes and meal plans in your Umami account.",
    email: "Umami email",
    password: "Umami password",
    privacy: "Your password is only used now, to get an access token from Umami. It is not stored.",
    button: "Connect",
    expired: "The form expired. Try again.",
    notConfigured: "This server is not set up yet: ALLOWED_EMAILS is missing in Cloudflare.",
    missing: "Type your Umami email and password.",
    notAllowed: "This email is not in ALLOWED_EMAILS on this server.",
    unreachable: "Could not reach Umami. Try again later.",
    tooMany: "Umami has paused sign-ins after too many attempts. Wait a few minutes.",
    badPassword: "Umami says the email or password is wrong.",
    disabled: "Umami says this account is disabled.",
    rejected: "Umami refused the sign-in.",
  },
  es: {
    lang: "es",
    title: "Conectar Umami Recipes",
    asks: "quiere leer, crear y editar recetas y planes de comidas en tu cuenta de Umami.",
    email: "Email de Umami",
    password: "Contraseña de Umami",
    privacy: "La contraseña solo se usa ahora para pedir un permiso de acceso a Umami. No se guarda.",
    button: "Conectar",
    expired: "El formulario ha caducado. Vuelve a intentarlo.",
    notConfigured: "El servidor aún no está configurado: falta ALLOWED_EMAILS en Cloudflare.",
    missing: "Escribe tu email y tu contraseña de Umami.",
    notAllowed: "Este email no está en ALLOWED_EMAILS de este servidor.",
    unreachable: "No se ha podido conectar con Umami. Inténtalo más tarde.",
    tooMany: "Umami ha pausado los intentos de inicio de sesión. Espera unos minutos.",
    badPassword: "Umami dice que el email o la contraseña no son correctos.",
    disabled: "Umami dice que esta cuenta está desactivada.",
    rejected: "Umami ha rechazado el inicio de sesión.",
  },
} as const;

function strings(acceptLanguage: string | null): Strings {
  return /^\s*es\b/i.test(acceptLanguage ?? "") ? (TEXT.es as unknown as Strings) : TEXT.en;
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/** Constant-time comparison (hash both sides, then compare every byte). */
async function equal(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i]! ^ ya[i]!;
  return diff === 0;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
