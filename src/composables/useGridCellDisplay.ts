import type { GridCell } from '@/lib/chordpro/types'

export function useGridCellDisplay() {
	function getCellDisplay(cell: GridCell): string {
		switch (cell.type) {
			case 'bar': return '│'
			case 'barDouble': return '║'
			case 'barEnd': return '║'
			case 'repeatStart': return '║:'
			case 'repeatEnd': return ':║'
			case 'repeatBoth': return ':║:'
			case 'noChord': return '/'
			case 'empty': return '·'
			case 'repeat': return cell.value || '%'
			case 'chord': return cell.value || ''
			default: return ''
		}
	}

	function getCellClass(cell: GridCell): string[] {
		switch (cell.type) {
			case 'chord':
				return ['grid-chord']
			case 'noChord':
			case 'empty':
				return ['grid-empty']
			case 'repeat':
				return ['grid-repeat']
			default:
				return ['grid-bar']
		}
	}

	return {
		getCellDisplay,
		getCellClass
	}
}
