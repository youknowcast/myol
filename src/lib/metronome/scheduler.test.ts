import { describe, it, expect } from 'vitest'
import { isAccent, upcomingBeats } from './scheduler'

describe('isAccent', () => {
	it('marks the first beat of each measure', () => {
		expect(isAccent(0, 4)).toBe(true)
		expect(isAccent(1, 4)).toBe(false)
		expect(isAccent(3, 4)).toBe(false)
		expect(isAccent(4, 4)).toBe(true)
		expect(isAccent(6, 3)).toBe(true)
	})

	it('returns false for invalid beatsPerMeasure', () => {
		expect(isAccent(0, 0)).toBe(false)
	})
})

describe('upcomingBeats', () => {
	const base = {
		windowSeconds: 0.1,
		secondsPerBeat: 0.5,
		beatsPerMeasure: 4,
		lastScheduledBeatIndex: null
	}

	it('includes a beat exactly at the current time', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0 })).toEqual([
			{ beatIndex: 0, songTime: 0, accent: true }
		])
	})

	it('excludes already scheduled beats', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0, lastScheduledBeatIndex: 0 })).toEqual([])
	})

	it('lists every beat inside the lookahead window', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0.45, windowSeconds: 0.6 })).toEqual([
			{ beatIndex: 1, songTime: 0.5, accent: false },
			{ beatIndex: 2, songTime: 1, accent: false }
		])
	})

	it('skips ahead after a forward seek', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 10, lastScheduledBeatIndex: 3 })).toEqual([
			{ beatIndex: 20, songTime: 10, accent: true }
		])
	})

	it('returns empty for non-positive secondsPerBeat', () => {
		expect(upcomingBeats({ ...base, songTimeNow: 0, secondsPerBeat: 0 })).toEqual([])
	})
})
