import { readFileSync } from "node:fs";
import path from "node:path";
import { activityFromPayload, type ActivityCode } from "@/lib/activities";
import { ACTIVITY_DIR, GITHUB_API_URL, GITHUB_GIT_PATH, githubRepositoryUrl } from "@/lib/constants";

const README_LIMIT = 8000;
const REPOSITORY_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    description
    url
    defaultBranchRef { name }
    primaryLanguage { name }
    stargazerCount
    repositoryTopics(first: 20) { nodes { topic { name } } }
    licenseInfo { name }
    readme: object(expression: "HEAD:README.md") { ... on Blob { text } }
  }
}`;

export async function getRepository() {
  const { token, owner, name } = githubConfig();
  const response = await fetch(`${GITHUB_API_URL}/graphql`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({ query: REPOSITORY_QUERY, variables: { owner, name } }),
  });
  if (response.status === 401) return "GitHub rejected GITHUB_TOKEN.";
  if (!response.ok) return `GitHub repository request failed (${response.status}).`;

  const body = (await response.json()) as {
    data?: {
      repository?: {
        nameWithOwner?: string;
        description?: string | null;
        url?: string;
        defaultBranchRef?: { name?: string } | null;
        primaryLanguage?: { name?: string } | null;
        stargazerCount?: number;
        repositoryTopics?: { nodes?: { topic?: { name?: string } | null }[] | null } | null;
        licenseInfo?: { name?: string | null } | null;
        readme?: { text?: string | null } | null;
      } | null;
    };
  };
  const repo = body.data?.repository;
  if (!repo) return githubAccessError(owner, name);
  const branch = repo.defaultBranchRef?.name || "main";

  return JSON.stringify({
    fullName: repo.nameWithOwner ?? `${owner}/${name}`,
    description: repo.description ?? "",
    defaultBranch: branch,
    language: repo.primaryLanguage?.name ?? "",
    stars: repo.stargazerCount ?? 0,
    topics: (repo.repositoryTopics?.nodes ?? []).map((item) => item.topic?.name ?? "").filter(Boolean),
    license: repo.licenseInfo?.name ?? "",
    url: repo.url ?? "",
    readme: (repo.readme?.text ?? "").slice(0, README_LIMIT),
    activityFiles: await activityFiles(branch),
  });
}

export async function pushActivity(rawArguments: unknown) {
  const decision = activityFromPayload(rawArguments);
  if (decision.kind === "invalid") {
    console.error("Activity publish:", decision.reason);
    return decision.reason;
  }
  if (decision.kind === "exists") return "This activity already exists.";

  const published = await publishActivity(decision.activity);
  if (published.exists) return "This activity already exists.";
  return published.url;
}

async function activityFiles(branch: string) {
  const { response } = await githubFetch(`${GITHUB_GIT_PATH}/trees/${branch}?recursive=1`);
  if (!response.ok) return [];
  const body = (await response.json()) as { tree?: { path?: string }[] };
  const prefix = `${ACTIVITY_DIR}/`;
  return (body.tree ?? [])
    .map((item) => item.path ?? "")
    .filter((filePath) => filePath.startsWith(prefix))
    .slice(0, 200);
}

async function publishActivity(activity: ActivityCode) {
  const dataPath = `${ACTIVITY_DIR}/${activity.slug}/data.json`;
  const existing = await githubFetch(`/contents/${dataPath}`);
  if (existing.response.status === 200) return { exists: true as const, title: activity.title, url: "" };
  if (existing.response.status === 401) throw new Error("GitHub rejected GITHUB_TOKEN.");

  const repoResult = await githubFetch("");
  if (repoResult.response.status === 404) throw new Error(githubAccessError(repoResult.owner, repoResult.name));
  if (!repoResult.response.ok) throw new Error(`GitHub repository request failed (${repoResult.response.status}).`);
  const repo = (await repoResult.response.json()) as { default_branch?: string; html_url?: string };
  const branch = repo.default_branch || "main";
  const parent = await branchTip(branch);

  const sources = activitySources(activity);
  const workflow = await githubFetch("/contents/.github/workflows/build.yml");
  const files = [
    { path: sources.componentPath, mode: "100644", type: "blob", content: sources.component },
    { path: sources.pagePath, mode: "100644", type: "blob", content: sources.page },
    { path: sources.dataPath, mode: "100644", type: "blob", content: sources.data },
    { path: sources.cssPath, mode: "100644", type: "blob", content: sources.css },
  ];
  if (workflow.response.status !== 200) {
    files.push({ path: ".github/workflows/build.yml", mode: "100644", type: "blob", content: buildWorkflow() });
  }

  const tree = await githubJson<{ sha: string }>(`${GITHUB_GIT_PATH}/trees`, {
    method: "POST",
    body: JSON.stringify({
      ...(parent.tree ? { base_tree: parent.tree } : {}),
      tree: files,
    }),
  }, "GitHub could not write the activity files");
  const commit = await githubJson<{ sha: string }>(`${GITHUB_GIT_PATH}/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Add activity ${activity.title}`,
      tree: tree.sha,
      parents: parent.sha ? [parent.sha] : [],
    }),
  }, "GitHub could not create the activity commit");
  await updateBranch(branch, commit.sha, Boolean(parent.sha));

  return {
    exists: false as const,
    title: activity.title,
    sha: commit.sha,
    url: `${repo.html_url ?? `https://github.com/${repoResult.owner}/${repoResult.name}`}/commit/${commit.sha}`,
  };
}

async function branchTip(branch: string) {
  const refResult = await githubFetch(`${GITHUB_GIT_PATH}/ref/heads/${branch}`);
  if (refResult.response.status === 404 || refResult.response.status === 409) return { sha: "", tree: "" };
  if (!refResult.response.ok) throw new Error(`GitHub branch ${branch} was not found.`);
  const ref = (await refResult.response.json()) as { object: { sha: string } };
  const commit = await githubJson<{ tree: { sha: string } }>(
    `${GITHUB_GIT_PATH}/commits/${ref.object.sha}`,
    undefined,
    "GitHub could not read the latest commit",
  );
  return { sha: ref.object.sha, tree: commit.tree.sha };
}

async function updateBranch(branch: string, sha: string, hasParent: boolean) {
  const update = hasParent
    ? await githubFetch(`${GITHUB_GIT_PATH}/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha }) })
    : await githubFetch(`${GITHUB_GIT_PATH}/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }) });
  if (!update.response.ok) throw new Error(`GitHub could not push the activity commit (${update.response.status}).`);
}

async function githubJson<T>(requestPath: string, init: RequestInit | undefined, failure: string) {
  const { response } = await githubFetch(requestPath, init);
  if (!response.ok) throw new Error(`${failure} (${response.status}).`);
  return (await response.json()) as T;
}

function activitySources(activity: ActivityCode) {
  const directory = `${ACTIVITY_DIR}/${activity.slug}`;
  return {
    componentPath: `${directory}/activity.tsx`,
    pagePath: `${directory}/page.tsx`,
    dataPath: `${directory}/data.json`,
    cssPath: `${directory}/activity.css`,
    component: withNewline(activity.component),
    page: pageSource(activity.page),
    data: `${JSON.stringify({ ...activity.data, title: activity.title }, null, 2)}\n`,
    css: withNewline(activity.css),
  };
}

function buildWorkflow() {
  return withNewline(readFileSync(path.join(process.cwd(), ".github/workflows/build.yml"), "utf8"));
}

function pageSource(modelPage: string) {
  if (modelPage.includes("./activity") && modelPage.includes("./data.json")) return withNewline(modelPage);
  return `import Activity from "./activity";\nimport data from "./data.json";\n\nexport default function Page() {\n  return <Activity data={data} />;\n}\n`;
}

function withNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "activity-agent",
    "Content-Type": "application/json",
  };
}

function githubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!token) throw new Error("Add GITHUB_TOKEN to .env.local and restart the dev server.");
  const parts = repository?.split("/") ?? [];
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name || parts.length !== 2) {
    throw new Error("Add GITHUB_REPOSITORY as owner/name to .env.local and restart the dev server.");
  }
  return { token, owner, name };
}

function githubAccessError(owner: string, name: string) {
  return `GitHub could not access ${owner}/${name}. Add that repository to GITHUB_TOKEN with Contents read and write, then restart the dev server.`;
}

async function githubFetch(requestPath: string, init?: RequestInit) {
  const { token, owner, name } = githubConfig();
  const response = await fetch(`${githubRepositoryUrl(owner, name)}${requestPath}`, {
    ...init,
    headers: githubHeaders(token),
  });
  return { response, owner, name };
}
