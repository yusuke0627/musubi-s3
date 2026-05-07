import { S3Context } from "../router";
import {
  putObject,
  getObject,
  deleteObject,
  headObject,
  listObjects,
  ObjectInfo,
} from "../backend/fs";
import { NoSuchBucket, NoSuchKey } from "../backend/errors";

/**
 * Build S3-compatible ListBucketResult XML
 */
function buildListObjectsXml(
  objects: ObjectInfo[],
  bucketName: string,
  prefix: string = "",
  maxKeys: number = 1000,
  isV2: boolean = false
): string {
  const objectEntries = objects
    .map(
      (obj) => `    <Contents>
      <Key>${escapeXml(obj.key)}</Key>
      <LastModified>${obj.lastModified}</LastModified>
      <Size>${obj.size}</Size>
    </Contents>`
    )
    .join("\n");

  const prefixXml = prefix ? `  <Prefix>${escapeXml(prefix)}</Prefix>` : "  <Prefix></Prefix>";

  if (isV2) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>${escapeXml(bucketName)}</Name>
${prefixXml}
  <MaxKeys>${maxKeys}</MaxKeys>
  <KeyCount>${objects.length}</KeyCount>
${objectEntries}
</ListBucketResult>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>${escapeXml(bucketName)}</Name>
${prefixXml}
  <MaxKeys>${maxKeys}</MaxKeys>
${objectEntries}
</ListBucketResult>`;
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
 * Handle PutObject (PUT /{bucket}/{key})
 */
export async function handlePutObject(
  ctx: S3Context,
  req: Request
): Promise<Response> {
  const bucketName = ctx.bucket;
  const key = ctx.key;

  if (!bucketName) {
    return new Response(
      buildErrorXml("InvalidBucketName", "Bucket name is required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  if (!key) {
    return new Response(
      buildErrorXml("InvalidKey", "Object key is required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    // Read request body as bytes
    const arrayBuffer = await req.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    await putObject(bucketName, key, data);

    return new Response(null, { status: 200 });
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
    throw error;
  }
}

/**
 * Handle GetObject (GET /{bucket}/{key})
 */
export async function handleGetObject(ctx: S3Context): Promise<Response> {
  const bucketName = ctx.bucket;
  const key = ctx.key;

  if (!bucketName || !key) {
    return new Response(
      buildErrorXml("InvalidRequest", "Bucket and key are required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    const { data, size } = await getObject(bucketName, key);

    const arrayBuffer = data.buffer as ArrayBuffer;
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": size.toString(),
      },
    });
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
    if (error instanceof NoSuchKey) {
      return new Response(
        buildErrorXml("NoSuchKey", error.message),
        {
          status: 404,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    throw error;
  }
}

/**
 * Handle DeleteObject (DELETE /{bucket}/{key})
 */
export async function handleDeleteObject(ctx: S3Context): Promise<Response> {
  const bucketName = ctx.bucket;
  const key = ctx.key;

  if (!bucketName || !key) {
    return new Response(
      buildErrorXml("InvalidRequest", "Bucket and key are required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    await deleteObject(bucketName, key);
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
    if (error instanceof NoSuchKey) {
      // S3 returns 204 even for non-existent keys (idempotent delete)
      return new Response(null, { status: 204 });
    }
    throw error;
  }
}

/**
 * Handle HeadObject (HEAD /{bucket}/{key})
 */
export async function handleHeadObject(ctx: S3Context): Promise<Response> {
  const bucketName = ctx.bucket;
  const key = ctx.key;

  if (!bucketName || !key) {
    return new Response(
      buildErrorXml("InvalidRequest", "Bucket and key are required"),
      {
        status: 400,
        headers: { "Content-Type": "application/xml" },
      }
    );
  }

  try {
    const { size, lastModified } = await headObject(bucketName, key);

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": size.toString(),
        "Last-Modified": new Date(lastModified).toUTCString(),
      },
    });
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
    if (error instanceof NoSuchKey) {
      return new Response(
        buildErrorXml("NoSuchKey", error.message),
        {
          status: 404,
          headers: { "Content-Type": "application/xml" },
        }
      );
    }
    throw error;
  }
}

/**
 * Handle ListObjects (GET /{bucket})
 */
export async function handleListObjects(ctx: S3Context): Promise<Response> {
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
    const objects = await listObjects(bucketName);
    const xml = buildListObjectsXml(objects, bucketName);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
      },
    });
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
    throw error;
  }
}

/**
 * Handle ListObjectsV2 (GET /{bucket}?list-type=2)
 */
export async function handleListObjectsV2(ctx: S3Context): Promise<Response> {
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
    const objects = await listObjects(bucketName);
    const xml = buildListObjectsXml(objects, bucketName, undefined, 1000, true);

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml",
      },
    });
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
    throw error;
  }
}
