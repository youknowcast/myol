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
| `VITE_API_ENDPOINT` | Lambda 関数 URL |

## 認証

ログインは4桁数字の固定パスコードです（値は `src/stores/auth.ts` の定数）。

- 目的は「初見の第三者が操作できないようにする」抑止のみで、それ以上の保護は意図していません（パスコードはリポジトリおよび配布バンドルから読み取れます）
- セッションは localStorage に保存され、12時間で失効します
- ネットワーク・外部設定に依存しないため、ローカル開発でもそのままログインできます

## デプロイ (CI)

`.github/workflows/deploy.yml` は `main` への push でデプロイします。

`scripts/release.sh` は廃止し、デプロイ経路は GitHub Actions に一本化しています。

設定が必要な `Repository Variables`:

- `MYOL_AWS_REGION`
- `MYOL_WEB_BUCKET`
- `MYOL_LAMBDA_FUNCTION_NAME`
- `MYOL_API_ENDPOINT` (Lambda Function URL)

設定が必要な `Repository Secrets`:

- `AWS_DEPLOY_ROLE_ARN` (GitHub OIDC で Assume するロール)
- `MYOL_CLOUDFRONT_DISTRIBUTION_ID`
