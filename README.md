# myol

ギタータブ譜・コード譜ビューアー PWA

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## 環境変数

`.env.example` を `.env` にコピーして設定：

```bash
cp .env.example .env
```

| 変数 | 説明 |
|------|------|
| `VITE_AUTH_USERS` | user:hash をカンマ区切りで指定 (bcrypt そのまま / `b64:` で base64url 化) |
| `VITE_API_ENDPOINT` | Lambda 関数 URL |

パスコードはハッシュ化前に `trim + uppercase` で正規化されます。

`b64:` 形式は `$` のエスケープが不要:

```bash
# bcrypt 生文字列で使う場合
npm run hash:passcode -- ABC123

# .env で扱いやすい b64 形式
npm run hash:passcode:b64 -- ABC123
# VITE_AUTH_USERS=youknow:b64:...
```

## リリース (env + awscli)

`scripts/release.sh` は以下を冪等に実行します。

- S3 バケットの作成確認/作成 (`MYOL_WEB_BUCKET`, `MYOL_DATA_BUCKET`)
- データバケット CORS を本番 Origin のみに設定
- Lambda 関数の作成/更新 (コード + 設定)
- Lambda Function URL の作成/更新とパーミッション付与
- フロントエンド build と `MYOL_WEB_BUCKET` への同期

必要コマンド: `aws`, `npm`, `zip`, `jq`

必須環境変数:

```bash
export MYOL_AWS_REGION=us-west-2
export MYOL_WEB_BUCKET=myol.daycrift.net
export MYOL_DATA_BUCKET=myol.daycrift.net-data
export MYOL_FRONTEND_ORIGIN=https://myol.daycrift.net
export MYOL_LAMBDA_FUNCTION_NAME=myol-presigned-url
export MYOL_LAMBDA_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/myol-lambda-role
export MYOL_CLOUDFRONT_DISTRIBUTION_ID=<distribution-id>

# 必要な場合のみ (例: /myol 配下に配置する場合)
# export MYOL_CLOUDFRONT_ORIGIN_PATH=/myol
```

実行:

```bash
./scripts/release.sh
```

前提:

- `scripts/release.sh` は `MYOL_FRONTEND_ORIGIN` のホスト名を手がかりに
  既存 Origin を検索し、見つかれば `MYOL_WEB_BUCKET` 向け S3 Origin に更新する
- 見つからない場合は CloudFront Origin を自動追加する
- Origin の OAC を自動作成/関連付けし、Web バケットポリシーへ
  Distribution 限定の `s3:GetObject` を冪等に反映する
- Cache Behavior がその Origin を参照していない場合は warning を表示する
