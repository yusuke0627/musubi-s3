import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  putObject,
  getObject,
  deleteObject,
  headObject,
  listObjects,
} from "../../src/backend/fs";
import { createBucket } from "../../src/backend/fs";
import { NoSuchBucket, NoSuchKey } from "../../src/backend/errors";

const TEST_BUCKETS_ROOT = "./data/buckets";
const TEST_BUCKET = "test-bucket";

describe("object operations", () => {
  beforeEach(async () => {
    // Clean up and create test bucket
    try {
      await rm(TEST_BUCKETS_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    await createBucket(TEST_BUCKET);
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await rm(TEST_BUCKETS_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("putObject", () => {
    it("saves object to filesystem", async () => {
      const data = new TextEncoder().encode("Hello, World!");
      await putObject(TEST_BUCKET, "test.txt", data);

      const result = await getObject(TEST_BUCKET, "test.txt");
      const text = new TextDecoder().decode(result.data);
      expect(text).toBe("Hello, World!");
    });

    it("creates nested directories", async () => {
      const data = new TextEncoder().encode("nested content");
      await putObject(TEST_BUCKET, "folder/subfolder/file.txt", data);

      const result = await getObject(TEST_BUCKET, "folder/subfolder/file.txt");
      expect(result.size).toBe(14);
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      const data = new TextEncoder().encode("test");
      await expect(putObject("non-existent", "test.txt", data)).rejects.toThrow(
        NoSuchBucket
      );
    });

    it("rejects keys with directory traversal", async () => {
      const data = new TextEncoder().encode("test");
      await expect(putObject(TEST_BUCKET, "../escape.txt", data)).rejects.toThrow();
    });
  });

  describe("getObject", () => {
    it("returns object content", async () => {
      const data = new TextEncoder().encode("test content");
      await putObject(TEST_BUCKET, "test.txt", data);

      const result = await getObject(TEST_BUCKET, "test.txt");
      expect(result.size).toBe(12);
      expect(new TextDecoder().decode(result.data)).toBe("test content");
    });

    it("throws NoSuchKey for non-existent object", async () => {
      await expect(getObject(TEST_BUCKET, "non-existent.txt")).rejects.toThrow(
        NoSuchKey
      );
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      await expect(getObject("non-existent", "test.txt")).rejects.toThrow(
        NoSuchBucket
      );
    });
  });

  describe("deleteObject", () => {
    it("deletes object", async () => {
      const data = new TextEncoder().encode("to delete");
      await putObject(TEST_BUCKET, "delete-me.txt", data);

      await deleteObject(TEST_BUCKET, "delete-me.txt");

      await expect(getObject(TEST_BUCKET, "delete-me.txt")).rejects.toThrow(
        NoSuchKey
      );
    });

    it("throws NoSuchKey for non-existent object", async () => {
      await expect(deleteObject(TEST_BUCKET, "non-existent.txt")).rejects.toThrow(
        NoSuchKey
      );
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      await expect(deleteObject("non-existent", "test.txt")).rejects.toThrow(
        NoSuchBucket
      );
    });
  });

  describe("headObject", () => {
    it("returns metadata without content", async () => {
      const data = new TextEncoder().encode("head test content");
      await putObject(TEST_BUCKET, "head-test.txt", data);

      const result = await headObject(TEST_BUCKET, "head-test.txt");
      expect(result.size).toBe(17);
      expect(result.lastModified).toBeDefined();
    });

    it("throws NoSuchKey for non-existent object", async () => {
      await expect(headObject(TEST_BUCKET, "non-existent.txt")).rejects.toThrow(
        NoSuchKey
      );
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      await expect(headObject("non-existent", "test.txt")).rejects.toThrow(
        NoSuchBucket
      );
    });
  });

  describe("listObjects", () => {
    it("returns empty array when no objects", async () => {
      const objects = await listObjects(TEST_BUCKET);
      expect(objects).toEqual([]);
    });

    it("returns list of objects", async () => {
      await putObject(TEST_BUCKET, "file1.txt", new TextEncoder().encode("a"));
      await putObject(TEST_BUCKET, "file2.txt", new TextEncoder().encode("bb"));

      const objects = await listObjects(TEST_BUCKET);
      expect(objects).toHaveLength(2);
      expect(objects.map((o) => o.key)).toContain("file1.txt");
      expect(objects.map((o) => o.key)).toContain("file2.txt");
    });

    it("returns nested objects with full path", async () => {
      await putObject(TEST_BUCKET, "folder/nested.txt", new TextEncoder().encode("nested"));

      const objects = await listObjects(TEST_BUCKET);
      expect(objects).toHaveLength(1);
      expect(objects[0].key).toBe("folder/nested.txt");
    });

    it("filters by prefix", async () => {
      await putObject(TEST_BUCKET, "logs/app.log", new TextEncoder().encode("log1"));
      await putObject(TEST_BUCKET, "logs/error.log", new TextEncoder().encode("log2"));
      await putObject(TEST_BUCKET, "config.json", new TextEncoder().encode("{}"));

      const objects = await listObjects(TEST_BUCKET, "logs/");
      expect(objects).toHaveLength(2);
      expect(objects.every((o) => o.key.startsWith("logs/"))).toBe(true);
    });

    it("respects maxKeys limit", async () => {
      await putObject(TEST_BUCKET, "file1.txt", new TextEncoder().encode("a"));
      await putObject(TEST_BUCKET, "file2.txt", new TextEncoder().encode("b"));
      await putObject(TEST_BUCKET, "file3.txt", new TextEncoder().encode("c"));

      const objects = await listObjects(TEST_BUCKET, "", 2);
      expect(objects).toHaveLength(2);
    });

    it("throws NoSuchBucket for non-existent bucket", async () => {
      await expect(listObjects("non-existent")).rejects.toThrow(NoSuchBucket);
    });

    it("sorts objects by key", async () => {
      await putObject(TEST_BUCKET, "zebra.txt", new TextEncoder().encode("z"));
      await putObject(TEST_BUCKET, "alpha.txt", new TextEncoder().encode("a"));

      const objects = await listObjects(TEST_BUCKET);
      expect(objects[0].key).toBe("alpha.txt");
      expect(objects[1].key).toBe("zebra.txt");
    });
  });
});
