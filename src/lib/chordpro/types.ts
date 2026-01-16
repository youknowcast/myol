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
	parts?: GridPart[]  // パートグループ (Aメロ, Bメロ etc.)
	rows: GridRow[]     // parts がない場合のフォールバック
	lyricsHints?: string[]  // 各小節に対応する歌詞ヒント（表示用）- deprecated
	measures?: Measure[]  // 新形式: 小節ごとに歌詞を持つ
}

export interface GridPart {
	name: string       // "Aメロ", "Bメロ", "サビ" etc.
	rows: GridRow[]
}

export interface GridRow {
	cells: GridCell[]
}

// 新しい Measure インターフェース: 歌詞を直接関連付け
export interface Measure {
	cells: GridCell[]
	lyricsHint?: string  // この小節に対応する歌詞
}

export interface GridCell {
	type: 'chord' | 'empty' | 'repeat' | 'bar' | 'barDouble' | 'barEnd' | 'repeatStart' | 'repeatEnd' | 'repeatBoth'
	value?: string
}

export interface TabSection {
	kind: 'tab'
	lines: string[]
}
