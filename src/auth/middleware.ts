/**
 * Auth middleware — validates SigV4 signature on all S3 requests.
 * Skips /health endpoint.
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

  const valid = await verifySignature(req, serverHost);
  if (!valid) {
    return s3ErrorResponse(
      "SignatureDoesNotMatch",
      "The request signature we calculated does not match the signature you provided. Check your key and signing method."
    );
  }

  return null; // pass through
}
