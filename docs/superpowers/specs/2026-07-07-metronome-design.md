# メトロノーム機能 設計

日付: 2026-07-07
ステータス: 承認済み

## 目的

再生（play）中に拍へ合わせてクリック音を鳴らし、テンポを耳で追えるようにする。

## 要件

- 再生中、拍ごとにクリック音を鳴らす。
- 小節の 1 拍目はアクセント（高い音）、それ以外は低い音。
- プレーヤーバーのトグルボタンで ON/OFF を切り替える。初期状態は OFF。
- 再生速度（speedMultiplier）の変更にクリック間隔が追従する。
- seek・曲末ループ・一時停止に正しく追従する（二重鳴り・鳴り漏れをしない）。
- 音量は固定。音源ファイルは使わず Web Audio API で合成する。

## 方式

**Web Audio 先読みスケジューラ**を採用する。

`usePlaybackState` の setInterval（~16ms）で拍境界を検出する案は、メインスレッドの負荷でジッターが出るため不採用。`AudioContext` の高精度クロックに対して拍を約 100ms 先読みして予約する定石構成とする。

### 時刻換算

毎スケジューラループ（25ms 間隔）で `currentTime.value`（曲時刻）を読み直し、

```
audioTime = ctx.currentTime + (beatSongTime - songTimeNow) / speedMultiplier
```

で予約時刻へ換算する。アンカーを保持せず毎回換算し直すため、seek・ループ・速度変更に自動追従する。予約済みの拍番号を記録して二重予約を防ぎ、拍番号が巻き戻った（ループ・後方 seek）場合は記録をリセットする。

## 構成

### 1. `src/lib/chordpro` と同様の純粋ロジック層: `src/lib/metronome/scheduler.ts`

- 現在の曲時刻・先読み窓・拍間隔から、予約すべき拍（拍番号と曲時刻）を列挙する純関数。
- 拍番号からのアクセント判定: `beatIndex % beatsPerMeasure === 0`。
- Vitest でユニットテストする（拍列挙・アクセント判定・ループ跨ぎ・seek 後の再列挙）。

### 2. Web Audio 層: `src/pages/song-detail/composables/useMetronome.ts`

- `enabled`（トグル状態）と `usePlaybackState` の `isPlaying` / `currentTime` / `tempo` / `beatsPerMeasure` / `speedMultiplier` を受け取る。
- ON かつ再生中のみ 25ms 間隔のスケジューラループを回す。
- クリック音: oscillator + gain エンベロープ（約 30ms で減衰）。アクセント拍は高い周波数、通常拍は低い周波数。音量は固定ゲイン。
- `AudioContext` はトグル ON のユーザー操作時に生成・resume する（ブラウザの自動再生制限対策）。
- 一時停止・OFF 時は予約済みノードを停止しループを止める。dispose で `AudioContext` を close する。

### 3. UI

- プレーヤーバーにメトロノームのトグルボタンを追加（アイコンボタン、ON 状態を視覚表示）。
- `SongDetailPage` で `useMetronome` を `usePlaybackState` と結線する。

## エッジケース

| ケース | 挙動 |
| --- | --- |
| ブラウザの自動再生制限 | AudioContext をトグル ON のユーザー操作時に生成・resume |
| 曲末ループで currentTime が 0 に巻き戻る | 予約済み拍番号をリセットして再スケジュール |
| seek（前方・後方） | 同上。予約済みで未再生のクリックは 100ms 以内のため許容 |
| 再生速度変更 | 次ループから新しい換算で予約 |
| 一時停止 / トグル OFF | 予約済みノードを停止、スケジューラ停止 |

## スコープ外

- 小節ごとに拍数が変わるケース（「小節長=拍数」対応）。現行の再生モデル（曲全体で拍子一定）に合わせる。再生側が対応した時点で、メトロノームは同じ拍情報を参照する形で追従できる。
- 音量スライダー（固定音量とする）。
- カウントイン（再生前の予備拍）。

## テスト方針

- `scheduler.ts` の純関数を Vitest でユニットテスト。
- AudioContext 依存部分は薄く保ち、実機（Chrome CDP 駆動の検証環境）で耳と挙動を確認する。
