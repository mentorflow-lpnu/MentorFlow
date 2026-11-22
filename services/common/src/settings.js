// settings/main merged over defaults; environment variables are fallbacks until the mentor panel sets them.

const LABEL_ROLE_ENV = {
  dev: "DEVELOPER_ROLE_ID",
  devops: "DEVOPS_ROLE_ID",
  qa: "STUDENT_QA_ID",
  qc: "STUDENT_QC_ID",
};

function labelRolesFromEnv(env) {
  return Object.fromEntries(Object.entries(LABEL_ROLE_ENV).filter(([, key]) => env[key]).map(([label, key]) => [label, env[key]]));
}

export function defaultSettings(env = {}) {
  return {
    channels: {
      prReview: env.PR_REVIEW_CHANNEL_ID || null,
      meetings: env.MEETINGS_CHANNEL_ID || null,
    },
    pr: {
      labelRoles: labelRolesFromEnv(env),
      defaultRoleIds: env.DEFAULT_PR_ROLE_ID ? [env.DEFAULT_PR_ROLE_ID] : [],
      resendAfterHours: 12,
      emojis: { approved: "✅", merged: "🟣", changesRequested: "🔁" },
    },
    meetings: {
      reminders: [30, 5],
      timezone: "Europe/Kyiv",
    },
  };
}

function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === null || v === undefined) continue;
    out[k] = base?.[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

export function mergeSettings(defaults, stored) {
  const { id, ...rest } = stored ?? {};
  return merge(defaults, rest);
}

export async function loadSettings(fs, env) {
  return mergeSettings(defaultSettings(env), await fs.get("settings/main"));
}
