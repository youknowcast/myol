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
- **デプロイ**: GitHub Actions (`.github/workflows/deploy.yml`)

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
chrome-extention/       # ufret からコード譜を取り込む Chrome 拡張 (MV3)
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

### メトロノーム (`src/lib/metronome/scheduler.ts`, `src/pages/song-detail/composables/useMetronome.ts`)
- 再生中に拍へ合わせてクリック音を鳴らす。小節の 1 拍目のみアクセント（高い音）
- プレーヤーバーのトグル (`MetronomeToggle.vue`) で ON/OFF。初期状態は OFF
- Web Audio の先読みスケジューラ方式。25ms 間隔のループで曲時刻を読み直し、
  `audioTime = ctx.currentTime + (beatSongTime - songTimeNow) / speedMultiplier`
  で約 100ms 先の拍を予約する。アンカーを持たないので seek・ループ・速度変更に自動追従する
- 予約済みの拍番号を記録して二重予約を防ぎ、拍番号が巻き戻った（ループ・後方 seek）ら記録をリセットする
- 先読み窓が曲末を跨ぐ場合は曲長で拍列挙を打ち切り、`songTime === 曲長` の拍は予約しない
  （折り返し後の拍 0 だけを鳴らし、ダウンビートの二重打ちを防ぐ）
- 音源ファイルは使わず oscillator + gain エンベロープ（約 30ms 減衰）で合成。音量は固定
- `AudioContext` はトグル ON のユーザー操作時に生成・resume する（ブラウザの自動再生制限対策）
- 拍子は曲全体で一定という現行の再生モデルに従う（小節ごとの拍数変化・音量スライダー・
  カウントインはスコープ外）

### S3 連携 (`src/lib/s3/client.ts`)
- Lambda 経由で presigned URL を取得
- API 未設定時はサンプルデータにフォールバック

### ufret インポート (`chrome-extention/`)
- `content.js` が ufret の DOM から `ExtractedSheet` を抽出
- `converter.js` が Grid 形式の ChordPro に変換 (純粋関数・`converter.test.js` でテスト)
- popup から `.cho` ダウンロード / クリップボードコピー
- ufret には小節線・セクション見出し・BPM が無いため、小節割りは行内のコード数と
  歌詞文字数から推定する。tempo は 120 固定で myol 側で直す
- 小節推定・セクション分割・capo の詳細は `docs/chordpro.md` の「Importing from ufret」
- Chrome は `_` 始まりのディレクトリを含む拡張機能を読み込めない。この配下に
  `__snapshots__` を作らないよう、vitest の `resolveSnapshotPath`（`vite.config.ts`）で
  スナップショットを `snapshots/` に出力している

## 環境変数

| 変数 | 用途 |
|------|------|
| `VITE_API_ENDPOINT` | Lambda 関数 URL |
| `LAMBDA_ROLE_ARN` | Lambda デプロイ時の IAM ロール ARN |

## デプロイ

デプロイ経路は GitHub Actions に一本化。

- `main` への push で `.github/workflows/deploy.yml` が実行される
- 必要な Variables/Secrets は README.md の「デプロイ (CI)」を参照

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

- 認証はコード内の固定4桁パスコード照合（`src/stores/auth.ts` の `FIXED_PASSCODE`）。抑止目的のみの意図的なダウングレードで、値はバンドルに露出する前提。セッションは localStorage に12時間保存（README「認証」参照）。ドキュメントにパスコードの具体値は書かない
- S3 バケットは us-west-2 リージョン
- Lambda 関数 URL の CORS は本番 Origin のみ許可 (`AllowOrigins=*` は使わない)
