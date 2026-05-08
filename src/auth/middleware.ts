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

  // Skip auth for Web UI API calls (same-origin requests from browser)
  // Check if request is from same origin (Web UI)
  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const host = req.headers.get("Host");
  
  // If Origin or Referer matches our host, it's a same-origin request from Web UI
  if (host && ((origin && origin.includes(host)) || (referer && referer.includes(host)))) {
    return null;
  }
  
  // Also skip if it's a fetch request from the browser (Sec-Fetch-Site header)
  const secFetchSite = req.headers.get("Sec-Fetch-Site");
  if (secFetchSite === "same-origin") {
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
