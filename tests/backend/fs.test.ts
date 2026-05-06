import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rmdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createBucket,
  deleteBucket,
  listBuckets,
  bucketExists,
  validateBucketName,
} from "../../src/backend/fs";
import {
  BucketAlreadyExists,
  NoSuchBucket,
  BucketNotEmpty,
  InvalidBucketName,
} from "../../src/backend/errors";

const TEST_BUCKETS_ROOT = "./data/buckets";

describe("validateBucketName", () => {
  it("accepts valid bucket names", () => {
    expect(() => validateBucketName("my-bucket")).not.toThrow();
    expect(() => validateBucketName("my.bucket")).not.toThrow();
    expect(() => validateBucketName("mybucket123")).not.toThrow();
    expect(() => validateBucketName("a-b")).not.toThrow(); // minimum 3 chars
    expect(() => validateBucketName("a" + "b".repeat(61) + "c")).not.toThrow(); // maximum 63 chars
  });

  it("rejects names that are too short", () => {
    expect(() => validateBucketName("ab")).toThrow(InvalidBucketName);
  });

  it("rejects names that are too long", () => {
    expect(() => validateBucketName("a" + "b".repeat(62) + "c")).toThrow(InvalidBucketName);
  });

  it("rejects names with uppercase letters", () => {
    expect(() => validateBucketName("MyBucket")).toThrow(InvalidBucketName);
  });

  it("rejects names starting with non-alphanumeric", () => {
    expect(() => validateBucketName("-bucket")).toThrow(InvalidBucketName);
    expect(() => validateBucketName(".bucket")).toThrow(InvalidBucketName);
  });

  it("rejects names ending with non-alphanumeric", () => {
    expect(() => validateBucketName("bucket-")).toThrow(InvalidBucketName);
    expect(() => validateBucketName("bucket.")).toThrow(InvalidBucketName);
  });

  it("rejects names with consecutive periods", () => {
    expect(() => validateBucketName("my..bucket")).toThrow(InvalidBucketName);
  });

  it("rejects names with adjacent period and hyphen", () => {
    expect(() => validateBucketName("my-.bucket")).toThrow(InvalidBucketName);
    expect(() => validateBucketName("my.-bucket")).toThrow(InvalidBucketName);
  });

  it("rejects IP address-like names", () => {
    expect(() => validateBucketName("192.168.1.1")).toThrow(InvalidBucketName);
  });
});

describe("bucket operations", () => {
  beforeEach(async () => {
    // Clean up test buckets
    try {
      await rm(TEST_BUCKETS_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await rm(TEST_BUCKETS_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe("createBucket", () => {
    it("creates a bucket directory", async () => {
      await createBucket("test-bucket");
      const exists = await bucketExists("test-bucket");
      expect(exists).toBe(true);
    });

    it("throws BucketAlreadyExists for duplicate", async () => {
      await createBucket("test-bucket");
      await expect(createBucket("test-bucket")).rejects.toThrow(BucketAlreadyExists);
    });

    it("throws InvalidBucketName for invalid names", async () => {
      await expect(createBucket("ab")).rejects.toThrow(InvalidBucketName);
      await expect(createBucket("MyBucket")).rejects.toThrow(InvalidBucketName);
    });
  });

  describe("deleteBucket", () => {
    it("deletes an empty bucket", async () => {
      await createBucket("test-bucket");
      await deleteBucket("test-bucket");
      const exists = await bucketExists("test-bucket");
      expect(exists).toBe(false);
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      await expect(deleteBucket("non-existent")).rejects.toThrow(NoSuchBucket);
    });

    it("throws BucketNotEmpty for non-empty bucket", async () => {
      await createBucket("test-bucket");
      // Create a file inside the bucket
      const bucketPath = join(TEST_BUCKETS_ROOT, "test-bucket");
      await Bun.write(join(bucketPath, "test.txt"), "content");
      
      await expect(deleteBucket("test-bucket")).rejects.toThrow(BucketNotEmpty);
    });
  });

  describe("listBuckets", () => {
    it("returns empty array when no buckets", async () => {
      const buckets = await listBuckets();
      expect(buckets).toEqual([]);
    });

    it("returns list of created buckets", async () => {
      await createBucket("bucket-a");
      await createBucket("bucket-b");
      
      const buckets = await listBuckets();
      expect(buckets).toHaveLength(2);
      expect(buckets.map((b) => b.name)).toContain("bucket-a");
      expect(buckets.map((b) => b.name)).toContain("bucket-b");
      
      // Check creation date is present
      expect(buckets[0].creationDate).toBeDefined();
      expect(new Date(buckets[0].creationDate).getTime()).toBeGreaterThan(0);
    });

    it("returns buckets sorted by name", async () => {
      await createBucket("zebra");
      await createBucket("alpha");
      await createBucket("beta");
      
      const buckets = await listBuckets();
      const names = buckets.map((b) => b.name);
      expect(names).toEqual(["alpha", "beta", "zebra"]);
    });
  });

  describe("bucketExists", () => {
    it("returns true for existing bucket", async () => {
      await createBucket("test-bucket");
      expect(await bucketExists("test-bucket")).toBe(true);
    });

    it("returns false for non-existing bucket", async () => {
      expect(await bucketExists("non-existent")).toBe(false);
    });

    it("returns false for invalid bucket names", async () => {
      expect(await bucketExists("ab")).toBe(false);
    });
  });
});
