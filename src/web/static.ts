/**
 * Static file serving for Web UI
 */

import { join } from "node:path";

const PUBLIC_DIR = "./public";

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Check if a request is for the Web UI
 */
export function isWebUIRequest(req: Request, pathname: string): boolean {
  const acceptHeader = req.headers.get("Accept") || "";
  const secFetchDest = req.headers.get("Sec-Fetch-Dest");
  
  // Use Sec-Fetch-Dest header when available (modern browsers)
  // "document" = browser page navigation → Web UI
  // "empty" = fetch/XHR from JavaScript → API
  if (secFetchDest === "document") {
    return true;
  }
  if (secFetchDest === "empty") {
    return false;
  }
  
  // Fallback for older browsers or non-browser clients
  // If client explicitly wants HTML, it's a browser page request
  if (acceptHeader.includes("text/html") && !acceptHeader.includes("application/xml")) {
    return true;
  }
  
  // If it's requesting XML, it's an API call
  if (acceptHeader.includes("application/xml") || 
      acceptHeader.includes("text/xml")) {
    return false;
  }
  
  // Root path with generic Accept header → check if it's a browser
  if (pathname === "/") {
    const userAgent = req.headers.get("User-Agent") || "";
    // If it's a browser but not explicitly requesting XML, serve Web UI
    if (userAgent.includes("Mozilla") && !acceptHeader.includes("application/json")) {
      return true;
    }
  }
  
  // Static assets
  const webUIPaths = [
    "/index.html",
    "/app.js",
    "/app.ts",
    "/style.css",
    "/favicon.ico",
  ];
  
  return webUIPaths.includes(pathname);
}

/**
 * Serve static file from public directory
 */
export async function serveStaticFile(pathname: string): Promise<Response | null> {
  // Map root to index.html
  const filePath = pathname === "/" 
    ? join(PUBLIC_DIR, "index.html")
    : join(PUBLIC_DIR, pathname);

  try {
    const file = Bun.file(filePath);
    
    // Check if file exists
    if (!(await file.exists())) {
      return null;
    }

    const mimeType = getMimeType(filePath);
    
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache", // For development
      },
    });
  } catch {
    return null;
  }
}
