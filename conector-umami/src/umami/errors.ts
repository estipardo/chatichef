/** An error whose message is safe to show to the MCP client. */
export class UmamiError extends Error {
  override name = "UmamiError";
  constructor(
    message: string,
    readonly status?: number,
    /** Short machine code from the API (for example INVALID_LOGIN_CREDENTIALS). */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Builds an UmamiError from a failed HTTP response, keeping the API's code. */
export async function failure(what: string, response: Response): Promise<UmamiError> {
  const raw = await response.text().catch(() => "");
  let code: string | undefined;
  try {
    const body = JSON.parse(raw) as { error?: unknown };
    const err = body.error;
    if (typeof err === "string") code = err;
    else if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
      code = err.message;
    }
  } catch {
    // Not JSON: keep no code.
  }
  code = code?.slice(0, 160);
  return new UmamiError(`${what} failed (HTTP ${response.status})${code ? `: ${code}` : ""}`, response.status, code);
}
