# ascii-align

Fix misaligned ASCII boxes and tables — perfect for AI-generated diagrams.

LLMs frequently produce ASCII diagrams with inconsistent widths, ragged borders, and misaligned columns. `ascii-align` detects and fixes these automatically.

## Features

- **ASCII boxes** (`+`, `-`, `|`)
- **Unicode box-drawing** (light `┌─┐`, heavy `┏━┓`, double `╔═╗`)
- **Markdown tables** (`| col | col |`)
- **Lateral (side-by-side) boxes** — fixed independently without merging
- **Wide character support** — CJK, emoji, ANSI codes handled correctly

## Install

```bash
npm install ascii-align
```

## CLI

```bash
# Fix a file in-place
ascii-align fix diagram.txt

# Fix from stdin
cat diagram.txt | ascii-align fix

# Output to stdout instead of overwriting
ascii-align fix diagram.txt --stdout

# Check alignment (exit code 1 if misaligned)
ascii-align check diagram.txt
```

## API

```typescript
import { fixAsciiAlign, checkAlignment, detectRegions } from 'ascii-align';

// Fix all misaligned structures in a string
const fixed = fixAsciiAlign(input);

// Check without fixing
const { aligned, issues } = checkAlignment(input);
if (!aligned) {
  console.log('Issues:', issues);
}

// Detect regions only
const regions = detectRegions(input);
// => [{ startLine: 0, endLine: 4, type: 'box', style: 'ascii' }, ...]
```

## Example

**Input** (misaligned):
```
+--------+
| hello |
| longer content |
+--+
```

**Output** (fixed):
```
+----------------+
| hello          |
| longer content |
+----------------+
```

Side-by-side boxes are detected and fixed independently:

```
+------+  +------+       +----------+  +----------+
| left |  | right   |  → | left     |  | right    |
+--+      +------+       +----------+  +----------+
```

## API Reference

### `fixAsciiAlign(text: string): string`
Fix all detected ASCII structures. Returns the corrected text.

### `checkAlignment(text: string): { aligned: boolean; issues: string[] }`
Check if any structures are misaligned. Returns issue descriptions.

### `detectRegions(text: string): Region[]`
Detect all ASCII box/table regions. Each region has `startLine`, `endLine`, `type`, `style`, and optional `startCol`/`endCol` for lateral boxes.

### `visualWidth(str: string): number`
Get the visual display width of a string (handles CJK, emoji, ANSI).

### `visualPadEnd(str: string, targetWidth: number, fillChar?: string): string`
Pad right to a target visual width.

### `visualPadStart(str: string, targetWidth: number, fillChar?: string): string`
Pad left to a target visual width.

## License

[MIT](LICENSE)
