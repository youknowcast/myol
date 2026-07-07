/**
 * メトロノームの拍スケジューリング規則（docs/superpowers/specs/2026-07-07-metronome-design.md）
 * - 先読み窓内の未予約の拍を列挙する
 * - 巻き戻り（ループ・後方 seek）時の lastScheduledBeatIndex リセットは呼び出し側の責務
 */
export interface ScheduledBeat {
	beatIndex: number
	songTime: number
	accent: boolean
}

export interface UpcomingBeatsOptions {
	songTimeNow: number
	windowSeconds: number
	secondsPerBeat: number
	beatsPerMeasure: number
	lastScheduledBeatIndex: number | null
	maxSongTime?: number
}

const EPSILON = 1e-9

export function isAccent(beatIndex: number, beatsPerMeasure: number): boolean {
	if (beatsPerMeasure <= 0) return false
	return beatIndex % beatsPerMeasure === 0
}

export function upcomingBeats(options: UpcomingBeatsOptions): ScheduledBeat[] {
	const { songTimeNow, windowSeconds, secondsPerBeat, beatsPerMeasure, lastScheduledBeatIndex, maxSongTime } = options
	if (secondsPerBeat <= 0 || windowSeconds <= 0) return []

	const firstFromTime = Math.ceil(songTimeNow / secondsPerBeat - EPSILON)
	const firstAfterScheduled = lastScheduledBeatIndex === null ? 0 : lastScheduledBeatIndex + 1
	const firstIndex = Math.max(firstFromTime, firstAfterScheduled, 0)
	const windowEnd = maxSongTime === undefined
		? songTimeNow + windowSeconds
		: Math.min(songTimeNow + windowSeconds, maxSongTime)

	const beats: ScheduledBeat[] = []
	for (let index = firstIndex; index * secondsPerBeat < windowEnd - EPSILON; index++) {
		beats.push({
			beatIndex: index,
			songTime: index * secondsPerBeat,
			accent: isAccent(index, beatsPerMeasure)
		})
	}
	return beats
}
