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
| `VITE_AUTH_PASSWORD` | 4桁ログインパスワード |
| `VITE_API_ENDPOINT` | Lambda 関数 URL |

## Lambda デプロイ

### 1. IAM ロール作成 (初回のみ)

```bash
cd infra
./setup.sh
```

### 2. Lambda デプロイ

```bash
# Role ARN を取得して環境変数に設定
export LAMBDA_ROLE_ARN=$(aws iam get-role --role-name myol-lambda-role --query 'Role.Arn' --output text)

# デプロイ
cd lambda/presigned-url
npm install
npm run deploy
```

### 3. Lambda 関数 URL 有効化

AWS Console または:

```bash
aws lambda create-function-url-config \
  --function-name myol-presigned-url \
  --auth-type NONE \
  --cors 'AllowOrigins=*,AllowMethods=*,AllowHeaders=*' \
  --region us-west-2
```

### 4. 関数 URL 取得

```bash
aws lambda get-function-url-config \
  --function-name myol-presigned-url \
  --region us-west-2 \
  --query 'FunctionUrl' \
  --output text
```

取得した URL を `.env` の `VITE_API_ENDPOINT` に設定。
