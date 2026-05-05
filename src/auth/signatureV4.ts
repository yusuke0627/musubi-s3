/**
 * AWS Signature Version 4 — parser and verifier.
 *
 * References:
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
 */

import { getCredentials } from "./credential";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export interface ParsedAuthHeader {
  algorithm: string;
  credentialScope: CredentialScope;
  signedHeaders: string[];
  signature: string;
}

export interface CredentialScope {
  accessKey: string;
  date: string;
  region: string;
  service: string;
  request: string;
}

/**
 * Parse the AWS Authorization header.
 *
 * Format:
 *   AWS4-HMAC-SHA256 Credential=AKID/date/region/service/aws4_request,
 *   SignedHeaders=host;x-amz-content-sha256;x-amz-date,
 *   Signature=hex
 */
export function parseAuthHeader(header: string): ParsedAuthHeader | null {
  const parts = header.split(" ");
  if (parts.length < 2 || parts[0] !== ALGORITHM) {
    return null;
  }

  const params: Record<string, string> = {};
  // Match key=value pairs separated by commas
  const regex = /(\w+)=([^,]+)(?:,|$)/g;
  const tail = parts.slice(1).join(" ");
  let match;
  while ((match = regex.exec(tail)) !== null) {
    params[match[1]] = match[2].trim();
  }

  if (!params.Credential || !params.SignedHeaders || !params.Signature) {
    return null;
  }

  const credentialParts = params.Credential.split("/");
  if (credentialParts.length !== 5) return null;

  const [accessKey, date, region, service, request] = credentialParts;

  return {
    algorithm: parts[0],
    credentialScope: { accessKey, date, region, service, request },
    signedHeaders: params.SignedHeaders.split(";"),
    signature: params.Signature,
  };
}

/**
 * Verify an AWS Signature V4 request.
 *
 * Returns true if the signature is valid, false otherwise.
 */
export async function verifySignature(
  req: Request,
  _serverHost: string
): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const parsed = parseAuthHeader(authHeader);
  if (!parsed) return false;

  const credentials = getCredentials(parsed.credentialScope.accessKey);
  if (!credentials) return false;

  const url = new URL(req.url);
  const canonicalRequest = buildCanonicalRequest(req, url, parsed.signedHeaders);
  const stringToSign = buildStringToSign(
    getAmzDate(req),
    parsed.credentialScope.date,
    parsed.credentialScope.region,
    await sha256(canonicalRequest)
  );

  const signingKey = await deriveSigningKey(
    credentials.secretKey,
    parsed.credentialScope.date,
    parsed.credentialScope.region,
    parsed.credentialScope.service
  );

  const expectedSignature = await computeSignature(signingKey, stringToSign);
  return parsed.signature === expectedSignature;
}

/**
 * Get the x-amz-date header, falling back to Date header.
 */
function getAmzDate(req: Request): string {
  return req.headers.get("x-amz-date") || req.headers.get("date") || "";
}

/**
 * Build the canonical request per AWS SigV4 spec.
 */
function buildCanonicalRequest(
  req: Request,
  url: URL,
  signedHeaders: string[]
): string {
  const method = req.method.toUpperCase();
  const canonicalUri = url.pathname === "/" ? "/" : url.pathname;

  // Sort query params
  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  // Build canonical headers
  const lowerSigned = signedHeaders.map((h) => h.toLowerCase());
  const canonicalHeaders = lowerSigned
    .map((h) => {
      const value = req.headers.get(h) || "";
      return `${h}:${value.trim().replace(/\s+/g, " ")}`;
    })
    .join("\n");

  const signedHeadersStr = lowerSigned.join(";");

  return [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "",
    signedHeadersStr,
    UNSIGNED_PAYLOAD,
  ].join("\n");
}

/**
 * Build the string to sign.
 */
function buildStringToSign(
  amzDate: string,
  dateScope: string,
  region: string,
  hashedCanonicalRequest: string
): string {
  // amzDate should be YYYYMMDDTHHMMSSZ, but extract just the date part for the scope
  const timestamp = amzDate.replace(/^(\d{8})T(\d{6})Z$/, "$1T$2Z");
  const scope = `${dateScope}/${region}/${SERVICE}/aws4_request`;

  return [ALGORITHM, timestamp, scope, hashedCanonicalRequest].join("\n");
}

/**
 * Derive the signing key:
 *   kDate     = HMAC("AWS4" + secret, YYYYMMDD)
 *   kRegion   = HMAC(kDate, region)
 *   kService  = HMAC(kRegion, service)
 *   kSigning  = HMAC(kService, "aws4_request")
 */
async function deriveSigningKey(
  secretKey: string,
  date: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();

  const kDate = await hmac(encoder.encode(`AWS4${secretKey}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * HMAC-SHA256 helper. Returns the raw key (ArrayBuffer).
 */
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const rawKey: ArrayBuffer = key instanceof Uint8Array
    ? key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer
    : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

/**
 * Compute the hex-encoded HMAC-SHA256 signature.
 */
async function computeSignature(
  signingKey: ArrayBuffer,
  stringToSign: string
): Promise<string> {
  const sig = await hmac(signingKey, stringToSign);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 hash, hex-encoded.
 */
async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * RFC 3986 percent-encoding (for canonical query string).
 * Only unreserved characters are left unencoded.
 */
function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
