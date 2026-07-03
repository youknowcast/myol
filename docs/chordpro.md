# Extended ChordPro Format

This project uses an extended version of the ChordPro format to support visual grid editing and automatic measure assignment.

## Basic Directives

Standard ChordPro directives are supported:

- `{title: Song Title}`
- `{artist: Artist Name}`
- `{tempo: 120}` (BPM)
- `{time: 4/4}` (Time Signature)
- `{key: C}` (Musical Key)

## Grid Notation

We use a custom grid notation to represent chord measures visually.

### Grid Block
Grids must be enclosed in start/end directives:
```chordpro
{start_of_grid}
| C . . . | G . . . | Am . . . | F . . . |
{end_of_grid}
```

### Bar Lines
Supported bar types:
- `|` : Single bar
- `||` : Double bar
- `|:` : Repeat start
- `:|` : Repeat end
- `:|:` : Repeat both
- `|.` : End bar

Repeat/end bars are preserved per measure across save (`Measure.startBar` /
`Measure.endBar` internally); plain `|` and `||` are layout-normalized to
4 measures per line when saving.

### Symbols
- `.` : Empty beat/spacer
- `%` : Repeat previous measure
- `/` : No chord (rhythmic hit) — parsed as a dedicated no-chord cell

## Lyrics Hints

To associate lyrics with grid measures, place a `{lyrics_hint}` directive
directly above a grid row. The hint text is split by `|`, and each segment
maps 1:1 to the measures of that row, in order.

```chordpro
{start_of_grid}
{lyrics_hint: Amazing grace how | sweet the sound}
| G . . . | C . G . |
{lyrics_hint: That saved a | wretch like me}
| G . . . | D . . . |
{end_of_grid}
```

- Each segment attaches to the measure at the same position (**per measure**,
  not per row).
- An empty segment means "no hint for this measure"
  (`{lyrics_hint: | sweet}` leaves the first measure without a hint).
- Segments beyond the number of measures in the row are ignored.
- `|` cannot be used inside hint text; when saving, the app replaces it with
  the full-width `｜`.
- Measure annotations generalize this mechanism: future directives
  (e.g. strumming patterns) follow the same "annotation line above the row,
  `|`-separated per measure" form.

### Legacy format (read-only)

Files saved by older versions carry `{lyrics_hint}` directives as a trailing
block after the grid rows, or one hint line per row without `|`. These are
still read (hints are matched by count: per-measure when counts match, else
per-row onto each row's first measure), but the app always saves in the new
format above.

## Sections and Labels

Standard section directives are supported:
- `{start_of_verse}` / `{end_of_verse}`
- `{start_of_chorus}` / `{end_of_chorus}`
- `{start_of_bridge}` / `{end_of_bridge}`

Labels can be added:
```chordpro
{start_of_verse: Intro}
...
{end_of_verse}
```

## Automatic Measure Assignment

When a song contains only lyrics, the editor's "Auto Assign Measures" feature converts it to the Extended Grid format:
1. Each line of lyrics is extracted as a `{lyrics_hint}`.
2. A corresponding grid row with a default number of measures (based on tempo) is generated.
3. The original lyrics section is replaced by the new grid section.
