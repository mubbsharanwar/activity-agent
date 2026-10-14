import { githubReadmeUrl, githubRepositoryUrl } from "@/lib/paths";

const README_LIMIT = 8000;

export async function getRepository() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!token) throw new Error("Add GITHUB_TOKEN to .env.local and restart the dev server.");
  const parts = repository?.split("/") ?? [];
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name || parts.length !== 2) {
    throw new Error("Add GITHUB_REPOSITORY as owner/name to .env.local and restart the dev server.");
  }

  const repoResponse = await fetch(githubRepositoryUrl(owner, name), {
    headers: githubHeaders(token),
  });
  if (repoResponse.status === 401) return "GitHub rejected GITHUB_TOKEN.";
  if (repoResponse.status === 404) return `GitHub repository ${owner}/${name} was not found.`;
  if (!repoResponse.ok) return `GitHub repository request failed (${repoResponse.status}).`;

  const repo = (await repoResponse.json()) as {
    full_name?: string;
    description?: string | null;
    default_branch?: string;
    language?: string | null;
    stargazers_count?: number;
    topics?: string[];
    license?: { name?: string | null } | null;
    html_url?: string;
  };

  const readmeResponse = await fetch(githubReadmeUrl(owner, name), {
    headers: githubHeaders(token),
  });
  let readme = "";
  if (readmeResponse.ok) {
    const body = (await readmeResponse.json()) as { content?: string; encoding?: string };
    if (body.encoding === "base64" && body.content) {
      readme = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8").slice(0, README_LIMIT);
    }
  }

  return JSON.stringify({
    fullName: repo.full_name ?? `${owner}/${name}`,
    description: repo.description ?? "",
    defaultBranch: repo.default_branch ?? "",
    language: repo.language ?? "",
    stars: repo.stargazers_count ?? 0,
    topics: repo.topics ?? [],
    license: repo.license?.name ?? "",
    url: repo.html_url ?? "",
    readme,
  });
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "activity-agent",
  };
}
