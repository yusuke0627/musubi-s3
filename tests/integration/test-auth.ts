/**
 * Test helper to generate valid AWS SigV4 authentication headers
 * Uses the same credentials as the server expects
 */

const ACCESS_KEY = "musubi";
const SECRET_KEY = "musubi-secret";
const REGION = "us-east-1";
const SERVICE = "s3";

/**
 * Generate AWS SigV4 auth headers for testing
 */
export async function generateTestAuthHeaders(
  method: string,
  url: string
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const query = parsedUrl.search.slice(1); // Remove leading '?'
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  
  const credential = `${ACCESS_KEY}/${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const signedHeaders = "host;x-amz-date";
  
  // Create canonical request
  const canonicalRequest = createCanonicalRequest(
    method,
    path,
    query,
    host,
    timeStamp,
    signedHeaders
  );
  
  // Create string to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const stringToSign = `${algorithm}\n${timeStamp}\n${dateStamp}/${REGION}/${SERVICE}/aws4_request\n${await hashHex(canonicalRequest)}`;
  
  // Calculate signature
  const signature = await calculateSignature(
    SECRET_KEY,
    dateStamp,
    REGION,
    SERVICE,
    stringToSign
  );
  
  const authHeader = `${algorithm} Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    "Authorization": authHeader,
    "x-amz-date": timeStamp,
    "Host": host,
  };
}

function createCanonicalRequest(
  method: string,
  path: string,
  query: string,
  host: string,
  amzDate: string,
  signedHeaders: string
): string {
  const canonicalUri = path || "/";
  const canonicalQueryString = query || "";
  
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const payloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // Empty string hash
  
  return [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
}

async function hashHex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return signature;
}

async function calculateSignature(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
  stringToSign: string
): Promise<string> {
  const encoder = new TextEncoder();
  
  // kDate = HMAC("AWS4" + secretKey, dateStamp)
  const kDate = await hmacSha256(
    encoder.encode("AWS4" + secretKey).buffer,
    dateStamp
  );
  
  // kRegion = HMAC(kDate, region)
  const kRegion = await hmacSha256(new Uint8Array(kDate).buffer, region);
  
  // kService = HMAC(kRegion, service)
  const kService = await hmacSha256(new Uint8Array(kRegion).buffer, service);
  
  // kSigning = HMAC(kService, "aws4_request")
  const kSigning = await hmacSha256(new Uint8Array(kService).buffer, "aws4_request");
  
  // signature = HMAC(kSigning, stringToSign)
  const signature = await hmacSha256(kSigning, stringToSign);
  
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
