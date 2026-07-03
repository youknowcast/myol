# 整合性リファクタ設計書（2026-07-03）

myol（ギター弾き語り補助 PWA）のデータモデル・状態管理・表示の不整合を解消するリファクタの設計。

## 背景（監査で確認した問題）

1. **`lyrics_hint` の往復破損** — 保存や編集のたびに ChordPro テキスト⇄モデルの往復が走り、ヒント数と小節数の対応を個数ヒューリスティック（`applyLyricsHints`）で復元しているため、複数行グリッドでヒントが別の小節にずれる（parser.ts:57-81, 629-637）。
2. **「行」の概念が3通り** — パーサは元テキストの行、`generateChordPro` は4小節/行、`useGridViewState` は2小節/行で `GridRow` を再構成しており、行依存の処理が非決定的。
3. **小節編集エンジンが2つ並存** — `chordproEditor` ストアの小節操作は全てデッドコードで、実働は `useGridMeasureEditor`。さらにセクション跨ぎ移動は `SongEditPage.vue` に3つ目の実装があり、同一ドラッグで別セルを掴み得る。業務ルール（歌詞付き小節の削除禁止）はデッド側にのみ存在。
4. **同一 content を3箇所で独立パース** — `chordproEditor.document` / `useChordProDocument.parsedSong` / `songs` ストア。編集ページでは watcher のタイミングだけで整合。保存時は `useSongEditForm` が非拡張パーサで全文往復させるため、タイトル変更だけでもヒントが壊れ得る。
5. **「現在小節」計算が4通り** — GridView のバー再walk・LyricsView の剰余・Karaoke の行レンジ・offset 方式。うち LyricsView / SongKaraokeView は未使用。Detail ページは歌詞のみセクションを描画しないのに小節数にカウントするため、混在曲でハイライトがずれる。
6. その他 — `hint`/`lyricsHint`/`lyrics`/`lyrics_hint` 等の命名揺れ、バー判定・セル表示・`beatsPerMeasure` の重複実装、docs と型定義の仕様矛盾、`/`（ノーコード）トークン未対応、no-op の `ensureGridMeasures`。

## 決定事項

- **小節（`Measure`）を唯一の構造単位とする。** 歌詞ヒントは小節に 1:1 で対応（`Measure.lyricsHint`）。
- **保存形式は新形式に移行（マイグレーション型）。** 既存データは読み込み互換のみ維持し、保存時に新形式へ書き換わる。
- **未使用の `LyricsView` / `SongKaraokeView`（+ `useLyricsHighlight` / `useKaraokeScroll`）は削除。** 必要になれば統一ハイライト基盤の上で作り直す。
- **歌詞付き小節の削除は許可**（実働側の現行挙動に統一）。確認ダイアログは付けない。

## 新しい保存形式

`{lyrics_hint}` は直下のグリッド行の直前に置き、`|` 区切りで各小節に 1:1 対応させる。

```chordpro
{start_of_grid}
{lyrics_hint: Amazing grace how | sweet the sound}
| G . . . | C . G . |
{lyrics_hint: That saved a | wretch like me}
| G . . . | D . . . |
{end_of_grid}
```

- ヒント行の `|` 分割数と直下行の小節数が 1:1。小節にヒントが無い場合は空セグメント（`{lyrics_hint: | sweet}` = 1小節目ヒント無し）。行全体にヒントが無ければディレクティブ自体を省略。
- 制約: 歌詞テキスト内に `|` は使用不可（パーサは区切りとして扱う）。docs に明記する。
- `generateChordPro` は決定的に出力する: 4小節/行で改行し、各行の直前にその行分のヒントを出す。ヒント⇄小節の対応は位置で一意に決まり、ヒューリスティック不要。
- **読み込み互換（レガシー）**: ヒント行に `|` が含まれない場合は旧形式とみなし、既存の個数ヒューリスティック（小節数一致→小節単位 / 行数一致→行頭小節へ / それ以外→先頭から順）で解釈する。このレガシー解釈は `parseLegacyLyricsHints` として隔離し、新形式の書き出しには一切関与させない。

## フェーズ計画

各フェーズは単独で lint / test が通り、デプロイ可能な状態で完了する。

### Phase 1: データモデルと保存形式

- `GridRow` 型と再構成関数（`gridRowsFromMeasures` / `parseGridRow` の外部公開 / `lyricsLineToGridRow` の `GridRow` 依存）を廃止。パーサ内部の中間表現としても `Measure[]` を直接組み立てる。
- 新形式の parse / generate を実装。旧形式読み込みは `parseLegacyLyricsHints` に隔離。
- パーサバグ修正: `/` を `GridCell { type: 'noChord' }`（表示は `/`）として扱う。`ensureGridMeasures`（no-op）を削除。
- `docs/chordpro.md` を新仕様に全面更新（行単位→小節単位、`|` 区切り、レガシー注記）。
- ラウンドトリップ性テストを追加: 任意の ParsedSong について parse(generate(x)) ≡ x（ヒント位置を含む）。旧形式→新形式の移行テストも追加。

### Phase 2: 状態管理の再編

責務マップ:

| 層 | 責務 |
|---|---|
| `lib/chordpro` | 純関数のみ: parse / generate / バー判定 / セル表示文字 / beatsPerMeasure。Vue 非依存 |
| `stores/songs` | 曲一覧と永続化（S3）。content とメタデータのみ。メタ抽出は lib 関数 |
| `stores/chordproEditor` | 編集の唯一の SoT。document 保持と全ミューテーション（セクション・小節とも） |
| `useChordProDocument` | 閲覧側（Detail）の読み取り専用パース。lib へ委譲 |
| コンポーネント | intent を emit するのみ。モデルを自前で組み立てない |

- `useGridMeasureEditor` のロジックを純関数化して store アクションとして公開。store 側デッドコード（`addMeasure`/`deleteMeasure`/`updateMeasureCells`/`swapMeasures`/`selectSection`/`selectMeasure`/`currentSection`/`currentGridSection`/`currentMeasures`/`totalMeasures`/`isDirty`/`selectedSectionIndex`/`selectedMeasureIndex`）と `SongEditPage.vue` の重複セクション跨ぎ移動実装を削除。
- 編集中の毎ミューテーション serialize（`useChordProEditorSync` の deep watcher）を廃止。parse/generate は **テキスト⇄ビジュアルのモード切替時と保存時のみ**。保存は `store.serialize()` を直接読む。
- `useSongEditForm.applyMetadataToContent`（非拡張パーサでの全文往復）を廃止し、メタデータは store の document を直接更新。
- 「選択中の小節」状態を `useGridSectionManager` の1箇所に統一。
- `extractMeasuresFromGrid` フォールバック5箇所を削除。

### Phase 3: 表示・ハイライトの一貫性

- 「現在小節」= `usePlaybackState` のグローバル小節番号 + 1箇所で計算するセクションオフセット、のみを正とする。各ビューは自セクション相対の小節番号を受け取るだけ。
- 歌詞のみセクションは再生タイミングにカウントしない（小節を持つのはグリッドのみ）。Detail ページでは静的テキストとして描画する。
- 表示行のレイアウト（1行あたりの小節数）は GridView 内の computed に閉じ、モデルへ逆変換しない。バー判定・セル表示文字は `lib/chordpro` の単一実装を全ビューが使用。`barEnd`（`|.`）と `barDouble`（`||`）の表示を区別する。
- `LyricsView` / `SongKaraokeView` / `useLyricsHighlight` / `useKaraokeScroll` を削除。
- ビジュアルエディタに歌詞ヒントの入力 UI を追加（小節を選択→コードとヒントを同じ場所で編集）。現状はテキストモードでしかヒントを作成できない。
- 命名を `lyricsHint`（モデル）/ `lyrics_hint`（ディレクティブ）の2つに統一し、`hint` / `lyrics` などの揺れを排除。

## エラーハンドリング

- パース不能な行は破棄せず保持する（テキストモードで直せるように）。新形式ヒント行の `|` 分割数が直下行の小節数と不一致の場合は、先頭から順に割り当て余剰は無視（例外にしない。手編集の途中状態を許容するため）。
- store アクションは不正インデックスに対して no-op（throw しない）。UI 側で到達し得ない操作は emit しない。

## テスト方針

- **Phase 1**: parse/generate のラウンドトリップ性テスト（ヒント位置含む）、レガシー形式の読み込みテスト、`/` トークン・バー種別のテーブルテスト。既存の parser.test.ts はヒューリスティック依存のケースをレガシーテストとして明示的に分離。
- **Phase 2**: store アクション単位のユニットテスト（既存 useGridMeasureEditor.test を移植）、モード切替・保存フローの結合テスト（編集→serialize→再parse で内容一致）。
- **Phase 3**: セクションオフセット計算のユニットテスト（歌詞のみセクション混在ケース）、ハイライトクラス付与のテスト。
- 各フェーズ完了時に `npm run lint` と `npm run test` を通す（コミット前必須）。

## 対象外（やらないこと）

- カラオケ/歌詞専用ビューの再実装（削除のみ。将来必要なら統一基盤上で新規設計）
- スタイル/デザインシステムの刷新
- 認証・S3 連携・Lambda まわりの変更
- 新形式への既存 S3 データ一括変換スクリプト（開けば読める・保存すれば移行される、で十分）
