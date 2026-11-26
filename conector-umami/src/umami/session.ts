import { SIGN_IN_URL, TOKEN_URL, webFetch } from "./config.js";
import { failure, UmamiError } from "./errors.js";

type Fetch = typeof fetch;

interface Token {
  value: string;
  uid: string;
  /** Epoch milliseconds. */
  expires: number;
}

/**
 * A signed-in Umami (Firebase) user. Holds a refresh token and hands out
 * short-lived ID tokens, renewing them a minute before they expire.
 */
export class Session {
  private token?: Token;
  private renewing?: Promise<Token>;

  private readonly http: Fetch;

  private constructor(
    private refresh: string,
    http: Fetch,
  ) {
    this.http = (input, init) => http(input, init);
  }

  /** Resume a session from a stored refresh token. */
  static fromRefreshToken(refreshToken: string, http: Fetch = webFetch): Session {
    if (!refreshToken) throw new UmamiError("A refresh token is required");
    return new Session(refreshToken, http);
  }

  /** Sign in once with email and password. The password is not kept. */
  static async signIn(email: string, password: string, http: Fetch = webFetch): Promise<Session> {
    const response = await http(SIGN_IN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    if (!response.ok) throw await failure("Umami sign-in", response);
    const body = (await response.json()) as {
      idToken: string;
      refreshToken: string;
      localId: string;
      expiresIn: string;
    };
    const session = new Session(body.refreshToken, http);
    session.token = {
      value: body.idToken,
      uid: body.localId,
      expires: Date.now() + Number(body.expiresIn) * 1000,
    };
    return session;
  }

  get refreshToken(): string {
    return this.refresh;
  }

  async idToken(force = false): Promise<string> {
    return (await this.current(force)).value;
  }

  async userId(): Promise<string> {
    return (await this.current()).uid;
  }

  private async current(force = false): Promise<Token> {
    if (!force && this.token && this.token.expires - Date.now() > 60_000) return this.token;
    this.renewing ??= this.renew().finally(() => {
      this.renewing = undefined;
    });
    return this.renewing;
  }

  private async renew(): Promise<Token> {
    const response = await this.http(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refresh }),
    });
    if (!response.ok) throw await failure("Umami session renewal", response);
    const body = (await response.json()) as {
      id_token: string;
      refresh_token: string;
      user_id: string;
      expires_in: string;
    };
    this.refresh = body.refresh_token;
    this.token = {
      value: body.id_token,
      uid: body.user_id,
      expires: Date.now() + Number(body.expires_in) * 1000,
    };
    return this.token;
  }
}
