import { type OAuthHelpers, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { allowedEmails, handleLogin } from "./login.js";
import { buildServer } from "./tools.js";
import { Session, Umami } from "./umami/index.js";

export interface Env {
  OAUTH_KV: KVNamespace;
  /** Emails allowed to connect (secret). */
  ALLOWED_EMAILS?: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

interface Grant {
  email?: unknown;
  umamiRefreshToken?: unknown;
}

const mcp: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const grant = (ctx as ExecutionContext & { props?: Grant }).props;
    if (typeof grant?.email !== "string" || typeof grant.umamiRefreshToken !== "string") {
      return unauthorized("This connection has no Umami session. Connect again.");
    }
    // Checked on every request, so removing an email cuts its access at once.
    if (!allowedEmails(env.ALLOWED_EMAILS).has(grant.email)) {
      return unauthorized("This Umami account is no longer allowed on this server.");
    }
    const umami = new Umami(Session.fromRefreshToken(grant.umamiRefreshToken));
    return createMcpHandler(() => buildServer(umami), { route: "/mcp" })(request, env, ctx);
  },
};

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: mcp as never,
  defaultHandler: { fetch: (request, env) => handleLogin(request, env, env.OAUTH_PROVIDER) } as ExportedHandler<Env>,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: [],
  allowPlainPKCE: false,
  refreshTokenTTL: 90 * 24 * 3600,
  resourceMatchOriginOnly: true,
  resourceMetadata: { resource_name: "Umami Recipes" },
});

function unauthorized(description: string): Response {
  return Response.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token"' } },
  );
}
