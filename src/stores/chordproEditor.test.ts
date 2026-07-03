import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChordProEditorStore } from './chordproEditor'
import type { GridSection } from '@/lib/chordpro/types'

const CONTENT = `{title: Test}
{artist: A}
{time: 4/4}

{start_of_grid label="One"}
{lyrics_hint: la | li}
|: G . | C . :|
{end_of_grid}

{start_of_grid label="Two"}
|| Am . | F . ||
{end_of_grid}
`

function grid(store: ReturnType<typeof useChordProEditorStore>, sectionIndex: number): GridSection {
	return store.document!.sections[sectionIndex]!.content as GridSection
}

describe('chordproEditor store', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('loads and serializes a document', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		expect(store.gridSections.length).toBe(2)
		const out = store.serialize()
		expect(out).toContain('{lyrics_hint: la | li}')
		expect(out).toContain('|: G . | C . :|')
	})

	it('updates metadata directly on the document', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.updateMetadata({ title: 'New', artist: 'B', key: 'G', capo: 2, tempo: 100, time: '3/4' })
		const out = store.serialize()
		expect(out).toContain('{title: New}')
		expect(out).toContain('{key: G}')
		expect(out).toContain('{capo: 2}')
		expect(out).toContain('{tempo: 100}')
		expect(out).toContain('{time: 3/4}')
	})

	it('adds/deletes/swaps measures preserving bars', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.addMeasure(0, 'after', 0)
		expect(grid(store, 0).measures.length).toBe(3)
		expect(grid(store, 0).measures[0]!.startBar).toBe('repeatStart')
		expect(grid(store, 0).measures[2]!.endBar).toBe('repeatEnd')
		store.deleteMeasure(0, 1)
		expect(grid(store, 0).measures.length).toBe(2)
		store.swapMeasure(0, 0, 'right')
		expect(grid(store, 0).measures[1]!.startBar).toBe('repeatStart')
	})

	it('is a no-op on invalid indices and non-grid sections', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		const before = JSON.parse(JSON.stringify(store.document))
		store.addMeasure(99, 'end', null)
		store.deleteMeasure(0, 99)
		store.moveCell({ fromSectionIndex: 0, toSectionIndex: 99, fromMeasureIndex: 0, toMeasureIndex: 0, sourceCellIndex: 0, newIndex: 0 })
		expect(JSON.parse(JSON.stringify(store.document))).toEqual(before)
	})

	it('moves a cell across sections in one action', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.moveCell({
			fromSectionIndex: 0,
			toSectionIndex: 1,
			fromMeasureIndex: 0,
			toMeasureIndex: 0,
			sourceCellIndex: 0,
			newIndex: 1
		})
		expect(grid(store, 0).measures[0]!.cells.map(c => c.type)).toEqual(['empty'])
		expect(grid(store, 1).measures[0]!.cells.map(c => c.value)).toEqual(['Am', 'G'])
	})

	it('moves a measure to the next section head, preserving bars', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.moveMeasureAcrossSections(0, 1, 0)
		expect(grid(store, 0).measures.length).toBe(1)
		expect(grid(store, 1).measures.length).toBe(3)
		expect(grid(store, 1).measures[0]!.startBar).toBe('repeatStart')
		expect(grid(store, 1).measures[0]!.lyricsHint).toBe('la')
	})

	it('auto-assigns chord-only lyrics lines into grids', () => {
		const store = useChordProEditorStore()
		store.loadDocument(`{start_of_verse}
[C]hello [G]world
{end_of_verse}
`)
		store.autoAssign(4)
		expect(store.gridSections.length).toBeGreaterThan(0)
	})

	it('sets a lyrics hint on a measure and serializes it', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.setLyricsHint(1, 0, 'inserted words')
		expect(grid(store, 1).measures[0]!.lyricsHint).toBe('inserted words')
		expect(store.serialize()).toContain('{lyrics_hint: inserted words')
	})

	it('round-trips document through serialize/loadDocument without change (mode-switch contract)', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		store.addMeasure(0, 'end', null)
		store.mergeLyrics(0, 1, 'left')
		const text = store.serialize()
		const before = JSON.parse(JSON.stringify(store.document))
		store.loadDocument(text)
		expect(JSON.parse(JSON.stringify(store.document))).toEqual(before)
		expect(store.serialize()).toBe(text)
	})

	it('applies metadata at save time without disturbing grid content (save contract)', () => {
		const store = useChordProEditorStore()
		store.loadDocument(CONTENT)
		const gridBefore = JSON.parse(JSON.stringify(grid(store, 0)))
		store.updateMetadata({ title: 'Saved', artist: 'X', key: 'D', capo: 1, tempo: 88, time: '4/4' })
		const reparsed = useChordProEditorStore()
		reparsed.loadDocument(store.serialize())
		expect(reparsed.document!.title).toBe('Saved')
		expect(JSON.parse(JSON.stringify(grid(reparsed, 0)))).toEqual(gridBefore)
	})
})
