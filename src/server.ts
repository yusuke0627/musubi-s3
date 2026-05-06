/**
 * HTTP request handler for musubi-s3
 */

import { parseS3Request, S3Context } from "./router";
import { authMiddleware } from "./auth/middleware";
import { handleListBuckets, handleCreateBucket, handleDeleteBucket } from "./api/bucket";

export function handleHealth(): Response {
  return new Response(
    JSON.stringify({ status: "ok", service: "musubi-s3" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function handleNotImplemented(s3Req: S3Context): Response {
  const body = JSON.stringify({
    error: "NotImplemented",
    operation: s3Req.operation,
    bucket: s3Req.bucket,
    key: s3Req.key,
  });
  return new Response(body, {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}

export async function dispatchS3Request(s3Req: S3Context): Promise<Response> {
  switch (s3Req.operation) {
    case "ListBuckets":
      return await handleListBuckets(s3Req);
    case "CreateBucket":
      return await handleCreateBucket(s3Req);
    case "DeleteBucket":
      return await handleDeleteBucket(s3Req);
    default:
      return handleNotImplemented(s3Req);
  }
}

export async function handler(req: Request, serverHost: string = "localhost:9000"): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  // Auth check
  const authResult = await authMiddleware(req, serverHost);
  if (authResult) {
    return authResult;
  }

  try {
    const s3Req = parseS3Request(req, serverHost);
    return await dispatchS3Request(s3Req);
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad Request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
