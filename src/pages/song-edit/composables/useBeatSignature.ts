import { computed, type Ref } from 'vue'

export function useBeatSignature(timeSignature: Ref<string>) {
	const beatsPerMeasure = computed(() => {
		const parts = timeSignature.value.split('/')
		const parsed = Number.parseInt(parts[0] || '4', 10)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : 4
	})

	return {
		beatsPerMeasure
	}
}
