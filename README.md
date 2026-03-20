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
| `VITE_AUTH_CONFIG_KEY` | 認証設定を保存する S3 キー (既定: `config/auth.json`) |
| `VITE_API_ENDPOINT` | Lambda 関数 URL |

## 認証仕様 (移行中)

認証は次の仕様に統一予定です。

- ログイン入力は **6桁数字のみ** (`/^\d{6}$/`)
- フロントは S3 上の認証設定 (`config/auth.json`) を取得して照合
- 照合は `bcrypt.compare` を使う
- `VITE_AUTH_USERS` による埋め込み認証は廃止予定

`config/auth.json` の例:

```json
{
  "passcodeHash": "$2b$10$...",
  "version": 1
}
```

`passcodeHash` は以下のスクリプトで生成できます。

```bash
npm run hash:passcode -- 123456
```

`version` は任意ですが、セッション失効判定に使えるため付与を推奨します。

### ローカル開発時の扱い

ローカルでのログインスキップは検討中です。現在は本番仕様優先で、
`VITE_API_ENDPOINT` と S3 上の認証設定を前提に動作確認してください。

## リリース (env + awscli)

`scripts/release.sh` は以下を冪等に実行します。

- S3 バケットの作成確認/作成 (`MYOL_WEB_BUCKET`, `MYOL_DATA_BUCKET`)
- データバケット CORS を本番 Origin のみに設定
- CloudFront Distribution の作成または更新 (myol 専用前提)
- CloudFront OAC の作成/関連付けと Web バケットポリシー設定
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
export MYOL_ACM_CERT_ARN=arn:aws:acm:us-east-1:<ACCOUNT_ID>:certificate/<CERT_ID>
export MYOL_LAMBDA_FUNCTION_NAME=myol-presigned-url
export MYOL_LAMBDA_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/myol-lambda-role

# 既存 Distribution を使う場合のみ
# export MYOL_CLOUDFRONT_DISTRIBUTION_ID=<distribution-id>

# 任意 (デフォルト: PriceClass_200)
# export MYOL_CLOUDFRONT_PRICE_CLASS=PriceClass_200
```

実行:

```bash
./scripts/release.sh
```

補足:

- `MYOL_CLOUDFRONT_DISTRIBUTION_ID` 未指定時は myol 専用 Distribution を新規作成する
- 指定時はその Distribution を myol 用設定に更新する

## GitHub Actions デプロイ

`.github/workflows/deploy.yml` は `main` への push でデプロイします。

設定が必要な `Repository Variables`:

- `MYOL_AWS_REGION`
- `MYOL_WEB_BUCKET`
- `MYOL_DATA_BUCKET`
- `MYOL_API_ENDPOINT` (Lambda Function URL)

設定が必要な `Repository Secrets`:

- `AWS_DEPLOY_ROLE_ARN` (GitHub OIDC で Assume するロール)
- `MYOL_CLOUDFRONT_DISTRIBUTION_ID`
- `MYOL_AUTH_CONFIG_JSON` (推奨。`config/auth.json` を自動更新)
- `MYOL_AUTH_USERS_CONFIG_JSON` (互換用。未設定なら無視される)
