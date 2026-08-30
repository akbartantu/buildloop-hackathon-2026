import { validatePublicGitHubUrl } from "@/lib/repository/public-github-url";

const GITHUB_API_TIMEOUT_MS = 30_000;

type GitHubRef = {
  ref: string;
  object: { sha: string };
};

export async function probePublicRepositoryRefsViaGitHubApi(normalizedUrl: string): Promise<string[]> {
  const validated = validatePublicGitHubUrl(normalizedUrl);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }

  const response = await fetch(
    `https://api.github.com/repos/${validated.owner}/${validated.repo}/git/matching-refs/heads/`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "BuildLoop-Repository-Probe",
      },
      signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS),
    },
  );

  if (response.status === 404) {
    throw Object.assign(new Error("GitHub API repository not found"), {
      code: 404,
      stderr: "GitHub API: repository not found",
    });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw Object.assign(new Error(`GitHub API request failed with HTTP ${response.status}`), {
      code: response.status,
      stderr: detail,
    });
  }

  const refs = (await response.json()) as GitHubRef[];
  return refs.map((entry) => `${entry.object.sha}\t${entry.ref}`);
}
