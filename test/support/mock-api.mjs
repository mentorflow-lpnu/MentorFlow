// In-memory mock of Firestore REST, Discord REST and GitHub GraphQL.
// Unit tests call it through httpFor(); e2e serves it over HTTP with serve().
import { createServer } from "node:http";
import { fromFirestoreFields, fromFirestoreValue } from "../../services/common/src/firestore.js";

const DOCS = "/firestore/v1/projects/test/databases/(default)/documents";

export const MOCK_ENV = {
  FIREBASE_PROJECT_ID: "test",
  FIRESTORE_TOKEN: "owner",
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_BOT_ID: "app1",
  GITHUB_TOKEN: "gh-token",
  MF_TASKS_SECRET: "tasks-secret",
  MF_INTERNAL_SECRET: "internal-secret",
};

export const mockEnv = (base) => ({
  ...MOCK_ENV,
  FIRESTORE_URL: `${base}/firestore/v1`,
  DISCORD_API_URL: `${base}/discord`,
  GITHUB_API_URL: `${base}/github`,
});

const OPS = {
  EQUAL: (a, b) => a === b,
  NOT_EQUAL: (a, b) => a !== b,
  LESS_THAN: (a, b) => a < b,
  LESS_THAN_OR_EQUAL: (a, b) => a <= b,
  GREATER_THAN: (a, b) => a > b,
  GREATER_THAN_OR_EQUAL: (a, b) => a >= b,
  IN: (a, b) => b.includes(a),
};

function matches(fields, where) {
  if (!where) return true;
  if (where.compositeFilter) return where.compositeFilter.filters.every((f) => matches(fields, f));
  const f = where.fieldFilter;
  const v = fields[f.field.fieldPath];
  return v !== undefined && OPS[f.op](fromFirestoreValue(v), fromFirestoreValue(f.value));
}

export function createMockApi() {
  const state = {
    docs: new Map(), // path relative to documents → fields
    messages: new Map(), // messageId → { channelId, ...body, reactions: [] }
    log: [],
    issues: new Map(), // "owner/repo#n" → issue (GraphQL shape)
    prs: new Map(), // "owner/repo#n" → PR (GraphQL shape)
    originalResponses: [],
    seq: 1000,
  };
  const nextId = () => String(++state.seq);

  function firestore(method, path, query, body) {
    if (path === ":runQuery" && method === "POST") {
      const q = body.structuredQuery;
      const coll = q.from[0].collectionId;
      const docs = [...state.docs.entries()]
        .filter(([p]) => p.split("/").length === 2 && p.startsWith(`${coll}/`))
        .filter(([, fields]) => matches(fields, q.where))
        .map(([p, fields]) => ({ document: { name: `projects/test/databases/(default)/documents/${p}`, fields } }));
      return { statusCode: 200, body: docs.length ? docs : [{ readTime: new Date().toISOString() }] };
    }
    const rel = path.replace(/^\//, "");
    const name = `projects/test/databases/(default)/documents/${rel}`;
    if (method === "GET") {
      const fields = state.docs.get(rel);
      return fields ? { statusCode: 200, body: { name, fields } } : { statusCode: 404, body: { error: { code: 404 } } };
    }
    if (method === "PATCH") {
      const mask = query.getAll("updateMask.fieldPaths");
      const prev = state.docs.get(rel) ?? {};
      const fields = mask.length ? { ...prev, ...Object.fromEntries(mask.map((k) => [k, body.fields[k]]).filter(([, v]) => v)) } : body.fields;
      state.docs.set(rel, fields);
      return { statusCode: 200, body: { name, fields } };
    }
    if (method === "POST") {
      const id = `auto${nextId()}`;
      state.docs.set(`${rel}/${id}`, body.fields);
      return { statusCode: 200, body: { name: `${name}/${id}`, fields: body.fields } };
    }
    if (method === "DELETE") {
      state.docs.delete(rel);
      return { statusCode: 200, body: {} };
    }
    return { statusCode: 400, body: { error: "unsupported" } };
  }

  function discord(method, path, body) {
    let m;
    if ((m = /^\/channels\/(\w+)\/messages$/.exec(path)) && method === "POST") {
      const id = nextId();
      state.messages.set(id, { id, channelId: m[1], ...body, reactions: [] });
      return { statusCode: 200, body: { id, channel_id: m[1] } };
    }
    if ((m = /^\/channels\/(\w+)\/messages\/(\w+)$/.exec(path))) {
      const msg = state.messages.get(m[2]);
      if (!msg) return { statusCode: 404, body: { message: "Unknown Message" } };
      if (method === "PATCH") {
        Object.assign(msg, body);
        return { statusCode: 200, body: msg };
      }
      if (method === "DELETE") {
        state.messages.delete(m[2]);
        return { statusCode: 204, body: "" };
      }
    }
    if ((m = /^\/channels\/(\w+)\/messages\/(\w+)\/reactions\/([^/]+)\/@me$/.exec(path))) {
      const msg = state.messages.get(m[2]);
      if (!msg) return { statusCode: 404, body: {} };
      const emoji = decodeURIComponent(m[3]);
      msg.reactions = msg.reactions.filter((e) => e !== emoji);
      if (method === "PUT") msg.reactions.push(emoji);
      return { statusCode: 204, body: "" };
    }
    if ((m = /^\/webhooks\/(\w+)\/([\w.-]+)\/messages\/@original$/.exec(path)) && method === "PATCH") {
      state.originalResponses.push({ token: m[2], ...body });
      return { statusCode: 200, body: {} };
    }
    return { statusCode: 404, body: { message: "mock: unknown discord route" } };
  }

  function github(body) {
    const { query, variables: v } = body;
    const key = `${v.owner}/${v.repo}#${v.number}`;
    if (/issue\(number/.test(query)) return { statusCode: 200, body: { data: { repository: { issue: state.issues.get(key) ?? null } } } };
    if (/pullRequest\(number/.test(query)) return { statusCode: 200, body: { data: { repository: { pullRequest: state.prs.get(key) ?? null } } } };
    return { statusCode: 400, body: { errors: [{ message: "mock: unknown query" }] } };
  }

  function handle({ method = "GET", url, body }) {
    const u = new URL(url);
    const parsed = typeof body === "string" && body.startsWith("{") ? JSON.parse(body) : body;
    state.log.push({ method, path: u.pathname, body: parsed });
    if (u.pathname.startsWith(DOCS)) return firestore(method, u.pathname.slice(DOCS.length), u.searchParams, parsed);
    if (u.pathname.startsWith("/discord")) return discord(method, u.pathname.slice("/discord".length), parsed);
    if (u.pathname === "/github/graphql") return github(parsed);
    return { statusCode: 404, body: { error: `mock: unknown route ${u.pathname}` } };
  }

  const api = {
    state, handle,
    doc: (path) => (state.docs.has(path) ? fromFirestoreFields(state.docs.get(path)) : null),
    docs: (coll) => [...state.docs.entries()].filter(([p]) => p.startsWith(`${coll}/`)).map(([p, f]) => ({ id: p.split("/")[1], ...fromFirestoreFields(f) })),
    channelMessages: (channelId) => [...state.messages.values()].filter((m) => m.channelId === channelId),
  };
  return api;
}

// n8n-style httpRequest(opts) on top of the mock (no network)
export const httpFor = (mock) => async (opts) => {
  const res = mock.handle(opts);
  if (!opts.ignoreHttpStatusErrors && res.statusCode >= 400) {
    const err = new Error(`HTTP ${res.statusCode}`);
    err.statusCode = res.statusCode;
    throw err;
  }
  return opts.returnFullResponse ? { statusCode: res.statusCode, body: res.body, headers: {} } : res.body;
};

export function serve(mock, port) {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const out = mock.handle({ method: req.method, url: `http://localhost:${port}${req.url}`, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(out.statusCode, { "Content-Type": "application/json" });
      res.end(out.statusCode === 204 ? "" : JSON.stringify(out.body));
    });
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

export function ghPr(over = {}) {
  return {
    __typename: "PullRequest",
    number: 42, title: "Login form with validation", url: "https://github.com/mentorflow-lpnu/MentorFlow/pull/42",
    isDraft: false, state: "OPEN", merged: false, createdAt: "2026-11-20T09:00:00Z",
    additions: 120, deletions: 8, reviewDecision: "REVIEW_REQUIRED",
    author: { login: "octocat", avatarUrl: "https://avatars.example/octocat.png", url: "https://github.com/octocat" },
    labels: { nodes: [{ name: "dev" }] },
    repository: { nameWithOwner: "mentorflow-lpnu/MentorFlow" },
    ...over,
  };
}

export function ghIssue(prs = [ghPr()], over = {}) {
  return {
    title: "Login page", url: "https://github.com/mentorflow-lpnu/MentorFlow/issues/17",
    labels: { nodes: [] },
    closedByPullRequestsReferences: { nodes: prs },
    timelineItems: { nodes: [] },
    ...over,
  };
}
