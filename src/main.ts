import { parseS3Request } from "./router";
import type { S3Request } from "./router";
import { authMiddleware } from "./auth/middleware";

const PORT = Number(process.env.MUSUBI_PORT) || 9000;
const HOST = process.env.MUSUBI_HOST || "0.0.0.0";
const SERVER_HOST = `${HOST}:${PORT}`;

function handleHealth(): Response {
  return new Response(
    JSON.stringify({ status: "ok", service: "musubi-s3" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function handleNotImplemented(s3Req: S3Request): Response {
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

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  // Auth check
  const authResult = await authMiddleware(req, SERVER_HOST);
  if (authResult) {
    return authResult;
  }

  try {
    const s3Req = parseS3Request(req, SERVER_HOST);
    return handleNotImplemented(s3Req);
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad Request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: handleRequest,
});

console.log(`musubi-s3 listening on http://${HOST}:${PORT}`);

process.on("SIGINT", () => {
  console.log("\nShutting down musubi-s3...");
  server.stop(true);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down musubi-s3...");
  server.stop(true);
  process.exit(0);
});
