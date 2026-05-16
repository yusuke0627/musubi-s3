/**
 * HTTP request handler for musubi-s3
 */

import { parseS3Request, S3Context } from "./router";
import { authMiddleware } from "./auth/middleware";
import { handleListBuckets, handleCreateBucket, handleDeleteBucket } from "./api/bucket";
import {
  handlePutObject,
  handleGetObject,
  handleDeleteObject,
  handleHeadObject,
  handleListObjects,
  handleListObjectsV2,
} from "./api/object";
import { serveStaticFile, isWebUIRequest } from "./web/static";

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

export async function dispatchS3Request(s3Req: S3Context, req: Request): Promise<Response> {
  switch (s3Req.operation) {
    // Bucket operations
    case "ListBuckets":
      return await handleListBuckets(s3Req);
    case "CreateBucket":
      return await handleCreateBucket(s3Req);
    case "DeleteBucket":
      return await handleDeleteBucket(s3Req);
    // Object operations
    case "PutObject":
      return await handlePutObject(s3Req, req);
    case "GetObject":
      return await handleGetObject(s3Req);
    case "DeleteObject":
      return await handleDeleteObject(s3Req);
    case "HeadObject":
      return await handleHeadObject(s3Req);
    case "ListObjects":
      return await handleListObjects(s3Req);
    case "ListObjectsV2":
      return await handleListObjectsV2(s3Req);
    default:
      return handleNotImplemented(s3Req);
  }
}

export async function handler(req: Request, serverHost: string = "localhost:9000"): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  // Check if this is a Web UI request
  const isWebUI = isWebUIRequest(req, url.pathname);
  
  if (isWebUI) {
    const staticResponse = await serveStaticFile(url.pathname);
    if (staticResponse) {
      return staticResponse;
    }
  }

  // Auth check for API endpoints
  const authResult = await authMiddleware(req, serverHost);
  if (authResult) {
    return authResult;
  }

  try {
    const s3Req = parseS3Request(req, serverHost);
    return await dispatchS3Request(s3Req, req);
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad Request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
