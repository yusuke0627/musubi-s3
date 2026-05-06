import { createBucket, deleteBucket, listBuckets, bucketExists } from "../backend/fs";
import { Bucket } from "../backend/fs";
import {
  BucketAlreadyExists,
  NoSuchBucket,
  BucketNotEmpty,
  InvalidBucketName,
} from "../backend/errors";
import { S3Context } from "../router";

/**
 * Build S3-compatible ListAllMyBucketsResult XML
 */
function buildListBucketsXml(buckets: Bucket[]): string {
  const bucketEntries = buckets
    .map(
      (bucket) => `    <Bucket>
      <Name>${escapeXml(bucket.name)}</Name>
      <CreationDate>${bucket.creationDate}</CreationDate>
    </Bucket>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Buckets>
${bucketEntries}
  </Buckets>
</ListAllMyBucketsResult>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build S3-compatible error XML
 */
function buildErrorXml(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>${code}</Code>
  <Message>${escapeXml(message)}</Message>
</Error>`;
}

/**
 * Handle ListBuckets (GET /)
 */
export async function handleListBuckets(_ctx: S3Context): Promise<Response> {
  const buckets = await listBuckets();
  const xml = buildListBucketsXml(buckets);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
    },
  });
}

/**
 * Handle CreateBucket (PUT /{bucket})
 */
export async function handleCreateBucket(ctx: S3Context): Promise<Response> {
  const bucketName = ctx.bucket;

  if (!bucketName) {
    return new Response(
      buildErrorXml("InvalidBucketName", "Bucket name is required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    await createBucket(bucketName);
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof BucketAlreadyExists) {
      return new Response(
        buildErrorXml("BucketAlreadyExists", error.message),
        {
          status: 409,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    if (error instanceof InvalidBucketName) {
      return new Response(
        buildErrorXml("InvalidBucketName", error.message),
        {
          status: 400,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    throw error;
  }
}

/**
 * Handle DeleteBucket (DELETE /{bucket})
 */
export async function handleDeleteBucket(ctx: S3Context): Promise<Response> {
  const bucketName = ctx.bucket;

  if (!bucketName) {
    return new Response(
      buildErrorXml("InvalidBucketName", "Bucket name is required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    await deleteBucket(bucketName);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof NoSuchBucket) {
      return new Response(
        buildErrorXml("NoSuchBucket", error.message),
        {
          status: 404,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    if (error instanceof BucketNotEmpty) {
      return new Response(
        buildErrorXml("BucketNotEmpty", error.message),
        {
          status: 409,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    if (error instanceof InvalidBucketName) {
      return new Response(
        buildErrorXml("InvalidBucketName", error.message),
        {
          status: 400,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    throw error;
  }
}
