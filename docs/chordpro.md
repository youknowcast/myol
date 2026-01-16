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

### Symbols
- `.` : Empty beat/spacer
- `%` : Repeat previous measure
- `/` : No chord (rhythmic hit)

## Lyrics Hints

To associate lyrics with grid measures without breaking the grid structure, we use the `{lyrics_hint}` directive.

```chordpro
{start_of_grid}
{lyrics_hint: Amazing grace, how sweet the sound}
| G . . . | C . G . |
{lyrics_hint: That saved a wretch like me}
| G . . . | D . . . |
{end_of_grid}
```

- Each `{lyrics_hint}` applies to the **entire row** of the grid following it.
- In the Grid View, these hints are displayed directly underneath the chord line.
- Playback highlighting tracks both the chord and the corresponding hint.

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
