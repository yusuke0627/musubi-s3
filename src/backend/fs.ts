import { mkdir, rmdir, readdir, stat, unlink, writeFile, readFile } from "node:fs/promises";
import { join, dirname, normalize } from "node:path";
import {
  BucketAlreadyExists,
  NoSuchBucket,
  BucketNotEmpty,
  InvalidBucketName,
  NoSuchKey,
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

// ============================================================================
// Object Operations
// ============================================================================

export interface ObjectInfo {
  key: string;
  lastModified: string;
  size: number;
}

/**
 * Validate object key (prevent directory traversal)
 */
function validateObjectKey(key: string): void {
  // Prevent directory traversal
  if (key.includes("..") || key.startsWith("/")) {
    throw new Error("Invalid object key");
  }
  // Normalize the key
  const normalized = normalize(key);
  if (normalized.startsWith("..")) {
    throw new Error("Invalid object key");
  }
}

/**
 * Get full path for an object
 */
function getObjectPath(bucketName: string, key: string): string {
  validateBucketName(bucketName);
  validateObjectKey(key);
  return join(BUCKETS_ROOT, bucketName, key);
}

/**
 * Check if bucket exists, throw NoSuchBucket if not
 */
async function ensureBucketExists(bucketName: string): Promise<void> {
  const bucketPath = getBucketPath(bucketName);
  try {
    const stats = await stat(bucketPath);
    if (!stats.isDirectory()) {
      throw new NoSuchBucket(bucketName);
    }
  } catch (error: any) {
    if (error.code === "ENOENT" || error instanceof NoSuchBucket) {
      throw new NoSuchBucket(bucketName);
    }
    throw error;
  }
}

/**
 * Save object to filesystem
 */
export async function putObject(
  bucketName: string,
  key: string,
  data: Uint8Array
): Promise<void> {
  await ensureBucketExists(bucketName);

  const objectPath = getObjectPath(bucketName, key);

  // Create parent directories if needed
  await mkdir(dirname(objectPath), { recursive: true });

  // Write file
  await writeFile(objectPath, data);
}

/**
 * Read object from filesystem
 */
export async function getObject(
  bucketName: string,
  key: string
): Promise<{ data: Uint8Array; size: number }> {
  await ensureBucketExists(bucketName);

  const objectPath = getObjectPath(bucketName, key);

  try {
    const data = await readFile(objectPath);
    return { data, size: data.length };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new NoSuchKey(key);
    }
    throw error;
  }
}

/**
 * Delete object from filesystem
 */
export async function deleteObject(bucketName: string, key: string): Promise<void> {
  await ensureBucketExists(bucketName);

  const objectPath = getObjectPath(bucketName, key);

  try {
    await unlink(objectPath);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new NoSuchKey(key);
    }
    throw error;
  }
}

/**
 * Get object metadata without reading content
 */
export async function headObject(
  bucketName: string,
  key: string
): Promise<{ size: number; lastModified: string }> {
  await ensureBucketExists(bucketName);

  const objectPath = getObjectPath(bucketName, key);

  try {
    const stats = await stat(objectPath);
    if (stats.isDirectory()) {
      throw new NoSuchKey(key);
    }
    return {
      size: stats.size,
      lastModified: stats.mtime.toISOString(),
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new NoSuchKey(key);
    }
    throw error;
  }
}

/**
 * List objects in bucket (optionally with prefix)
 */
export async function listObjects(
  bucketName: string,
  prefix: string = "",
  maxKeys: number = 1000
): Promise<ObjectInfo[]> {
  await ensureBucketExists(bucketName);

  const bucketPath = getBucketPath(bucketName);
  const objects: ObjectInfo[] = [];

  async function scanDir(dirPath: string, relativePrefix: string): Promise<void> {
    if (objects.length >= maxKeys) return;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (objects.length >= maxKeys) break;

      const relativePath = relativePrefix
        ? `${relativePrefix}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        await scanDir(join(dirPath, entry.name), relativePath);
      } else {
        // Check prefix filter
        if (prefix && !relativePath.startsWith(prefix)) {
          continue;
        }

        const fullPath = join(dirPath, entry.name);
        const stats = await stat(fullPath);
        objects.push({
          key: relativePath,
          lastModified: stats.mtime.toISOString(),
          size: stats.size,
        });
      }
    }
  }

  await scanDir(bucketPath, "");

  // Sort by key name
  return objects.sort((a, b) => a.key.localeCompare(b.key));
}
