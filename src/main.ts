const PORT = Number(process.env.MUSUBI_PORT) || 9000;
const HOST = process.env.MUSUBI_HOST || "0.0.0.0";

function handleHealth(): Response {
  return new Response(
    JSON.stringify({ status: "ok", service: "musubi-s3" }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

function handleNotFound(): Response {
  return new Response(
    JSON.stringify({ error: "Not Found" }),
    {
      status: 404,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

function handleRequest(req: Request): Response {
  const url = new URL(req.url);
  const method = req.method;

  if (method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }

  return handleNotFound();
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
