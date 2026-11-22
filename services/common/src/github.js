const GH_URL = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/i;

export function parseGithubUrl(url) {
  const m = GH_URL.exec(String(url ?? "").trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], kind: m[3].toLowerCase() === "pull" ? "pr" : "issue", number: Number(m[4]) };
}

const PR_FIELDS = `
  number title url isDraft state merged createdAt additions deletions reviewDecision
  author { login avatarUrl url }
  labels(first: 20) { nodes { name } }
  repository { nameWithOwner }`;

export const ISSUE_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      title url
      labels(first: 20) { nodes { name } }
      closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { ${PR_FIELDS} } }
      timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
        nodes {
          __typename
          ... on CrossReferencedEvent { source { __typename ... on PullRequest { ${PR_FIELDS} } } }
          ... on ConnectedEvent { subject { __typename ... on PullRequest { ${PR_FIELDS} } } }
        }
      }
    }
  }
}`;

export const PR_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) { ${PR_FIELDS} } }
}`;

export function normalizePr(p) {
  const [owner, repo] = p.repository.nameWithOwner.split("/");
  return {
    owner, repo, number: p.number, title: p.title, url: p.url,
    draft: !!p.isDraft,
    state: p.merged ? "MERGED" : p.state,
    reviewDecision: p.reviewDecision ?? null,
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    createdAt: p.createdAt,
    author: { login: p.author?.login ?? "ghost", avatarUrl: p.author?.avatarUrl ?? null, url: p.author?.url ?? null },
    labels: (p.labels?.nodes ?? []).map((l) => l.name),
  };
}

// PR candidates from an issue: closing references first, then cross-references and connected events.
// Drafts are skipped; the newest open PR wins, otherwise the newest PR.
export function pickLinkedPr(issue) {
  const found = new Map();
  for (const p of issue.closedByPullRequestsReferences?.nodes ?? []) found.set(p.url, p);
  for (const n of issue.timelineItems?.nodes ?? []) {
    const p = n.source ?? n.subject;
    if (p?.__typename === "PullRequest") found.set(p.url, p);
  }
  const prs = [...found.values()].map(normalizePr).filter((p) => !p.draft);
  prs.sort((a, b) => (Number(b.state === "OPEN") - Number(a.state === "OPEN")) || String(b.createdAt).localeCompare(String(a.createdAt)));
  return prs[0] ?? null;
}

export function createGithub(ctx) {
  const { http, env } = ctx;
  const url = `${(env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "")}/graphql`;

  async function graphql(query, variables) {
    const res = await http({
      method: "POST", url, json: true,
      body: { query, variables },
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN || ""}`,
        "Content-Type": "application/json",
        "User-Agent": "mentorflow-bot",
      },
      returnFullResponse: true, ignoreHttpStatusErrors: true,
    });
    if (res.statusCode >= 300 || res.body?.errors?.length)
      throw new Error(`GitHub GraphQL: ${res.statusCode} ${JSON.stringify(res.body?.errors ?? res.body)}`);
    return res.body.data;
  }

  return {
    // { task: { title, url, labels }, pr } for an issue URL; for a PR URL the PR itself
    async findPrForTask(taskUrl) {
      const ref = parseGithubUrl(taskUrl);
      if (!ref) return { ref: null, issue: null, pr: null };
      const vars = { owner: ref.owner, repo: ref.repo, number: ref.number };
      if (ref.kind === "pr") {
        const data = await graphql(PR_QUERY, vars);
        const p = data.repository?.pullRequest;
        return { ref, issue: null, pr: p && !p.isDraft ? normalizePr(p) : null };
      }
      const data = await graphql(ISSUE_QUERY, vars);
      const issue = data.repository?.issue;
      if (!issue) return { ref, issue: null, pr: null };
      return {
        ref,
        issue: { title: issue.title, url: issue.url, labels: (issue.labels?.nodes ?? []).map((l) => l.name) },
        pr: pickLinkedPr(issue),
      };
    },
    async getPr(owner, repo, number) {
      const data = await graphql(PR_QUERY, { owner, repo, number });
      const p = data.repository?.pullRequest;
      return p ? normalizePr(p) : null;
    },
  };
}
