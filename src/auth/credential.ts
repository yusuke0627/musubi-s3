/**
 * Hardcoded AWS credentials for musubi-s3.
 * Phase 1 uses fixed credentials for learning purposes.
 */

export interface AwsCredentials {
  accessKey: string;
  secretKey: string;
}

const CREDENTIALS: Record<string, AwsCredentials> = {
  musubi: {
    accessKey: "musubi",
    secretKey: "musubi-secret",
  },
};

export function getCredentials(accessKey: string): AwsCredentials | undefined {
  return CREDENTIALS[accessKey];
}
