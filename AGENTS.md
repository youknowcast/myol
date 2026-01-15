# AGENTS.md

AI エージェント向けのプロジェクト情報

## 概要

myol はギタータブ譜・コード譜を表示・編集する PWA。ChordPro 形式をパースして歌詞+コード、Grid 表示に対応。

## 技術スタック

- **フロントエンド**: Vue 3 + TypeScript + Vite
- **状態管理**: Pinia
- **ルーティング**: Vue Router (認証ガード付き)
- **PWA**: vite-plugin-pwa
- **バックエンド**: AWS Lambda (Node.js 22.x) + S3
- **デプロイ**: lambroll

## ディレクトリ構造

```
src/
├── components/          # UI コンポーネント
│   ├── chord/          # コードダイアグラム
│   ├── player/         # 再生コントロール
│   └── song/           # 曲表示 (歌詞、Grid)
├── lib/
│   ├── chordpro/       # ChordPro パーサー
│   ├── chords/         # コード辞書
│   └── s3/             # S3 API クライアント
├── pages/              # ページコンポーネント
├── router/             # ルーティング設定
└── stores/             # Pinia ストア

lambda/
└── presigned-url/      # Lambda 関数 (S3 presigned URL 発行)

infra/                  # AWS インフラ設定
scripts/                # ユーティリティスクリプト
```

## 主要機能

### ChordPro パーサー (`src/lib/chordpro/parser.ts`)
- 歌詞 + コード (`[G]Amazing grace`)
- Grid セクション (`{start_of_grid}`)
- Tab セクション
- メタデータ (title, artist, key, tempo, time)

### 再生機能 (`src/pages/SongDetailPage.vue`)
- BPM × 小節数から総時間を計算
- シークバーで任意位置へ移動
- 現在小節のハイライト表示
- 速度調整 (0.5x - 2x)

### S3 連携 (`src/lib/s3/client.ts`)
- Lambda 経由で presigned URL を取得
- API 未設定時はサンプルデータにフォールバック

## 環境変数

| 変数 | 用途 |
|------|------|
| `VITE_AUTH_PASSWORD` | ログインパスワード (4桁) |
| `VITE_API_ENDPOINT` | Lambda 関数 URL |
| `LAMBDA_ROLE_ARN` | Lambda デプロイ時の IAM ロール ARN |

## デプロイ

詳細は README.md を参照。

```bash
# フロントエンド
npm run build

# Lambda
export LAMBDA_ROLE_ARN=$(aws iam get-role --role-name myol-lambda-role --query 'Role.Arn' --output text)
cd lambda/presigned-url && npm run deploy
```

---

## Lambda 関数 URL の注意点

### パーミッション設定

Lambda 関数 URL を公開する場合、**2つのパーミッション**が必要:

```json
[
  {
    "Sid": "FunctionURLAllowPublicAccess",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "lambda:InvokeFunctionUrl",
    "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:FUNCTION_NAME",
    "Condition": {
      "StringEquals": {
        "lambda:FunctionUrlAuthType": "NONE"
      }
    }
  },
  {
    "Sid": "FunctionURLAllowInvokeAction",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "lambda:InvokeFunction",
    "Resource": "arn:aws:lambda:REGION:ACCOUNT:function:FUNCTION_NAME",
    "Condition": {
      "Bool": {
        "lambda:InvokedViaFunctionUrl": "true"
      }
    }
  }
]
```

> ⚠️ `lambda:InvokeFunctionUrl` だけでは不十分。`lambda:InvokeFunction` も追加が必要。

### CORS 設定

- **関数 URL 側で CORS を設定**する (AWS Console または CLI)
- **Lambda コード内では CORS ヘッダーを追加しない** (重複するとエラー)

```typescript
// ❌ NG: Lambda コードで CORS ヘッダーを設定
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // ...
}

// ✅ OK: Content-Type のみ設定
const responseHeaders = {
  'Content-Type': 'application/json'
}
```

### Handler パス

lambroll + esbuild 使用時、出力が `dist/index.js` の場合:

```json
{
  "Handler": "dist/index.handler"
}
```

### 関数 URL 再作成時

関数 URL を削除・再作成すると **URL が変わる**。再作成後:
1. パーミッションを再追加
2. `.env` の `VITE_API_ENDPOINT` を更新

---

## 一般的な注意事項

- 認証はビルド時埋め込み (本番環境では強化を検討)
- S3 バケットは us-west-2 リージョン
- Lambda 関数 URL は CORS `*` を許可 (ローカル開発用)
