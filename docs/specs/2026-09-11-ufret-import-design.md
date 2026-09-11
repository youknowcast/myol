# ufret 取り込み精度改善 + エージェント自律保存

## 背景と課題

`chrome-extention/content.js` は ufret の描画後 DOM (`#my-chord-data` の `.chord-row` > `p.chord`)
を読み、`converter.js` が小節を推定する。ufret 側は DOM を 1 文字ずつ組み立てる際に
`lyrics.substring(j, j + 1).trim()` で空白を落とすため、DOM からは半角/全角スペースが失われる。

この結果、次の 2 症状が出る。

- **歌詞とコードのズレ**: `converter.js` は 1 コードが複数小節にまたがると、歌詞全文を先頭小節の
  `{lyrics_hint}` にだけ載せ、残りの小節を空にする。myol は `{lyrics_hint}` を小節と 1:1 で
  対応させるため、小節ごとの文字配置が崩れて見える。
- **小節割りがおかしい**: 小節数の配分を「歌詞の文字数比」で決めるが、その文字数が空白脱落で
  狂っている。

ufret のページには `var ufret_chord_datas = ["[Em7]8月  1[Bm7]5日…"]` が埋め込まれており、
空白込みの正確な `[コード]歌詞` と、空行による段落（セクション）区切りを持っている。
これを一次情報として使う。

## 目標

- 拡張機能の変換精度を上げる（生データ優先、DOM はフォールバック）。
- エージェントが任意の ufret URL から譜面をローカルへ自律保存できるようにする（skill + CLI）。
- 抽出ロジックを拡張機能と CLI で共有し、単一の真実にする。

## 非目標

- ufret に無い小節線を原曲どおり復元すること。小節は本質的に推定で、微調整は myol エディタで行う。
- capo / tempo / time の推定ロジックの変更（現状維持）。
- S3 への自動アップロード（既存の `scripts/upload-songs.sh` を利用者が任意で使う）。
- ログインユーザー専用の `get_chord.php` 経路や、プレミアム転調設定への追従。

## 全体構成

```
ufret URL ──fetch──> HTML ──extract.js──> ExtractedSheet ──converter.js──> ChordPro (.cho)
                                    ▲
拡張機能 content.js ──(生データ/DOM)──┘

scripts/import-ufret.mjs  …… CLI（上記パイプライン）
~/.claude/skills/ufret-import/SKILL.md  …… エージェントへの手順
```

抽出 (`extract.js`) と変換 (`converter.js`) は `chrome-extention/` に置く純粋関数群とする。
拡張機能はビルドレス、CLI は Node 標準 API のみで動かす。`src/` からは import しない
（拡張機能を独立配布するため。既存 `parseMeasuresPerRow` と同じ方針）。

## コンポーネント詳細

### 1. 共有抽出モジュール `chrome-extention/extract.js`（新規）

`ExtractedSheet` に「空行で始まる行」を示す `sectionBreak` を追加する（後方互換の任意フィールド）。

```js
/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[], sectionBreak?: boolean }} ExtractedRow */
/** @typedef {{ title: string, artist: string, capoOffset: number|null, rows: ExtractedRow[] }} ExtractedSheet */
```

- `parseChordDatas(source)` — HTML または JS 断片から `ufret_chord_datas` の配列を返す。
  見つからなければ `null`。JS 配列リテラルは `JSON.parse` で読む（`\/` `\uXXXX` は JSON として妥当）。
- `parseMeta(source)` — `<h1 class="p-detail-head__ttl">` と `<a class="p-detail-head__artist">` から
  title / artist を取り出す。HTML タグ・余分な空白は除去。戻り値は `{ title, artist }`。
- `buildSheet(chordDatas, meta)` — 各データ行を `[コード]歌詞` に分解して `ExtractedSheet` を作る。
  `meta` は `{ title, artist, capoOffset }`。`capoOffset` は呼び出し側が決める
  （拡張機能は `#my-chord-data` の `capo` 属性、CLI は `null`）。
  - 行頭〜最初のコードのテキストがあれば `{ chord: null, text }` セルにする。
  - 各 `[コード]` は `{ chord, text }` セル。行末 CR / 先頭 BOM は除去。
  - 空行は自身をスキップし、次の非空行に `sectionBreak: true` を立てる。
  - `capoOffset` は `meta.capoOffset`（CLI は既定 `null`）。
- `extractFromDocument(doc)` — 拡張機能用。`doc.scripts` を走査して `ufret_chord_datas` を持つ
  インライン script を探し、あれば `buildSheet`。無ければ従来の DOM セレクタで組み立てる。
  - 戻り値は現行と同じ `{ status: 'unsupported' | 'loading' | 'ok', sheet? }`。
  - `#my-chord-data` が無い → `unsupported`、あって `.chord-row` が無い → `loading`。
- `extractFromHtml(html)` — CLI 用。`parseChordDatas` + `parseMeta` で `{ status, sheet? }`。
  生データが無ければ `unsupported`。

DOM フォールバックは現行 `content.js` の抽出コードをそのまま移す（挙動を変えない）。

### 2. `converter.js` の改善

- `convertRows(rows, measuresPerRow)`:
  - 配分の重みを生テキスト長（`group.text.length`、空白込み）から計算する。現行の
    `group.text.trim().length` をやめる（`hasLyrics` 判定は従来どおり trim で行う）。
  - `row.sectionBreak` を `ConvertedRow.blockStart` に引き継ぐ。
  - 行頭コード無しセルを前行最終小節へ連結する際、`row.sectionBreak` があれば連結しない。
  - 1 コードが `k` 小節にまたがる場合、歌詞を文字数比分けて各小節の `hint` に割り当てる
    （`splitText(text, k)` を新設。`k` 分割で各要素は前詰め、余りは先頭側に配る）。
    `k === 1` なら従来どおり全文。
- `splitSections(rows)`:
  - `blockStart` を持つ行が 1 つでもあれば、それをブロック境界にする。
  - 無ければ従来どおり `hasLyrics` の切り替わりで分割（DOM フォールバック互換）。
  - ラベルはブロックの歌詞有無で `Intro` / `Verse N` / `Interlude N` / `Outro`。
- コード無しマーカー `　/　` と `N.C.` / `N.C` は `chord: null` 相当に正規化する
  （現行の `groupCellsByChord` 前に空文字/null 化）。
- メタデータ・capo・time の出力は変更しない。

### 3. 拡張機能 `chrome-extention/content.js`

- ロジックを `extract.js` に委譲し、`extractFromDocument(document)` を呼ぶだけにする。
- メッセージプロトコル (`MYOL_EXTRACT`) と `status` の意味は維持。
- popup 側の変更は不要。

### 4. ローカル保存 CLI `scripts/import-ufret.mjs`（新規）

```
node scripts/import-ufret.mjs <url> [--out DIR] [--stdout] [--name NAME]
```

- `fetch(url, { headers: { 'User-Agent': <ブラウザ相当>, 'Accept-Language': 'ja' } })`。
- `extractFromHtml` → `convertSheetToChordPro`。
- 保存先ディレクトリの優先順位: `--out` > `$MYOL_SONGS_DIR` > `~/Music/myol/`。無ければ `mkdir -p`。
- ファイル名: `<artist>_<title>.cho`（既存 popup と同じ `sanitize`。空なら `chordpro.cho`）。
  `--name` 指定時はそれを使う。
- `--stdout` は保存せず標準出力へ ChordPro を出す。
- 成功時は `Saved: <絶対パス>` を表示。生データ無しは非ゼロ終了で理由を stderr へ。
- 実在曲の歌詞をリポジトリへ書き出さない（保存先は必ずリポジトリ外が既定）。

### 5. グローバル skill `~/.claude/skills/ufret-import/SKILL.md`（新規）

`codex-review` と同形式（frontmatter に `name` / `description`）。

- トリガー例: 「ufret から保存」「この譜面をローカルに保存」「ufret の URL から .cho を作って」。
- 手順:
  1. 対象 URL を確定する（複数可）。
  2. `MYOL_HOME`（既定 `/home/youknow/Documents/workspace/myol`）の
     `scripts/import-ufret.mjs` を実行する。
  3. 保存されたパスを報告する。小節の微調整は myol エディタで行う旨を添える。
  4. 実在曲の歌詞・コード譜をリポジトリへコミットしない注意を守る。

## エラーハンドリング

- 生データが無い / 非 ufret ページ: `unsupported`。CLI は非ゼロ終了、拡張は現行メッセージ。
- 描画前で `.chord-row` も生データも無い: 拡張は `loading` を返し、popup の既存リトライに乗る。
- コードが 1 つも無い: 既存どおり `{start_of_grid}` が出ず、popup が「コードが見つからなかった」を表示。
- 保存先が作れない / 書き込み失敗: CLI は例外を捕捉して非ゼロ終了、理由を stderr へ。

## テスト

- `chrome-extention/extract.test.js`（新規）
  - 合成 HTML 文字列（`ufret_chord_datas` にダミーのコード/歌詞、`h1` / `a` メタ）で
    `parseChordDatas` / `parseMeta` / `buildSheet` / `extractFromHtml` を検証。
  - 空行が `sectionBreak` になること、行頭歌詞が `chord: null` セルになることを検証。
- `chrome-extention/converter.test.js`（拡張）
  - 空白込みの重みで配分が変わること。
  - 複数小節にまたがるコードの歌詞が小節ごとに分割されること。
  - `sectionBreak` でセクションが切れ、前行への連結が起きないこと。
  - `　/　` がコード無しになること。
  - 既存テストと snapshot の更新。
- `scripts/import-ufret.mjs` はロジックを `extract.js` / `converter.js` に委譲するため、
  ファイル入出力のみ。保存先解決とファイル名生成を純粋関数に切り出して単体テストする
  （`scripts/import-ufret.test.js`、リポジトリ既存の vitest で実行）。
- テスト用フィクスチャはすべて合成。実在曲の歌詞・コード譜はコミットしない。
- 完了条件: `npm test` と `npm run lint` が通ること。

## 決定事項

- 抽出の一次情報は埋め込み `ufret_chord_datas`。DOM はフォールバック。
- 小節は推定。完全一致は求めず、editor で微調整する。
- 保存先の既定はリポジトリ外 `~/Music/myol/`。著作権配慮。
- エージェント経路はグローバル skill + リポジトリ内 CLI。
