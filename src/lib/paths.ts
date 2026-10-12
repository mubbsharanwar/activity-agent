export const GITHUB_API_URL = "https://api.github.com";
export const GITHUB_REPOS_PATH = "/repos";
export const GITHUB_README_PATH = "/readme";

export function githubRepositoryUrl(owner: string, repo: string) {
  return `${GITHUB_API_URL}${GITHUB_REPOS_PATH}/${owner}/${repo}`;
}

export function githubReadmeUrl(owner: string, repo: string) {
  return `${githubRepositoryUrl(owner, repo)}${GITHUB_README_PATH}`;
}
