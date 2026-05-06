/**
 * S3 Request Router — parses S3-style URLs and classifies operations.
 *
 * Supports two URL styles:
 *   Path-style:       GET /{bucket}/{key}
 *   Virtual-hosted:   GET {bucket}.localhost:9000/{key}
 */

export type S3Operation =
  | "ListBuckets"
  | "CreateBucket"
  | "DeleteBucket"
  | "ListObjects"
  | "ListObjectsV2"
  | "PutObject"
  | "GetObject"
  | "DeleteObject"
  | "HeadObject";

export interface S3Request {
  /** Bucket name, or null for service-level operations (ListBuckets) */
  bucket: string | null;
  /** Object key, or null for bucket-level operations */
  key: string | null;
  /** Classified S3 operation */
  operation: S3Operation;
  /** Whether the request uses virtual-hosted-style URLs */
  virtualHosted: boolean;
}

/**
 * Extract the bucket name from the Host header (virtual-hosted-style).
 * e.g. "mybucket.localhost:9000" → "mybucket"
 * Returns null if not virtual-hosted.
 */
function extractBucketFromHost(host: string, serverHost: string): string | null {
  if (!host) return null;

  // Remove port
  const hostname = host.split(":")[0];
  const serverHostname = serverHost.split(":")[0];

  // Must be a subdomain of the server host
  const suffix = `.${serverHostname}`;
  if (hostname.endsWith(suffix) && hostname !== serverHostname) {
    return hostname.slice(0, -suffix.length);
  }

  return null;
}

/**
 * Parse an S3 request from an incoming HTTP request.
 */
export function parseS3Request(
  req: Request,
  serverHost: string = "localhost:9000"
): S3Request {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const urlHost = req.headers.get("host") || url.host;

  // Try virtual-hosted-style first
  const vhBucket = extractBucketFromHost(urlHost, serverHost);
  const pathParts = url.pathname.split("/").filter(Boolean);

  let bucket: string | null;
  let key: string | null;
  let virtualHosted: boolean;

  if (vhBucket) {
    // Virtual-hosted-style: {bucket}.host/{key}
    bucket = vhBucket;
    key = pathParts.length > 0 ? pathParts.join("/") : null;
    virtualHosted = true;
  } else if (pathParts.length === 0) {
    // Path-style root: service-level (ListBuckets)
    bucket = null;
    key = null;
    virtualHosted = false;
  } else {
    // Path-style: /{bucket}/{key}
    bucket = pathParts[0];
    key = pathParts.length > 1 ? pathParts.slice(1).join("/") : null;
    virtualHosted = false;
  }

  const operation = classifyS3Operation(method, bucket, key, url.searchParams);

  return { bucket, key, operation, virtualHosted };
}

/**
 * Classify the S3 operation based on HTTP method, bucket presence, and query params.
 */
function classifyS3Operation(
  method: string,
  bucket: string | null,
  key: string | null,
  params: URLSearchParams
): S3Operation {
  // Service-level operations (no bucket)
  if (bucket === null) {
    if (method === "GET") return "ListBuckets";
    throw new Error(`Unsupported service-level operation: ${method}`);
  }

  // Bucket-level operations (no key)
  if (key === null) {
    switch (method) {
      case "PUT":
        return "CreateBucket";
      case "DELETE":
        return "DeleteBucket";
      case "GET":
      case "HEAD":
        // Check if ListObjectsV2
        if (params.get("list-type") === "2") return "ListObjectsV2";
        return "ListObjects";
      default:
        throw new Error(`Unsupported bucket operation: ${method} /${bucket}`);
    }
  }

  // Object-level operations
  switch (method) {
    case "PUT":
      return "PutObject";
    case "GET":
      return "GetObject";
    case "DELETE":
      return "DeleteObject";
    case "HEAD":
      return "HeadObject";
    default:
      throw new Error(`Unsupported object operation: ${method} /${bucket}/${key}`);
  }
}

export type S3Context = S3Request;
