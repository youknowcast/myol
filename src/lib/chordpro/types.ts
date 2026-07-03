// ChordPro types

export interface SongMeta {
	id: string
	title: string
	artist: string
	key?: string
}

export interface Song extends SongMeta {
	capo?: number
	tempo?: number
	time?: string
	content: string
}

export interface ParsedSong {
	title: string
	artist: string
	key?: string
	capo?: number
	tempo?: number
	time?: string
	sections: Section[]
}

export interface Section {
	type: SectionType
	label?: string
	content: SectionContent
}

export type SectionType = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'tab' | 'grid' | 'generic'

export type SectionContent = LyricsSection | GridSection | TabSection

export interface LyricsSection {
	kind: 'lyrics'
	lines: LyricsLine[]
}

export interface LyricsLine {
	segments: LyricsSegment[]
}

export interface LyricsSegment {
	chord: string | null
	text: string
}

export interface GridSection {
	kind: 'grid'
	shape?: string
	measures: Measure[]
}

export interface Measure {
	cells: GridCell[]
	lyricsHint?: string
	startBar?: 'repeatStart'
	endBar?: 'repeatEnd' | 'barEnd'
}

export interface GridCell {
	type: 'chord' | 'noChord' | 'empty' | 'repeat'
	value?: string
}

export interface TabSection {
	kind: 'tab'
	lines: string[]
}
