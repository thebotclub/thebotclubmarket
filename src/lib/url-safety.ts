/**
 * SEC-009: URL Safety utilities — block SSRF via private/loopback/link-local IPs
 *
 * Used for:
 * - Webhook URLs (server-side fetch)
 * - fileUrls in submissions (stored URLs)
 */

const BLOCKED_HOSTNAME_PATTERNS = [
  // Loopback
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^::1$/,
  // Private RFC 1918
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  // Link-local
  /^169\.254\.\d+\.\d+$/,
  /^fe80:/i,
  // Other reserved
  /^0\.0\.0\.0$/,
  /^::$/,
  /^fc[0-9a-f]{2}:/i,  // Unique local IPv6
  /^fd[0-9a-f]{2}:/i,
];

const ALLOWED_SCHEMES = ["https:", "http:"];

/**
 * Returns an error string if the URL is unsafe, or null if OK.
 * For webhook URLs, require HTTPS. For fileUrls, allow HTTP too (CDN links).
 */
export function validatePublicUrl(
  rawUrl: string,
  options: { requireHttps?: boolean } = {}
): { safe: true } | { safe: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { safe: false, reason: `Scheme '${parsed.protocol}' is not allowed` };
  }

  if (options.requireHttps && parsed.protocol !== "https:") {
    return { safe: false, reason: "Only HTTPS webhook URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: "URL resolves to a private or reserved address" };
    }
  }

  // Block metadata services (AWS, GCP, Azure, etc.)
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return { safe: false, reason: "Cloud metadata endpoints are not allowed" };
  }

  return { safe: true };
}

/**
 * Zod refinement helper: validates a URL string is public-safe.
 */
export function isPublicUrl(url: string): boolean {
  return validatePublicUrl(url).safe;
}
