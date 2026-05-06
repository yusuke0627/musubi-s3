import { mkdir, rmdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  BucketAlreadyExists,
  NoSuchBucket,
  BucketNotEmpty,
  InvalidBucketName,
} from "./errors";

const BUCKETS_ROOT = "./data/buckets";

export interface Bucket {
  name: string;
  creationDate: string;
}

/**
 * Validate bucket name according to DNS-compliant rules (simplified)
 * - 3-63 characters
 * - Lowercase letters, numbers, hyphens, and dots only
 * - Must start and end with letter or number
 * - No consecutive periods
 * - No periods adjacent to hyphens
 * - Must not be formatted as IP address
 */
export function validateBucketName(name: string): void {
  // Length check
  if (name.length < 3 || name.length > 63) {
    throw new InvalidBucketName(name, "must be between 3 and 63 characters long");
  }

  // Character set check (lowercase alphanumeric, hyphen, dot)
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name)) {
    throw new InvalidBucketName(
      name,
      "must contain only lowercase letters, numbers, hyphens, and dots, and start/end with alphanumeric"
    );
  }

  // No consecutive periods
  if (name.includes("..")) {
    throw new InvalidBucketName(name, "must not contain consecutive periods");
  }

  // No periods adjacent to hyphens
  if (name.includes(".-") || name.includes("-.")) {
    throw new InvalidBucketName(
      name,
      "must not have periods adjacent to hyphens"
    );
  }

  // Not formatted as IP address (simple check)
  if (/^(\d+\.){3}\d+$/.test(name)) {
    throw new InvalidBucketName(name, "must not be formatted as an IP address");
  }
}

function getBucketPath(bucketName: string): string {
  // Security: prevent directory traversal
  const normalized = bucketName.replace(/\//g, "");
  if (normalized !== bucketName || normalized.includes("..")) {
    throw new InvalidBucketName(bucketName, "contains invalid characters");
  }
  return join(BUCKETS_ROOT, normalized);
}

/**
 * Create a new bucket (directory)
 */
export async function createBucket(bucketName: string): Promise<void> {
  validateBucketName(bucketName);

  const bucketPath = getBucketPath(bucketName);

  // Ensure parent directory exists
  await mkdir(BUCKETS_ROOT, { recursive: true });

  try {
    await mkdir(bucketPath, { recursive: false });
  } catch (error: any) {
    if (error.code === "EEXIST") {
      throw new BucketAlreadyExists(bucketName);
    }
    throw error;
  }
}

/**
 * Delete an empty bucket (directory)
 */
export async function deleteBucket(bucketName: string): Promise<void> {
  validateBucketName(bucketName);

  const bucketPath = getBucketPath(bucketName);

  // Check if bucket exists
  try {
    await stat(bucketPath);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new NoSuchBucket(bucketName);
    }
    throw error;
  }

  // Try to delete (will fail if not empty)
  try {
    await rmdir(bucketPath);
  } catch (error: any) {
    if (error.code === "ENOTEMPTY") {
      throw new BucketNotEmpty(bucketName);
    }
    throw error;
  }
}

/**
 * List all buckets
 */
export async function listBuckets(): Promise<Bucket[]> {
  try {
    const entries = await readdir(BUCKETS_ROOT, { withFileTypes: true });
    const buckets: Bucket[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const stats = await stat(join(BUCKETS_ROOT, entry.name));
        buckets.push({
          name: entry.name,
          creationDate: stats.birthtime.toISOString(),
        });
      }
    }

    // Sort by name for consistent ordering
    return buckets.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // Directory doesn't exist yet, return empty list
      return [];
    }
    throw error;
  }
}

/**
 * Check if a bucket exists
 */
export async function bucketExists(bucketName: string): Promise<boolean> {
  try {
    validateBucketName(bucketName);
  } catch {
    return false;
  }

  const bucketPath = getBucketPath(bucketName);

  try {
    const stats = await stat(bucketPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
