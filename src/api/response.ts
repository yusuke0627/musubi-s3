/**
 * S3 XML response generators (errors, ListBuckets, etc.)
 */

export function s3ErrorResponse(
  code: string,
  message: string,
  resource?: string,
  requestId?: string
): Response {
  const rid = requestId || generateRequestId();
  const resourceXml = resource ? `<Resource>${escapeXml(resource)}</Resource>\n` : "";

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${escapeXml(code)}</Code>
  <Message>${escapeXml(message)}</Message>${resourceXml}
  <RequestId>${escapeXml(rid)}</RequestId>
</Error>`;

  const status = errorStatus(code);

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml",
      "x-amz-request-id": rid,
    },
  });
}

function errorStatus(code: string): number {
  switch (code) {
    case "SignatureDoesNotMatch":
      return 403;
    case "AccessDenied":
      return 403;
    case "NoSuchBucket":
      return 404;
    case "NoSuchKey":
      return 404;
    case "BucketAlreadyExists":
      return 409;
    case "BucketNotEmpty":
      return 409;
    case "InvalidRequest":
      return 400;
    default:
      return 500;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateRequestId(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
