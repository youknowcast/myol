import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useBeatSignature } from './useBeatSignature'

describe('useBeatSignature', () => {
	it('parses beats per measure from time signature', () => {
		const time = ref('3/4')
		const { beatsPerMeasure } = useBeatSignature(time)

		expect(beatsPerMeasure.value).toBe(3)
	})

	it('falls back to 4 for invalid values', () => {
		const time = ref('invalid')
		const { beatsPerMeasure } = useBeatSignature(time)

		expect(beatsPerMeasure.value).toBe(4)
	})
})
