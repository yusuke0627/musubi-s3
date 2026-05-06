import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { generateTestAuthHeaders } from "./test-auth";
import { handler } from "../../src/server";

const BASE_URL = "http://localhost:9001"; // Use different port for testing
const TEST_BUCKET = "test-bucket";

let server: ReturnType<typeof Bun.serve>;

// Helper to make authenticated requests
async function s3Fetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const method = init?.method || "GET";
  
  // Generate proper auth headers
  const authHeaders = await generateTestAuthHeaders(method, url);
  
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      ...authHeaders,
    },
  });
}

describe("Bucket API Integration", () => {
  beforeAll(() => {
    // Start test server with wrapper
    server = Bun.serve({
      port: 9001,
      hostname: "0.0.0.0",
      fetch: (req) => handler(req, "localhost:9001"),
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  beforeEach(async () => {
    // Clean up test data
    try {
      await rm("./data/buckets", { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await rm("./data/buckets", { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("ListBuckets", () => {
    it("returns empty list when no buckets", async () => {
      const response = await s3Fetch("/");

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain("ListAllMyBucketsResult");
      expect(xml).toContain("<Buckets>");
      expect(xml).not.toContain("<Name>");
    });

    it("returns list of created buckets", async () => {
      // Create a bucket first
      await s3Fetch(`/${TEST_BUCKET}`, { method: "PUT" });

      // List buckets
      const response = await s3Fetch("/");

      expect(response.status).toBe(200);
      const xml = await response.text();
      expect(xml).toContain("<Name>test-bucket</Name>");
    });
  });

  describe("CreateBucket", () => {
    it("creates a bucket successfully", async () => {
      const response = await s3Fetch(`/${TEST_BUCKET}`, { method: "PUT" });

      expect(response.status).toBe(200);
    });

    it("returns 409 for duplicate bucket", async () => {
      // Create first time
      await s3Fetch(`/${TEST_BUCKET}`, { method: "PUT" });

      // Try to create again
      const response = await s3Fetch(`/${TEST_BUCKET}`, { method: "PUT" });

      expect(response.status).toBe(409);
      const xml = await response.text();
      expect(xml).toContain("BucketAlreadyExists");
    });

    it("returns 400 for invalid bucket name", async () => {
      const response = await s3Fetch(`/AB`, { method: "PUT" });

      expect(response.status).toBe(400);
      const xml = await response.text();
      expect(xml).toContain("InvalidBucketName");
    });
  });

  describe("DeleteBucket", () => {
    it("deletes an empty bucket", async () => {
      // Create bucket first
      await s3Fetch(`/${TEST_BUCKET}`, { method: "PUT" });

      // Delete it
      const response = await s3Fetch(`/${TEST_BUCKET}`, { method: "DELETE" });

      expect(response.status).toBe(204);
    });

    it("returns 404 for non-existent bucket", async () => {
      const response = await s3Fetch(`/non-existent-bucket`, { method: "DELETE" });

      expect(response.status).toBe(404);
      const xml = await response.text();
      expect(xml).toContain("NoSuchBucket");
    });
  });

  describe("Auth verification", () => {
    it("rejects request without auth header", async () => {
      const response = await fetch(`${BASE_URL}/`);

      expect(response.status).toBe(403);
    });
  });
});
