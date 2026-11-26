/**
 * An in-memory stand-in for Umami's Firebase backend: Firestore REST (get,
 * runQuery, commit with update masks and preconditions), token renewal,
 * Storage upload and the AddRecipePhotos RPC. Enough to exercise the client.
 */
import { DB_PATH, FIRESTORE_URL, STORAGE_URL, TOKEN_URL, UMAMI } from "../src/umami/config.js";
import { Session } from "../src/umami/session.js";
import type { RawDoc, Wire, WireFields } from "../src/umami/store.js";

export const UID = "user_1";

export class FakeUmami {
  docs = new Map<string, RawDoc>();
  commits: any[][] = [];
  uploads: string[] = [];
  rpcBodies: string[] = [];
  deleted: string[] = [];
  rpcStatus = "0";
  private clock = 1;

  put(collection: string, id: string, fields: WireFields): void {
    const name = `${DB_PATH}/documents/${collection}/${id}`;
    this.docs.set(name, { name, fields: structuredClone(fields), updateTime: this.tick() });
  }

  field(collection: string, id: string, path: string): Wire | undefined {
    let value: any = { mapValue: { fields: this.docs.get(`${DB_PATH}/documents/${collection}/${id}`)?.fields } };
    for (const part of path.split(".")) value = value?.mapValue?.fields?.[part];
    return value;
  }

  session(): Session {
    return Session.fromRefreshToken("refresh-1", this.fetch);
  }

  private tick(): string {
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock++)).toISOString();
  }

  fetch = (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const body = typeof init.body === "string" ? init.body : undefined;
    if (url.startsWith(TOKEN_URL)) {
      return Response.json({ id_token: "id-1", refresh_token: "refresh-2", user_id: UID, expires_in: "3600" });
    }
    if (url.startsWith(`${STORAGE_URL}?name=`)) {
      this.uploads.push(decodeURIComponent(url.split("name=")[1]!));
      return Response.json({});
    }
    if (url.startsWith(`${STORAGE_URL}/`) && init.method === "DELETE") {
      this.deleted.push(decodeURIComponent(url.slice(STORAGE_URL.length + 1)));
      return new Response(null, { status: 204 });
    }
    if (url === UMAMI.addPhotosRpc) {
      this.rpcBodies.push(body!);
      return new Response("", { headers: { "grpc-status": this.rpcStatus, "grpc-message": "nope" } });
    }
    if (url === `${FIRESTORE_URL}/documents:runQuery`) {
      return Response.json(this.query(JSON.parse(body!).structuredQuery));
    }
    if (url === `${FIRESTORE_URL}/documents:commit`) {
      return this.commit(JSON.parse(body!).writes);
    }
    if (url.startsWith(`${FIRESTORE_URL}/documents/`)) {
      const name = `${DB_PATH}/documents/` + decodeURIComponent(url.slice(FIRESTORE_URL.length + 11));
      const doc = this.docs.get(name);
      return doc ? Response.json(structuredClone(doc)) : Response.json({ error: { message: "NOT_FOUND" } }, { status: 404 });
    }
    return new Response("unexpected " + url, { status: 500 });
  }) as typeof fetch;

  private query(q: any) {
    const collection = q.from[0].collectionId;
    let rows = [...this.docs.values()].filter((d) => d.name.includes(`/documents/${collection}/`));
    rows = rows.filter((d) => matches(d, q.where));
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows.map((document) => ({ document: structuredClone(document) }));
  }

  private commit(writes: any[]): Response {
    for (const w of writes) {
      const current = this.docs.get(w.update.name);
      if (w.currentDocument?.exists === false && current) return new Response("exists", { status: 409 });
      if (w.currentDocument?.updateTime && current?.updateTime !== w.currentDocument.updateTime) {
        return new Response("precondition", { status: 412 });
      }
    }
    this.commits.push(writes);
    for (const w of writes) {
      const doc: RawDoc = this.docs.get(w.update.name) ?? { name: w.update.name, fields: {} };
      if (!w.updateMask) doc.fields = structuredClone(w.update.fields);
      else for (const path of w.updateMask.fieldPaths) setPath(doc.fields!, splitPath(path), getPath(w.update.fields, splitPath(path)));
      doc.updateTime = this.tick();
      this.docs.set(w.update.name, doc);
    }
    return Response.json({});
  }
}

function splitPath(path: string): string[] {
  return path.match(/`(?:[^`\\]|\\.)*`|[^.]+/g)!.map((p) => (p.startsWith("`") ? p.slice(1, -1).replace(/\\(.)/g, "$1") : p));
}

function getPath(fields: WireFields, parts: string[]): Wire | undefined {
  let value: any = { mapValue: { fields } };
  for (const part of parts) value = value?.mapValue?.fields?.[part];
  return value;
}

function setPath(fields: WireFields, parts: string[], value: Wire | undefined): void {
  let target: any = fields;
  for (const part of parts.slice(0, -1)) {
    target[part] ??= { mapValue: { fields: {} } };
    target = (target[part].mapValue.fields ??= {});
  }
  const last = parts[parts.length - 1]!;
  if (value === undefined) delete target[last];
  else target[last] = value;
}

function matches(doc: RawDoc, filter: any): boolean {
  if (!filter) return true;
  if (filter.compositeFilter) return filter.compositeFilter.filters.every((f: any) => matches(doc, f));
  const f = filter.fieldFilter ?? filter.unaryFilter;
  const value = getPath(doc.fields ?? {}, splitPath(f.field.fieldPath));
  if (f.op === "IS_NOT_NULL") return value !== undefined && !("nullValue" in value);
  if (f.op === "NOT_EQUAL") return value !== undefined && !("nullValue" in value);
  if (f.op === "EQUAL") return JSON.stringify(value) === JSON.stringify(f.value);
  throw new Error("unsupported op " + f.op);
}
