import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { homedir } from 'node:os'
import { sanitize, resolveOutputDir, buildFileName } from './import-ufret.mjs'

describe('sanitize', () => {
  it('replaces filesystem-hostile characters with underscores', () => {
    expect(sanitize('a/b:c*d?"<>|e')).toBe('a_b_c_d_e')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitize('  name  ')).toBe('name')
  })
})

describe('resolveOutputDir', () => {
  it('prefers the explicit --out directory', () => {
    expect(resolveOutputDir({ out: '/tmp/x', env: { MYOL_SONGS_DIR: '/tmp/y' } })).toBe('/tmp/x')
  })

  it('uses MYOL_SONGS_DIR when set', () => {
    expect(resolveOutputDir({ out: null, env: { MYOL_SONGS_DIR: '/tmp/y' } })).toBe('/tmp/y')
  })

  it('falls back to ~/Music/myol', () => {
    expect(resolveOutputDir({ out: null, env: {} })).toBe(path.join(homedir(), 'Music', 'myol'))
  })
})

describe('buildFileName', () => {
  it('joins the sanitized artist and title', () => {
    expect(buildFileName({ artist: 'A/B', title: 'T:1' })).toBe('A_B_T_1.cho')
  })

  it('uses the provided name and appends .cho only when missing', () => {
    expect(buildFileName({ artist: 'A', title: 'T' }, 'my song')).toBe('my song.cho')
    expect(buildFileName({ artist: 'A', title: 'T' }, 'x.cho')).toBe('x.cho')
  })

  it('sanitizes a provided name so it cannot escape the output directory', () => {
    const result = buildFileName({ artist: 'A', title: 'T' }, '../../evil')
    expect(result).toBe('.._.._evil.cho')
    expect(result).not.toContain('/')
  })

  it('falls back to chordpro when artist and title are empty', () => {
    expect(buildFileName({ artist: '', title: '' })).toBe('chordpro.cho')
  })
})
