# musubi-s3 Blueprint: Basic S3-Compatible Server

## Goal

Amazon S3 の内部動作を理解するため、学習目的の軽量 S3 互換サーバを実装する。
既存の S3 クライアント（aws cli / boto3 / 各種 SDK）から接続でき、基本的なオブジェクトストレージ操作が動作することを目標とする。

## Current Context

- リポジトリ: `github.com:yusuke0627/musubi-s3`
- ブランチ: `main`（空、コミットなし）
- 言語: 未選定（Go / Python で検討）
- ストレージ: ローカルファイルシステム
- 認証: AWS Signature Version 4

## Proposed Approach

### Language: TypeScript + Bun

選定理由:
- TypeScript の学習目的がある
- Bun はネイティブ TypeScript サポート + 高速 HTTP サーバー（Bun.serve）
- 標準 API（fs, crypto, path）だけで基本的な I/O・ハッシュ・XML 処理が完結
- 依存が少なく、シングルバイナリで配布可能（bun build --compile）
- Node.js との互換性もあり、生態系の学習にもなる

### Architecture

```
+---------------------------------+
|         S3 Client               |
|  (aws cli / boto3 / SDK)        |
+---------------------------------+
                |
                | HTTP/1.1 + AWS SigV4
                v
+---------------------------------+
|      musubi-s3 server           |
|  +---------------------------+  |
|  |  HTTP Router              |  |
|  |  - Virtual-hosted-style   |  |
|  |    (<bucket>.localhost)   |  |
|  |  - Path-style             |  |
|  |    (localhost/<bucket>)   |  |
|  +---------------------------+  |
|  +---------------------------+  |
|  |  SigV4 Auth Middleware    |  |
|  |  - verify signature       |  |
|  |  - parse credential scope |  |
|  +---------------------------+  |
|  +---------------------------+  |
|  |  S3 API Handlers          |  |
|  |  - Bucket ops             |  |
|  |  - Object ops             |  |
|  |  - Multipart (Phase 2)    |  |
|  +---------------------------+  |
|  +---------------------------+  |
|  |  Local FS Backend         |  |
|  |  - bucket = directory     |  |
|  |  - object = file          |  |
|  |  - metadata = xattr/json  |  |
|  +---------------------------+  |
+---------------------------------+
```

## Step-by-Step Plan

### Phase 1: Foundation & Basic Bucket/Object Ops

| Step | Task | Key Files | Validation |
|------|------|-----------|------------|
| 1 | Project bootstrap: package.json, tsconfig.json, main.ts, Bun.serve | `package.json`, `tsconfig.json`, `src/main.ts` | `bun run src/main.ts` で起動確認 |
| 2 | Request routing: path-style & virtual-hosted-style parsing | `src/router.ts` | `curl` でルーティング確認 |
| 3 | AWS SigV4 認証ミドルウェア（基本版） | `src/auth/signatureV4.ts` | 署名検証のユニットテスト |
| 4 | **Bucket API**: CreateBucket, DeleteBucket, ListBuckets | `src/api/bucket.ts` | `aws s3 mb/rb/ls` |
| 5 | **Object API**: PutObject, GetObject, DeleteObject, ListObjects(V2) | `src/api/object.ts` | `aws s3 cp/rm/ls` |
| 6 | Metadata persistence（Content-Type, ETag, user metadata） | `src/backend/metadata.ts` | ヘッダー確認 |
| 7 | ETag 生成（MD5 via Bun crypto） | `src/api/object.ts` | `aws s3api head-object` |
| 8 | Integration test with aws cli & boto3 | `tests/integration/` | `bun test` |

### Phase 2: Extended Operations (optional, post-review)

| Step | Task | Notes |
|------|------|-------|
| 9 | Multipart Upload（Initiate, UploadPart, Complete, Abort） | S3 のコア機能、大ファイル対応 |
| 10 | CopyObject（x-amz-copy-source） | サーバサイドコピー |
| 11 | Pre-signed URL 生成・検証 | 期限付きアクセス |
| 12 | Range request（GET with Range header） | 部分取得 |
| 13 | Versioning mock（単一バージョンのみ） | 理解のための簡易実装 |

### Phase 3: Polish (optional)

| Step | Task |
|------|------|
| 14 | Docker image |
| 15 | Configuration file / env vars |
| 16 | Structured logging |

## Files Likely to Change (Phase 1)

```
src/
  main.ts                   # エントリーポイント: Bun.serve 起動
  router.ts                 # URL パース、bucket/object 名抽出
  auth/
    signatureV4.ts          # SigV4 署名検証
    credential.ts           # アクセスキー/シークレット管理（固定値でOK）
  api/
    bucket.ts               # Bucket API ハンドラ
    object.ts               # Object API ハンドラ
    response.ts             # S3 XML レスポンス生成
  backend/
    fs.ts                   # ローカルFS抽象層
    metadata.ts             # メタデータ読み書き
tests/
  integration/
    bucket.test.ts
    object.test.ts
package.json
tsconfig.json
bun.lock
```

## API Scope (Phase 1)

### Supported Operations

| Operation | HTTP Method | S3 Action | aws cli equivalent |
|-----------|-------------|-----------|-------------------|
| ListBuckets | GET / | `s3:ListAllMyBuckets` | `aws s3 ls` |
| CreateBucket | PUT /{bucket} | `s3:CreateBucket` | `aws s3 mb s3://{bucket}` |
| DeleteBucket | DELETE /{bucket} | `s3:DeleteBucket` | `aws s3 rb s3://{bucket}` |
| PutObject | PUT /{bucket}/{key} | `s3:PutObject` | `aws s3 cp file s3://{bucket}/{key}` |
| GetObject | GET /{bucket}/{key} | `s3:GetObject` | `aws s3 cp s3://{bucket}/{key} file` |
| DeleteObject | DELETE /{bucket}/{key} | `s3:DeleteObject` | `aws s3 rm s3://{bucket}/{key}` |
| ListObjects | GET /{bucket} | `s3:ListBucket` | `aws s3 ls s3://{bucket}` |
| ListObjectsV2 | GET /{bucket}?list-type=2 | `s3:ListBucket` | `aws s3 ls s3://{bucket}` |
| HeadObject | HEAD /{bucket}/{key} | `s3:GetObject` | `aws s3api head-object` |

### S3 XML Responses

- `ListAllMyBucketsResult`
- `ListBucketResult` / `ListBucketResultV2`
- `Error`（S3 標準エラー形式）

## Tests / Validation

1. **Unit Tests**
   - SigV4 署名パース・検証
   - Router: path-style / virtual-hosted-style 判定
   - XML レスポンス生成

2. **Integration Tests**
   - aws cli での end-to-end テスト
   - boto3 での end-to-end テスト
   - 並列アップロード/ダウンロード

3. **Manual Validation Commands**
   ```bash
   # サーバ起動
   bun run src/main.ts

   # aws cli 設定（プロファイル）
   aws configure --profile musubi
   # Access Key: musubi
   # Secret Key: musubi-secret
   # Region: ap-northeast-1

   # Bucket 操作
   aws --profile musubi --endpoint-url http://localhost:9000 s3 mb s3://test-bucket
   aws --profile musubi --endpoint-url http://localhost:9000 s3 ls

   # Object 操作
   echo "hello s3" > hello.txt
   aws --profile musubi --endpoint-url http://localhost:9000 s3 cp hello.txt s3://test-bucket/hello.txt
   aws --profile musubi --endpoint-url http://localhost:9000 s3 ls s3://test-bucket/
   aws --profile musubi --endpoint-url http://localhost:9000 s3 cp s3://test-bucket/hello.txt hello2.txt
   aws --profile musubi --endpoint-url http://localhost:9000 s3 rm s3://test-bucket/hello.txt
   aws --profile musubi --endpoint-url http://localhost:9000 s3 rb s3://test-bucket

   # テスト
   bun test
   ```

## Risks, Tradeoffs, and Open Questions

| Item | Risk / Tradeoff | Mitigation |
|------|-----------------|------------|
| SigV4 完全互換 | AWS の認証は複雑でエッジケースが多い | まず固定 credential で基本フローのみ実装 |
| Virtual-hosted vs Path-style | クライアントによって挙動が異なる | 両方サポート、テストでカバー |
| 大ファイル | メモリに乗せる実装だと破綻 | ストリーミング I/O（io.Copy）を徹底 |
| XML namespace | S3 の XML は厳密な名前空間を要求 | AWS 公式スキーマを参考に実装 |
| 並行アクセス | ローカルFSは競合しうる | Phase 1 では簡易的なファイルロック or 無視（学習目的） |

### Open Questions

1. **認証情報の管理方式**: 固定値（ハードコード）で十分か、設定ファイル読み込みが必要か？
2. **Region の扱い**: シングルリージョン固定でよいか？
3. **Multipart Upload**: Phase 1 に含めるか、Phase 2 に回すか？
   → 学習価値が高いが、まず基本フローを固めた方がよい。Phase 2 で。
4. **CORS 対応**: ブラウザからのアクセスが必要か？
   → 最初は不要。CLI/SDK からのアクセスがメイン。

## Success Criteria

- [ ] `aws s3 mb/rb/ls` が動作する
- [ ] `aws s3 cp/rm/ls` が動作する
- [ ] `boto3.client('s3', endpoint_url=...)` から同様の操作ができる
- [ ] SigV4 認証エラーが適切に返る（アクセス拒否時）
- [ ] S3 標準の XML エラーレスポンスが返る
- [ ] ユニットテスト + 統合テストが CI パスする
