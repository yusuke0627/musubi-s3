# musubi-s3

A lightweight S3-compatible server built with TypeScript + Bun for learning purposes.

## Overview

`musubi-s3` is a minimal implementation of the Amazon S3 API designed to help developers understand how S3 works internally. It supports existing S3 clients (aws cli, boto3, SDKs) via AWS Signature Version 4 authentication.

## Features

- S3-compatible REST API
- AWS Signature Version 4 authentication
- Local filesystem backend
- Path-style and virtual-hosted-style URLs

## Requirements

- [Bun](https://bun.sh/) 1.3+

## Setup

```bash
# Install dependencies
bun install

# Start the server
bun run start

# Or run in watch mode for development
bun run dev
```

The server listens on `http://localhost:9000` by default.

## Configuration

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `MUSUBI_PORT` | `9000` | Server port |
| `MUSUBI_HOST` | `0.0.0.0` | Server host |

## Usage with aws cli

```bash
# Configure a profile
aws configure --profile musubi
# Access Key: musubi
# Secret Key: musubi-secret
# Region: ap-northeast-1

# Create a bucket
aws --profile musubi --endpoint-url http://localhost:9000 s3 mb s3://test-bucket

# List buckets
aws --profile musubi --endpoint-url http://localhost:9000 s3 ls

# Upload an object
aws --profile musubi --endpoint-url http://localhost:9000 s3 cp hello.txt s3://test-bucket/hello.txt

# List objects
aws --profile musubi --endpoint-url http://localhost:9000 s3 ls s3://test-bucket/

# Download an object
aws --profile musubi --endpoint-url http://localhost:9000 s3 cp s3://test-bucket/hello.txt hello2.txt

# Delete an object
aws --profile musubi --endpoint-url http://localhost:9000 s3 rm s3://test-bucket/hello.txt

# Delete a bucket
aws --profile musubi --endpoint-url http://localhost:9000 s3 rb s3://test-bucket
```

## Testing

```bash
# Type check
bun run typecheck

# Run tests
bun test
```

## Architecture

See `.hermes/plans/` for detailed blueprints.

## License

MIT
