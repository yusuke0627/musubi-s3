/**
 * S3-compatible backend errors
 */

export class BucketAlreadyExists extends Error {
  constructor(bucketName: string) {
    super(`Bucket '${bucketName}' already exists`);
    this.name = "BucketAlreadyExists";
  }
}

export class NoSuchBucket extends Error {
  constructor(bucketName: string) {
    super(`The specified bucket does not exist: ${bucketName}`);
    this.name = "NoSuchBucket";
  }
}

export class BucketNotEmpty extends Error {
  constructor(bucketName: string) {
    super(`The bucket '${bucketName}' is not empty`);
    this.name = "BucketNotEmpty";
  }
}

export class InvalidBucketName extends Error {
  constructor(bucketName: string, reason: string) {
    super(`Invalid bucket name '${bucketName}': ${reason}`);
    this.name = "InvalidBucketName";
  }
}
