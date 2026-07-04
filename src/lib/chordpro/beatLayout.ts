/**
 * 小節内のセルと拍の対応規則（docs/superpowers/specs/2026-07-04-beat-layout-design.md）
 * - 割り切れる場合は均等割り
 * - セル数 < 拍数で割り切れない場合は各1拍 + 余りを先頭セルへ
 * - セル数が拍数の倍数ならサブビートの均等割り
 * - それ以外は解釈不能（irregular）として均等割りフォールバック
 */
export interface MeasureBeatLayout {
	beats: number[]
	irregular: boolean
}

export function measureBeatLayout(cellCount: number, beatsPerMeasure: number): MeasureBeatLayout {
	if (cellCount <= 0 || beatsPerMeasure <= 0) {
		return { beats: [], irregular: false }
	}

	if (beatsPerMeasure % cellCount === 0) {
		return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: false }
	}

	if (cellCount < beatsPerMeasure) {
		const beats = Array(cellCount).fill(1)
		beats[0] = beatsPerMeasure - (cellCount - 1)
		return { beats, irregular: false }
	}

	if (cellCount % beatsPerMeasure === 0) {
		return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: false }
	}

	return { beats: Array(cellCount).fill(beatsPerMeasure / cellCount), irregular: true }
}
