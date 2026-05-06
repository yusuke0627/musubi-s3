/**
 * musubi-s3 entry point
 */

import { handler } from "./server";

const PORT = Number(process.env.MUSUBI_PORT) || 9000;
const HOST = process.env.MUSUBI_HOST || "0.0.0.0";
const SERVER_HOST = `${HOST}:${PORT}`;

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: (req) => handler(req, SERVER_HOST),
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
