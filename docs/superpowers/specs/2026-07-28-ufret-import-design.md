# ufret 譜面インポート設計

作成日: 2026-07-28

## 背景と目的

譜面の手入力が重く、myol に曲が増えない。初手のたたき台を ufret から自動生成できれば、
以降は myol のエディタで直すだけになり、投入コストが大きく下がる。

`chrome-extention/` には既に ufret から `[C]歌詞` 形式のインライン ChordPro を抽出して
`.cho` を落とす実装がある。しかし myol が実際に編集・再生に使うのは Grid 形式であり、
アプリ側の「小節を自動割り振り」は **コード1個 = 1拍で4個ずつ小節に詰める** 実装のため、
コードが疎な J-POP ではほぼ正しい結果にならない。

本設計では拡張機能の出力を **Grid 形式の ChordPro まで引き上げる**。

## ufret の実 DOM 調査結果

対象: スピッツ「優しいあの子」 (`https://www.ufret.jp/song.php?data=52294`)

コード譜は難読化された JS が実行時に組み立てるため、静的な HTML 取得では取れない。
content script で実 DOM を読む現行方式が唯一の選択肢。

取得できるもの:

- `#my-chord-data` 配下に `.chord-row` が並ぶ（この曲では 37 行）
- 各行は `p.chord` の並び。`rt` にコード名、`.mejiowvnz .col` に歌詞が **1文字1span**
- 歌詞がコード単位で区切られているため、`{lyrics_hint}` の per-measure 分割にそのまま流用できる
- `#my-chord-data[capo]` 属性（この曲では `-2`）
- コードを持たない `p.chord`（行頭に来る前行からの歌詞の続き）が存在する

取得できないもの:

- **小節線・拍子**（一切無い）
- **セクション見出し**（イントロ / A メロ / サビ等は DOM に存在しない）
- **BPM**（BPM 連動スクロールはプレミアム限定機能で、数値自体がページに出ない）

行あたりのコード数は **4 が 37 行中 25 行** と支配的で、この曲の
「1コード = 1小節 / 1行 = 4小節」という構造と一致する。これを小節推定の土台にする。

## アーキテクチャ

```
chrome-extention/
  manifest.json
  content.js          ufret DOM → ExtractedSheet（サイト固有・DOM 依存）
  converter.js        ExtractedSheet → ChordPro 文字列（純粋関数・ESM）
  converter.test.js   vitest
  popup.html
  popup.js            converter を import し、変換 → ダウンロード / クリップボード
```

変換は **popup 側**で行う。popup は拡張機能ページなので `<script type="module">` が使え、
`converter.js` を静的 import できる（content script は MV3 で ES module を直接読めない）。
content script は DOM 掻き出しだけの薄い層に留め、**出力品質を決めるロジックを
すべてテスト可能な純粋関数に隔離する**。ビルドステップは導入しない。

### 層の境界

content script と popup の間で受け渡す構造（JSDoc で型を付ける）:

```js
/** @typedef {{ chord: string|null, text: string }} ExtractedCell */
/** @typedef {{ cells: ExtractedCell[] }} ExtractedRow */
/**
 * @typedef {Object} ExtractedSheet
 * @property {string} title
 * @property {string} artist
 * @property {number|null} capoOffset  #my-chord-data の capo 属性値
 * @property {ExtractedRow[]} rows
 */
```

- `content.js` の責務は `ExtractedSheet` を作るところまで。ChordPro の知識を持たない。
- `converter.js` の責務は `ExtractedSheet` → ChordPro 文字列。DOM の知識を持たない。
- ufret 以外のサイトを足すときは `content.js` に extractor を追加するだけで、
  `converter.js` は変更しない。

## 変換ルール

### 小節割りの推定

基準小節数 `M` = `{time:}` の分子。本設計では `{time:}` を 4/4 固定で出力するため
`M` は常に 4 だが、拍子を変えられるよう定数ではなく引数で受け取る。
行内でコードを持つセル数を `n` とする。

| 条件 | 小節割り |
|---|---|
| `n === 0` | 行を捨てる |
| `n >= M` | 1コード = 1小節（`n` 小節） |
| `n < M` かつ行に歌詞あり | `M` 小節を歌詞文字数比で配分 |
| `n < M` かつ行に歌詞なし（イントロ・間奏） | 1コード = 1小節 |

文字数比の配分は最大剰余法で行い、**各コードに最低1小節**を保証する:

1. 各コードの重み `w` = トリム後の歌詞文字数（0 の場合は 1）
2. 各コードにまず 1 小節を割り当て、残り `M - n` 小節を `w` の比で按分
3. 小数部の大きい順に余りを 1 小節ずつ配る

例（`M = 4`）:

- `F(暗い=2) C(道が=2) G(続いてて=4)` → 1:1:2 → `| F | C | G | G |`
- `F(丸い大空=4) G(の色を=3)` → 2:2 → `| F | F | G | G |`

配分で増えた 2 小節目以降は `lyricsHint` を空にする。`%`（前小節のリピート）は
使わず同じコード名を素直に書く（myol エディタ上で編集しやすいため）。

### 行頭のコード無しセル

行頭に現れるコードを持たないセル（前行からの歌詞の続き。例: 行7 の「味」）は、
**直前の行の最後の小節の `lyricsHint` に追記**する。直前の行が無い場合は捨てる。

### セクション分割

**行に歌詞があるかどうかが切り替わる境目**でセクションを分割する。

- 歌詞なし行の連続が先頭にある → `Intro`
- 歌詞なし行の連続が末尾にある → `Outro`
- 歌詞なし行の連続が中間にある → `Interlude N`（1 始まりの連番）
- 歌詞あり行の連続 → `Verse N`（1 始まりの連番）

判定は先頭を優先する。曲全体に歌詞が無く歌詞なしセクションが 1 つだけになる場合は
`Intro` とする。

各セクションは `{start_of_grid label="..."}` / `{end_of_grid}` で囲む
（`label="..."` は `serializeChordPro` の出力形式と同じ）。

### メタデータ

| ディレクティブ | 値 |
|---|---|
| `{title:}` | `.show_name` |
| `{artist:}` | `.show_artist`（空白正規化） |
| `{capo:}` | `-capoOffset`（`capo="-2"` → `{capo: 2}`）。`capoOffset >= 0` のときは出力しない |
| `{tempo:}` | **120 固定**。ufret から取得不能のため myol 側で直す前提 |
| `{time:}` | **4/4 固定**。ufret に拍子情報が無いため |

`capo` の解釈: ufret の `capo` 属性は「原曲キーからの半音オフセット」で、負値はカポで
補う量を表す。優しいあの子は `capo="-2"` で C 系の押さえが表示され、カポ 2 で原曲 D に
一致することを確認済み。

## 受け渡し

popup に 2 つの導線を置く:

1. **`.cho` ダウンロード**（現行踏襲）。ファイル名は `{artist}_{title}.cho`、
   ファイル名に使えない文字は `_` に置換。title / artist が両方空なら `chordpro.cho`
2. **クリップボードへコピー**。myol にはファイルインポート UI が無く、結局
   新規作成画面のテキスト欄に貼ることになるため、ファイルを開く手間を省く

## テスト

`converter.test.js` を vitest で書く（リポジトリの `npm test` に乗る）。
フィクスチャは今回取得した実 DOM の 37 行を `ExtractedSheet` として JSON でコミットする。

- `distribute()` の単体テスト: 等分ケース、剰余ケース、重み 0 ケース、
  各コードに最低 1 小節が保証されること
- 行頭コード無しセルが前行の最終小節にマージされること
- 行に歌詞が無い場合に文字数比配分が働かず 1コード = 1小節になること
- セクション分割とラベル付け（Intro / Verse N / Interlude N / Outro）
- 実曲フィクスチャ → ChordPro のスナップショット
- **生成した ChordPro を `src/lib/chordpro/parser.ts` の `parseChordPro()` に通し、
  期待する小節数・`lyricsHint` が復元されること**（拡張機能の出力が myol で
  読めることの担保）

## スコープ外

- **`A#` 等シャープ / フラット根音のコード辞書追加**。`src/lib/chords/dictionary.ts` には
  `D/F#` を除きシャープ / フラット根音のエントリが無く、ufret が出す `A#` はダイアグラムが
  表示されない。拡張機能ではなく辞書側の既存の穴のため、別途対応する
- ufret 以外のサイト対応（層は分けるが実装しない）
- myol アプリ側のファイルインポート UI
- BPM の推定・入力

## 付録: 実 DOM の再取得手順

この環境には Google Chrome stable が無く chrome-devtools MCP は起動できない。
`/usr/bin/chromium` を `--headless=new --remote-debugging-port=<port>` で起動し、
CDP の `Page.navigate` → 数秒待機 → `Runtime.evaluate` で DOM を読む。
コード譜の描画に時間がかかるため、待機は 9 秒程度必要。

抽出クエリ:

```js
const root = document.querySelector('#my-chord-data')
Array.from(root.querySelectorAll('.chord-row')).map(row =>
  Array.from(row.querySelectorAll('p.chord')).map(p => ({
    chord: (p.querySelector('rt')?.textContent || '').trim() || null,
    text: Array.from(p.querySelectorAll('.mejiowvnz .col')).map(el => el.textContent).join('')
  }))
)
```
