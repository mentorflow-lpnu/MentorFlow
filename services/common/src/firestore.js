// Auth: FIRESTORE_TOKEN for the emulator, otherwise a service account from FIREBASE_SERVICE_ACCOUNT (JSON or base64).
import crypto from "node:crypto";

export function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number")
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  return { mapValue: { fields: toFirestoreFields(v) } };
}

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) fields[k] = toFirestoreValue(v);
  return fields;
}

export function fromFirestoreValue(v) {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return new Date(v.timestampValue).toISOString();
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields ?? {});
  return null;
}

export function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields ?? {})) obj[k] = fromFirestoreValue(v);
  return obj;
}

const OPS = { "==": "EQUAL", "!=": "NOT_EQUAL", "<": "LESS_THAN", "<=": "LESS_THAN_OR_EQUAL", ">": "GREATER_THAN", ">=": "GREATER_THAN_OR_EQUAL", in: "IN" };

export function buildQuery(collection, where = [], { orderBy, limit } = {}) {
  const filters = where.map(([field, op, value]) => ({
    fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: toFirestoreValue(value) },
  }));
  const q = { from: [{ collectionId: collection }] };
  if (filters.length === 1) q.where = filters[0];
  if (filters.length > 1) q.where = { compositeFilter: { op: "AND", filters } };
  if (orderBy) q.orderBy = [{ field: { fieldPath: orderBy[0] }, direction: orderBy[1] === "desc" ? "DESCENDING" : "ASCENDING" }];
  if (limit) q.limit = limit;
  return { structuredQuery: q };
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export function serviceAccountJwt(sa, now = new Date()) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

function readServiceAccount(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return null;
  const raw = env.FIREBASE_SERVICE_ACCOUNT.trim();
  return JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
}

export function createFirestore(ctx) {
  const { http, env } = ctx;
  const sa = readServiceAccount(env);
  const projectId = env.FIREBASE_PROJECT_ID || sa?.project_id;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");
  const base = `${(env.FIRESTORE_URL || "https://firestore.googleapis.com/v1").replace(/\/$/, "")}/projects/${projectId}/databases/(default)/documents`;
  let token = env.FIRESTORE_TOKEN || null;

  async function authHeader() {
    if (!token) {
      if (!sa) throw new Error("FIRESTORE_TOKEN or FIREBASE_SERVICE_ACCOUNT is required");
      const res = await http({
        method: "POST",
        url: sa.token_uri ?? "https://oauth2.googleapis.com/token",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${serviceAccountJwt(sa)}`,
        json: true,
        returnFullResponse: true,
        ignoreHttpStatusErrors: true,
      });
      if (res.statusCode >= 300) throw new Error(`Google token: ${res.statusCode} ${JSON.stringify(res.body)}`);
      token = res.body.access_token;
    }
    return { Authorization: `Bearer ${token}` };
  }

  async function call(method, url, body) {
    const res = await http({
      method, url, body, json: true,
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      returnFullResponse: true, ignoreHttpStatusErrors: true,
    });
    return res;
  }

  const fail = (what, res) => { throw new Error(`Firestore ${what}: ${res.statusCode} ${JSON.stringify(res.body)}`); };
  const docOf = (d) => ({ id: d.name.split("/").pop(), ...fromFirestoreFields(d.fields) });

  return {
    async get(path) {
      const res = await call("GET", `${base}/${path}`);
      if (res.statusCode === 404) return null;
      if (res.statusCode >= 300) fail(`get ${path}`, res);
      return docOf(res.body);
    },
    // full write: creates or replaces the document
    async set(path, data) {
      const res = await call("PATCH", `${base}/${path}`, { fields: toFirestoreFields(data) });
      if (res.statusCode >= 300) fail(`set ${path}`, res);
      return docOf(res.body);
    },
    // partial write of top-level fields; creates the document if it does not exist
    async update(path, data) {
      const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
      const res = await call("PATCH", `${base}/${path}?${mask}`, { fields: toFirestoreFields(data) });
      if (res.statusCode >= 300) fail(`update ${path}`, res);
      return docOf(res.body);
    },
    async add(collection, data) {
      const res = await call("POST", `${base}/${collection}`, { fields: toFirestoreFields(data) });
      if (res.statusCode >= 300) fail(`add ${collection}`, res);
      return docOf(res.body);
    },
    async delete(path) {
      const res = await call("DELETE", `${base}/${path}`);
      if (res.statusCode >= 300 && res.statusCode !== 404) fail(`delete ${path}`, res);
    },
    async query(collection, where, opts) {
      const res = await call("POST", `${base}:runQuery`, buildQuery(collection, where, opts));
      if (res.statusCode >= 300) fail(`query ${collection}`, res);
      return (res.body ?? []).filter((r) => r.document).map((r) => docOf(r.document));
    },
  };
}
