import { DB_PATH, FIRESTORE_URL, webFetch } from "./config.js";
import { failure, UmamiError } from "./errors.js";
import type { Session } from "./session.js";

/** A Firestore value as it travels over the REST API. */
export type Wire =
  | { nullValue: null | "NULL_VALUE" }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: Wire[] } }
  | { mapValue: { fields?: Record<string, Wire> } };

export type WireFields = Record<string, Wire>;

export interface RawDoc {
  name: string;
  fields?: WireFields;
  updateTime?: string;
}

/** A document with plain JavaScript fields (timestamps become Date). */
export interface Doc<T> {
  path: string;
  id: string;
  updateTime?: string;
  data: T;
}

// ---------- value codec ----------

export function toWire(value: unknown): Wire {
  switch (typeof value) {
    case "string":
      return { stringValue: value };
    case "boolean":
      return { booleanValue: value };
    case "number":
      if (!Number.isFinite(value)) throw new UmamiError("Numbers must be finite");
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case "object":
      if (value === null) return { nullValue: "NULL_VALUE" };
      if (value instanceof Date) return { timestampValue: value.toISOString() };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(toWire) } };
      return { mapValue: { fields: toWireFields(value as Record<string, unknown>) } };
    default:
      throw new UmamiError(`Cannot store a value of type ${typeof value}`);
  }
}

export function toWireFields(object: Record<string, unknown>): WireFields {
  const out: WireFields = {};
  for (const key of Object.keys(object)) {
    if (object[key] !== undefined) out[key] = toWire(object[key]);
  }
  return out;
}

export function fromWire(wire: Wire): unknown {
  if ("stringValue" in wire) return wire.stringValue;
  if ("booleanValue" in wire) return wire.booleanValue;
  if ("integerValue" in wire) return Number(wire.integerValue);
  if ("doubleValue" in wire) return wire.doubleValue;
  if ("timestampValue" in wire) return new Date(wire.timestampValue);
  if ("arrayValue" in wire) return (wire.arrayValue.values ?? []).map(fromWire);
  if ("mapValue" in wire) return fromWireFields(wire.mapValue.fields ?? {});
  return null;
}

export function fromWireFields(fields: WireFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) out[key] = fromWire(fields[key]!);
  return out;
}

/**
 * Encodes `value` using the same wire type as `like` (a value the Umami app
 * wrote), so the app reads our data exactly as it reads its own.
 */
export function toWireLike(like: Wire | undefined, value: unknown): Wire {
  if (like && value instanceof Date) {
    if ("integerValue" in like) return { integerValue: String(value.getTime()) };
    if ("doubleValue" in like) return { doubleValue: value.getTime() };
    if ("stringValue" in like) return { stringValue: value.toISOString() };
  }
  if (like && typeof value === "number" && "doubleValue" in like) return { doubleValue: value };
  return toWire(value);
}

/** One segment of a Firestore field path, back-quoted when it needs it. */
export function pathSegment(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;
  return "`" + key.replaceAll("\\", "\\\\").replaceAll("`", "\\`") + "`";
}

/** Random document id in the same alphabet Firestore clients use. */
export function newId(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = "";
  for (const byte of bytes) id += chars[byte % chars.length];
  return id;
}

// ---------- query helpers ----------

export const where = {
  eq: (field: string, value: unknown) => ({
    fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toWire(value) },
  }),
  notNull: (field: string) => ({
    unaryFilter: { field: { fieldPath: field }, op: "IS_NOT_NULL" },
  }),
  notEqNull: (field: string) => ({
    fieldFilter: { field: { fieldPath: field }, op: "NOT_EQUAL", value: { nullValue: "NULL_VALUE" } },
  }),
  and: (...filters: unknown[]) =>
    filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } },
};

export interface Query {
  collection: string;
  where?: unknown;
  orderBy?: Array<{ field: string; direction: "ASCENDING" | "DESCENDING" }>;
  limit?: number;
}

// ---------- client ----------

/** Minimal Firestore REST client authenticated as the Umami user. */
export class Store {
  private readonly http: typeof fetch;

  constructor(
    private readonly session: Session,
    http: typeof fetch = webFetch,
  ) {
    // Never call a fetch as this.http(...): Workers reject that (see webFetch).
    this.http = (input, init) => http(input, init);
  }

  docPath(collection: string, id: string): string {
    return `${DB_PATH}/documents/${collection}/${id}`;
  }

  async getRaw(collection: string, id: string): Promise<RawDoc> {
    const url = `${FIRESTORE_URL}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
    const response = await this.call(url);
    if (response.status === 404) throw new UmamiError(`${collection} ${id} does not exist`, 404);
    if (!response.ok) throw await failure(`Reading ${collection} ${id}`, response);
    return (await response.json()) as RawDoc;
  }

  async get<T>(collection: string, id: string): Promise<Doc<T>> {
    return decode<T>(await this.getRaw(collection, id));
  }

  async query<T>(q: Query): Promise<Doc<T>[]> {
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: q.collection }] };
    if (q.where) structuredQuery.where = q.where;
    if (q.orderBy) {
      structuredQuery.orderBy = q.orderBy.map((o) => ({ field: { fieldPath: o.field }, direction: o.direction }));
    }
    if (q.limit) structuredQuery.limit = q.limit;
    const response = await this.call(`${FIRESTORE_URL}/documents:runQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ structuredQuery }),
    });
    if (!response.ok) throw await failure(`Querying ${q.collection}`, response);
    const rows = (await response.json()) as Array<{ document?: RawDoc }>;
    return rows.flatMap((row) => (row.document ? [decode<T>(row.document)] : []));
  }

  /** Applies all writes atomically. */
  async commit(writes: unknown[]): Promise<void> {
    const response = await this.call(`${FIRESTORE_URL}/documents:commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ writes }),
    });
    if (response.status === 409 || response.status === 412) {
      throw new UmamiError("The data changed in Umami while saving. Read it again and retry.", response.status);
    }
    if (!response.ok) throw await failure("Saving to Umami", response);
  }

  /** Fetch with the user's ID token, renewing it once on a 401. */
  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    for (const force of [false, true]) {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${await this.session.idToken(force)}`);
      const response = await this.http(url, { ...init, headers });
      if (response.status !== 401 || force) return response;
      await response.body?.cancel();
    }
    throw new Error("unreachable");
  }
}

function decode<T>(raw: RawDoc): Doc<T> {
  return {
    path: raw.name,
    id: raw.name.slice(raw.name.lastIndexOf("/") + 1),
    ...(raw.updateTime ? { updateTime: raw.updateTime } : {}),
    data: fromWireFields(raw.fields ?? {}) as T,
  };
}

/** A partial update of `doc` that fails if someone changed it since we read it. */
export function patch(doc: { path: string; updateTime?: string }, fields: WireFields): unknown {
  if (!doc.updateTime) throw new UmamiError("Refusing to write: the document has no update time");
  return {
    update: { name: doc.path, fields },
    updateMask: { fieldPaths: Object.keys(fields).map(pathSegment) },
    currentDocument: { updateTime: doc.updateTime },
  };
}
