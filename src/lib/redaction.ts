const SECRET_PATTERNS: RegExp[] = [
  /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|CREDENTIAL)[A-Z0-9_]*\s*=\s*\S+/gi,
  /\b(api[_-]?key|secret|password|token|credential|private[_-]?key)\s*[:=]\s*\S+/gi,
  /\b(sk-[a-zA-Z0-9]{10,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{20,})\b/g,
  /\b(AIza[0-9A-Za-z\-_]{20,})\b/g,
  /\b(Bearer\s+[A-Za-z0-9\-._~+/]+=*)\b/gi,
  /\b(xox[baprs]-[A-Za-z0-9-]+)\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

const ENV_LINE = /^([A-Z0-9_]+)=(.+)$/;

export function redactSecrets(input: string): string {
  if (!input) return input;
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => {
      const label = match.split(/[:=]/)[0]?.trim() ?? "secret";
      return `${label}=[REDACTED]`;
    });
  }
  return output
    .split("\n")
    .map((line) => {
      const envMatch = ENV_LINE.exec(line.trim());
      if (!envMatch) return line;
      const [, key, value] = envMatch;
      if (key && value && /key|secret|token|password|credential/i.test(key)) {
        return `${key}=[REDACTED]`;
      }
      return line;
    })
    .join("\n");
}

export function safeLogSummary(input: string, maxLength = 500): string {
  const redacted = redactSecrets(input);
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, maxLength)}…`;
}
