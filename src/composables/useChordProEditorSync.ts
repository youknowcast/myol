import { watch, type Ref } from 'vue'
import type { ParsedSong, GridSection } from '@/lib/chordpro/types'

export interface ChordProEditorStoreLike {
	document: ParsedSong | null
	loadDocument: (content: string) => void
	serialize: () => string
	updateSectionContent: (index: number, content: GridSection) => void
}

export interface UseChordProEditorSyncOptions {
	content: Ref<string>
	editorStore: ChordProEditorStoreLike
}

export function useChordProEditorSync(options: UseChordProEditorSyncOptions) {
	let isSyncingFromStore = false
	let isSyncingToStore = false

	if (options.content.value) {
		isSyncingToStore = true
		options.editorStore.loadDocument(options.content.value)
		isSyncingToStore = false
	}

	watch(options.content, (newContent) => {
		if (isSyncingFromStore) return
		if (newContent === options.editorStore.serialize()) return
		isSyncingToStore = true
		options.editorStore.loadDocument(newContent)
		isSyncingToStore = false
	})

	watch(() => options.editorStore.document, () => {
		if (isSyncingToStore) return
		if (options.editorStore.document) {
			const serialized = options.editorStore.serialize()
			if (serialized !== options.content.value) {
				isSyncingFromStore = true
				options.content.value = serialized
				isSyncingFromStore = false
			}
		}
	}, { deep: true })
}
