import { describe, expect, test } from "bun:test";
import { parseAuthHeader, verifySignature } from "../../src/auth/signatureV4";

// Reuse SigV4 computation from the implementation for test signing
const ALGORITHM = "AWS4-HMAC-SHA256";
const REGION = "ap-northeast-1";
const SERVICE = "s3";
const ACCESS_KEY = "musubi";
const SECRET_KEY = "musubi-secret";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const rawKey: ArrayBuffer = key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(date: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmac(encoder.encode("AWS4" + SECRET_KEY).buffer as ArrayBuffer, date);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function signRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  query: string = ""
): Promise<Request> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const dateScope = amzDate.substring(0, 8);

  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = UNSIGNED_PAYLOAD;

  const signedHeaders = Object.keys(headers)
    .map((h) => h.toLowerCase())
    .sort()
    .join(";");

  // Build canonical request
  const canonicalUri = path;
  const canonicalQuery = query
    .replace(/^\?/, "")
    .split("&")
    .filter(Boolean)
    .map((p) => {
      const [k, v] = p.split("=");
      return `${encodeRfc3986(k)}=${encodeRfc3986(v || "")}`;
    })
    .sort()
    .join("&");

  const lowerSigned = signedHeaders.split(";");
  const canonicalHeaders = lowerSigned
    .map((h) => `${h}:${headers[h] || headers[h.toLowerCase()] || ""}`)
    .join("\n");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "",
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join("\n");

  // String to sign
  const scope = `${dateScope}/${REGION}/${SERVICE}/aws4_request`;
  const hashedRequest = await sha256(canonicalRequest);
  const stringToSign = [ALGORITHM, amzDate, scope, hashedRequest].join("\n");

  // Sign
  const signingKey = await deriveSigningKey(dateScope);
  const signature = await (async () => {
    const sigBuf = await hmac(signingKey, stringToSign);
    return Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  })();

  const authHeader = `${ALGORITHM} Credential=${ACCESS_KEY}/${dateScope}/${REGION}/${SERVICE}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const allHeaders = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    allHeaders.set(k, v);
  }
  allHeaders.set("authorization", authHeader);

  const url = `http://localhost:9000${path}${query}`;
  return new Request(url, { method, headers: allHeaders });
}

describe("parseAuthHeader", () => {
  test("parses a valid SigV4 Authorization header", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=musubi/20260505/ap-northeast-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=abcdef123456";
    const parsed = parseAuthHeader(header);

    expect(parsed).not.toBeNull();
    expect(parsed!.algorithm).toBe(ALGORITHM);
    expect(parsed!.credentialScope.accessKey).toBe("musubi");
    expect(parsed!.credentialScope.date).toBe("20260505");
    expect(parsed!.credentialScope.region).toBe(REGION);
    expect(parsed!.credentialScope.service).toBe(SERVICE);
    expect(parsed!.credentialScope.request).toBe("aws4_request");
    expect(parsed!.signedHeaders).toEqual([
      "host",
      "x-amz-content-sha256",
      "x-amz-date",
    ]);
    expect(parsed!.signature).toBe("abcdef123456");
  });

  test("returns null for non-SigV4 header", () => {
    expect(parseAuthHeader("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseAuthHeader("")).toBeNull();
  });

  test("returns null for invalid credential format", () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=musubi, SignedHeaders=host, Signature=abc";
    expect(parseAuthHeader(header)).toBeNull();
  });

  test("returns null for missing fields", () => {
    expect(
      parseAuthHeader(
        "AWS4-HMAC-SHA256 Credential=musubi/20260505/ap-northeast-1/s3/aws4_request"
      )
    ).toBeNull();
  });
});

describe("verifySignature", () => {
  test("validates a correctly signed GET request", async () => {
    const req = await signRequest("GET", "/", {
      host: "localhost:9000",
    });

    const valid = await verifySignature(req, "localhost:9000");
    expect(valid).toBe(true);
  });

  test("validates a correctly signed PUT request", async () => {
    const req = await signRequest("PUT", "/mybucket", {
      host: "localhost:9000",
    });

    const valid = await verifySignature(req, "localhost:9000");
    expect(valid).toBe(true);
  });

  test("validates a request with query params", async () => {
    const req = await signRequest(
      "GET",
      "/mybucket",
      { host: "localhost:9000" },
      "?list-type=2"
    );

    const valid = await verifySignature(req, "localhost:9000");
    expect(valid).toBe(true);
  });

  test("rejects unsigned request", async () => {
    const req = new Request("http://localhost:9000/mybucket", {
      method: "GET",
      headers: { host: "localhost:9000" },
    });

    const valid = await verifySignature(req, "localhost:9000");
    expect(valid).toBe(false);
  });

  test("rejects request with wrong secret key", async () => {
    // Create a request signed with wrong key
    const wrongReq = new Request("http://localhost:9000/", {
      method: "GET",
      headers: {
        host: "localhost:9000",
        authorization:
          "AWS4-HMAC-SHA256 Credential=musubi/20260505/ap-northeast-1/s3/aws4_request, SignedHeaders=host, Signature=0000000000000000000000000000000000000000000000000000000000000000",
      },
    });

    const valid = await verifySignature(wrongReq, "localhost:9000");
    expect(valid).toBe(false);
  });

  test("rejects request with unknown access key", async () => {
    const header =
      "AWS4-HMAC-SHA256 Credential=unknown/20260505/ap-northeast-1/s3/aws4_request, SignedHeaders=host, Signature=abc";

    const req = new Request("http://localhost:9000/", {
      method: "GET",
      headers: { host: "localhost:9000", authorization: header },
    });

    const valid = await verifySignature(req, "localhost:9000");
    expect(valid).toBe(false);
  });
});
