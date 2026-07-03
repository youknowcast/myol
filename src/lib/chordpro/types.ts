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
	measures: Measure[]  // 新形式: 小節ごとに歌詞を持つ
}

export interface GridRow {
	cells: GridCell[]
}

// Measure: 小節。歌詞・境界バーを直接保持する（唯一の構造単位）
export interface Measure {
	cells: GridCell[]
	lyricsHint?: string  // この小節に対応する歌詞
	startBar?: 'repeatStart'
	endBar?: 'repeatEnd' | 'barEnd'
}

export interface GridCell {
	type: 'chord' | 'noChord' | 'empty' | 'repeat' | 'bar' | 'barDouble' | 'barEnd' | 'repeatStart' | 'repeatEnd' | 'repeatBoth'
	value?: string
}

export interface TabSection {
	kind: 'tab'
	lines: string[]
}
