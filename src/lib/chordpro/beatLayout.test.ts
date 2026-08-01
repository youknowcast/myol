import { describe, it, expect } from 'vitest'
import { measureBeatLayout } from './beatLayout'

describe('measureBeatLayout', () => {
	it('splits evenly when the beat count is divisible by the cell count', () => {
		expect(measureBeatLayout(1, 4)).toEqual({ beats: [4], irregular: false })
		expect(measureBeatLayout(2, 4)).toEqual({ beats: [2, 2], irregular: false })
		expect(measureBeatLayout(4, 4)).toEqual({ beats: [1, 1, 1, 1], irregular: false })
		expect(measureBeatLayout(3, 3)).toEqual({ beats: [1, 1, 1], irregular: false })
	})

	it('front-loads the remainder when fewer cells than beats do not divide', () => {
		expect(measureBeatLayout(3, 4)).toEqual({ beats: [2, 1, 1], irregular: false })
		expect(measureBeatLayout(2, 3)).toEqual({ beats: [2, 1], irregular: false })
	})

	it('splits into sub-beats when the cell count is a multiple of the beats', () => {
		expect(measureBeatLayout(8, 4)).toEqual({
			beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
			irregular: false
		})
	})

	it('falls back to an even split and flags irregular otherwise', () => {
		const result = measureBeatLayout(5, 4)
		expect(result.irregular).toBe(true)
		expect(result.beats.length).toBe(5)
		expect(result.beats.reduce((a, b) => a + b, 0)).toBeCloseTo(4)
	})

	it('handles empty and invalid inputs without throwing', () => {
		expect(measureBeatLayout(0, 4)).toEqual({ beats: [], irregular: false })
		expect(measureBeatLayout(2, 0)).toEqual({ beats: [], irregular: false })
	})
})
