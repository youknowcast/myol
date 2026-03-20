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

## デプロイ (CI)

`.github/workflows/deploy.yml` は `main` への push でデプロイします。

`scripts/release.sh` は廃止し、デプロイ経路は GitHub Actions に一本化しています。

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
