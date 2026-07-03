# 認証簡素化設計書（2026-07-04）

ログインを「4桁固定パスコード照合」にダウングレードし、S3 設定取得・bcrypt・CI シークレット連携の認証機構を撤去する。

## 背景と割り切り

- 現行認証は S3 上の `config/auth.json`（bcrypt ハッシュ + version）を Lambda presigned URL 経由で取得して照合する構成で、要件に対して過剰。CI はシークレット未設定でデプロイ失敗し、ローカル開発では設定が取得できずログイン不能
- 要件は「初見の知らないユーザーが入ることの抑止」のみ。**パスコードはリポジトリとバンドルに露出する意図的なダウングレード**であり、それ以上の保護はしない
- README 等のドキュメントにはパスコードの具体値を記載しない（コードを読めば分かるが、ドキュメントとしては「コード内の固定パスコード」とだけ書く）

## 決定事項

- パスコードは **`src/stores/auth.ts` 内の定数に直書き**（値はコードのみが持つ。本書にも記載しない — auth.ts の `FIXED_PASSCODE` を参照）
- 入力形式は **4桁数字**（`/^\d{4}$/`）。trim 後に定数と完全一致で認証
- セッションは現行踏襲: localStorage キー `myol_auth_session`、TTL 12時間。`version` フィールドは廃止（照合先が消えるため）。旧形式セッション（`version` 付き）は `authenticatedAt` のみ読むため互換
- ルーターガードは不変。`ensureAuthenticated` は TTL チェックのみに簡素化

## 撤去対象

| 対象 | 内容 |
|---|---|
| `src/stores/auth.ts` | リモート設定取得一式（`fetchRemoteAuthConfig` / `getAuthConfig` / `parseRemoteAuthConfig` / ハッシュ正規化）、bcrypt 照合、version 失効判定 |
| 依存 | `bcryptjs`（dependencies から削除） |
| `package.json` scripts | `hash:passcode` / `hash:passcode:b64` |
| 環境変数 | `VITE_AUTH_CONFIG_KEY` / `VITE_AUTH_USERS`（`.env.example` / `src/vite-env.d.ts` / README から削除。ローカル `.env` は各自整理） |
| CI `.github/workflows/deploy.yml` | auth シークレット必須チェック・auth config JSON validate・`config/auth.json` S3 アップロードの3ステップと `MYOL_AUTH_CONFIG_JSON` / `MYOL_AUTH_USERS_CONFIG_JSON` env 参照 |

`src/lib/s3/client.ts` の presigned URL 経路は曲データ用に残る（変更しない）。S3 上の既存 `config/auth.json` は参照されなくなるのみで、削除は運用判断（本変更のスコープ外）。

## UI（LoginPage）

- 入力欄を4桁に（`maxlength="4"`、`inputmode="numeric"`）
- 文言を4桁前提に更新。エラーメッセージは「パスコードが違います」程度の一般文言（形式不正と不一致を区別して攻撃者にヒントを与える必要はないが、既存 UI が区別しているなら踏襲でよい）

## テスト方針

`src/stores/auth.test.ts` を新仕様で書き換える:

- 正しい4桁で `login` 成功、セッションが localStorage に保存される
- 不一致の4桁・3桁/5桁・非数字は失敗（ネットワークに一切触れないこと — fetch モック不要になったことがテスト構造で分かる状態にする）
- TTL: 12時間以内のセッションは `isAuthenticated` true、超過は false かつセッション破棄
- 旧形式セッション（`version` 付き JSON）が読み込めて有効判定される（互換）

## ドキュメント

- README の「認証仕様 (移行中)」節を全面書き換え: 4桁固定パスコード（値はコード参照）、意図的なダウングレードである旨、セッション 12h。`config/auth.json` の例・`hash:passcode` の説明・「ローカル開発時の扱い」節（ログイン不能問題は解消）を削除
- README の環境変数表から `VITE_AUTH_CONFIG_KEY` を削除。CI 節に `MYOL_AUTH_CONFIG_JSON` の記載があれば削除

## やらないこと

- レートリミット・ロックアウト等の追加保護（要件外）
- S3 上の `config/auth.json` の削除（運用判断）
- Lambda / 曲データ保存経路の変更
