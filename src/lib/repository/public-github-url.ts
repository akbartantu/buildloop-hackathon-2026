const PUBLIC_GITHUB_HTTPS_PATTERN =
  /^https:\/\/github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/;

export type PublicGitHubUrlValidationResult =
  | {
      ok: true;
      normalizedUrl: string;
      owner: string;
      repo: string;
      repoName: string;
    }
  | { ok: false; reason: string };

export function isPublicGitHubRepoUrl(value: string): boolean {
  return validatePublicGitHubUrl(value).ok;
}

export function validatePublicGitHubUrl(raw: string): PublicGitHubUrlValidationResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, reason: "Repository URL is required." };
  }

  if (/[\r\n]/.test(trimmed)) {
    return { ok: false, reason: "Repository URL is invalid." };
  }

  if (trimmed.startsWith("git@") || trimmed.startsWith("ssh://")) {
    return { ok: false, reason: "SSH repository URLs are not supported." };
  }

  if (trimmed.includes("@")) {
    return { ok: false, reason: "Credential-bearing repository URLs are not supported." };
  }

  if (trimmed.startsWith("file:")) {
    return { ok: false, reason: "Local file URLs are not supported." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "Repository URL is invalid." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS repository URLs are supported." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Credential-bearing repository URLs are not supported." };
  }

  if (parsed.hostname !== "github.com") {
    return { ok: false, reason: "Only public GitHub repositories are supported." };
  }

  const match = PUBLIC_GITHUB_HTTPS_PATTERN.exec(parsed.toString().replace(/\/$/, ""));
  if (!match) {
    return { ok: false, reason: "Enter a valid public GitHub repository URL." };
  }

  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/, "");
  const normalizedUrl = `https://github.com/${owner}/${repo}`;

  return {
    ok: true,
    normalizedUrl,
    owner,
    repo,
    repoName: `${owner}/${repo}`,
  };
}
