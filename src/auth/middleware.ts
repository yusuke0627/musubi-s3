/**
 * Auth middleware — validates SigV4 signature on all S3 requests.
 * Skips /health endpoint and Web UI API calls (same-origin).
 */

import { verifySignature } from "./signatureV4";
import { s3ErrorResponse } from "../api/response";

export async function authMiddleware(
  req: Request,
  serverHost: string
): Promise<Response | null> {
  const url = new URL(req.url);

  // Skip auth for health check
  if (req.method === "GET" && url.pathname === "/health") {
    return null;
  }

  // Skip auth for Web UI API calls (requests from browser)
  const userAgent = req.headers.get("User-Agent") || "";
  const accept = req.headers.get("Accept") || "";
  
  // If it's a browser request (not AWS CLI), skip auth
  // Browsers have User-Agent containing "Mozilla", "Chrome", "Safari", etc.
  // and accept HTML/text content
  const isBrowser = 
    (userAgent.includes("Mozilla") || userAgent.includes("Chrome") || userAgent.includes("Safari")) &&
    (accept.includes("text/html") || accept.includes("*/*") || accept.includes("application/xml"));
  
  if (isBrowser) {
    return null;
  }

  const valid = await verifySignature(req, serverHost);
  if (!valid) {
    return s3ErrorResponse(
      "SignatureDoesNotMatch",
      "The request signature we calculated does not match the signature you provided. Check your key and signing method."
    );
  }

  return null; // pass through
}
