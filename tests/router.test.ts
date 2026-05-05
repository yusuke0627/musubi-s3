import { describe, expect, test } from "bun:test";
import { parseS3Request } from "../src/router";
import type { S3Request } from "../src/router";

function makeRequest(
  method: string,
  pathname: string,
  host: string = "localhost:9000",
  search: string = ""
): Request {
  return new Request(`http://${host}${pathname}${search}`, {
    method,
    headers: { host },
  });
}

function parse(method: string, pathname: string, host?: string, search?: string): S3Request {
  return parseS3Request(makeRequest(method, pathname, host, search));
}

describe("parseS3Request — Path-style", () => {
  test("GET / → ListBuckets", () => {
    const r = parse("GET", "/");
    expect(r.operation).toBe("ListBuckets");
    expect(r.bucket).toBeNull();
    expect(r.key).toBeNull();
    expect(r.virtualHosted).toBe(false);
  });

  test("PUT /mybucket → CreateBucket", () => {
    const r = parse("PUT", "/mybucket");
    expect(r.operation).toBe("CreateBucket");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBeNull();
  });

  test("DELETE /mybucket → DeleteBucket", () => {
    const r = parse("DELETE", "/mybucket");
    expect(r.operation).toBe("DeleteBucket");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBeNull();
  });

  test("GET /mybucket → ListObjects", () => {
    const r = parse("GET", "/mybucket");
    expect(r.operation).toBe("ListObjects");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBeNull();
  });

  test("GET /mybucket?list-type=2 → ListObjectsV2", () => {
    const r = parse("GET", "/mybucket", "localhost:9000", "?list-type=2");
    expect(r.operation).toBe("ListObjectsV2");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBeNull();
  });

  test("PUT /mybucket/hello.txt → PutObject", () => {
    const r = parse("PUT", "/mybucket/hello.txt");
    expect(r.operation).toBe("PutObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("hello.txt");
  });

  test("GET /mybucket/hello.txt → GetObject", () => {
    const r = parse("GET", "/mybucket/hello.txt");
    expect(r.operation).toBe("GetObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("hello.txt");
  });

  test("DELETE /mybucket/hello.txt → DeleteObject", () => {
    const r = parse("DELETE", "/mybucket/hello.txt");
    expect(r.operation).toBe("DeleteObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("hello.txt");
  });

  test("HEAD /mybucket/hello.txt → HeadObject", () => {
    const r = parse("HEAD", "/mybucket/hello.txt");
    expect(r.operation).toBe("HeadObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("hello.txt");
  });

  test("nested key GET /mybucket/nested/path/file.txt → GetObject", () => {
    const r = parse("GET", "/mybucket/nested/path/file.txt");
    expect(r.operation).toBe("GetObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("nested/path/file.txt");
  });

  test("key with special characters", () => {
    const r = parse("GET", "/mybucket/file%20name.txt");
    expect(r.operation).toBe("GetObject");
    expect(r.key).toBe("file%20name.txt");
  });
});

describe("parseS3Request — Virtual-hosted-style", () => {
  test("GET mybucket.localhost:9000 → ListObjects", () => {
    const r = parse("GET", "/", "mybucket.localhost:9000");
    expect(r.operation).toBe("ListObjects");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBeNull();
    expect(r.virtualHosted).toBe(true);
  });

  test("PUT mybucket.localhost:9000 → CreateBucket", () => {
    const r = parse("PUT", "/", "mybucket.localhost:9000");
    expect(r.operation).toBe("CreateBucket");
    expect(r.bucket).toBe("mybucket");
  });

  test("GET mybucket.localhost:9000/hello.txt → GetObject", () => {
    const r = parse("GET", "/hello.txt", "mybucket.localhost:9000");
    expect(r.operation).toBe("GetObject");
    expect(r.bucket).toBe("mybucket");
    expect(r.key).toBe("hello.txt");
  });
});

describe("parseS3Request — Error cases", () => {
  test("unsupported service-level: POST /", () => {
    expect(() => parse("POST", "/")).toThrow();
  });

  test("unsupported bucket operation: POST /mybucket", () => {
    expect(() => parse("POST", "/mybucket")).toThrow();
  });

  test("unsupported object operation: PATCH /mybucket/key", () => {
    expect(() => parse("PATCH", "/mybucket/key")).toThrow();
  });
});
