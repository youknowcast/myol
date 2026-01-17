import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useChordProEditorStore } from '@/stores/chordproEditor'
import { useChordProEditorSync } from './useChordProEditorSync'

const sampleContent = `{title: Sample}

{start_of_grid}
|| C . . . | G . . . ||
{end_of_grid}
`

describe('useChordProEditorSync', () => {
	it('syncs content into editor store', async () => {
		setActivePinia(createPinia())
		const editorStore = useChordProEditorStore()
		const content = ref('')

		useChordProEditorSync({ content, editorStore })
		content.value = sampleContent
		await nextTick()

		expect(editorStore.document?.title).toBe('Sample')
	})

	it('syncs editor changes back to content', async () => {
		setActivePinia(createPinia())
		const editorStore = useChordProEditorStore()
		const content = ref(sampleContent)

		useChordProEditorSync({ content, editorStore })
		await nextTick()

		const firstGrid = editorStore.gridSections[0]
		expect(firstGrid).toBeTruthy()

		const updatedGrid = {
			...(firstGrid!.section.content as any),
			rows: [
				{ cells: [{ type: 'barDouble' }, { type: 'chord', value: 'Dm' }, { type: 'barDouble' }] }
			]
		}

		editorStore.updateSectionContent(firstGrid!.index, updatedGrid)
		await nextTick()

		expect(content.value.includes('Dm')).toBe(true)
	})
})
