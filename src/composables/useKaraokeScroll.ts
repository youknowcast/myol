import { computed, type ComputedRef, type Ref } from 'vue'
import type { KaraokeRow } from './useChordProDocument'

export interface UseKaraokeScrollOptions {
	rows: ComputedRef<KaraokeRow[]>
	currentMeasure: Ref<number>
	isPlaying: Ref<boolean>
	rowHeight?: number
	containerHeight?: number
}

export function useKaraokeScroll(options: UseKaraokeScrollOptions) {
	const rowHeight = options.rowHeight ?? 72
	const containerHeight = options.containerHeight ?? 450

	const activeRowIndex = computed(() => {
		const rows = options.rows.value
		const idx = rows.findIndex(row =>
			options.currentMeasure.value >= row.startMeasure &&
			options.currentMeasure.value <= row.endMeasure
		)
		return idx !== -1 ? idx : 0
	})

	const contentTransform = computed(() => {
		if (!options.isPlaying.value) return 'translateY(0)'

		const centerOffset = containerHeight * 0.35
		const translateY = -(activeRowIndex.value * rowHeight) + centerOffset

		return `translateY(${translateY}px)`
	})

	return {
		activeRowIndex,
		contentTransform
	}
}
