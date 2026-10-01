/**
 * A minimal RFC 4180 CSV parser: quoted fields, `""` escapes, commas and
 * CR/LF newlines inside quotes, an optional UTF-8 BOM, a trailing newline.
 *
 * No dependency added (CLAUDE.md "never add a dependency") - the grammar is
 * small enough that a hand-rolled state machine is both the least code and the
 * only thing that gets the quoted-newline case right; every regex-based
 * splitter gets that case wrong by construction.
 *
 * Returns `string[][]` - rows of raw cell strings, never trimmed and never
 * type-converted. Callers (here, `google-form-csv.ts`) own their own column
 * semantics.
 */
export function parseCsv(input: string): string[][] {
  // The BOM is a single leading U+FEFF once Node has decoded UTF-8 bytes to a
  // string - stripped here so the first header cell is never
  // `"<BOM>Timestamp"`.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAnyField = false;

  const endField = () => {
    row.push(field);
    field = '';
    sawAnyField = true;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAnyField = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      endField();
      continue;
    }
    if (ch === '\r') {
      // Swallow a lone CR or a CRLF pair the same way; the LF branch below
      // handles a bare LF.
      if (text[i + 1] === '\n') i++;
      endRow();
      continue;
    }
    if (ch === '\n') {
      endRow();
      continue;
    }
    field += ch;
  }

  // A trailing newline leaves nothing to flush; anything else (including a
  // file with no trailing newline at all) still holds the last field/row.
  if (field !== '' || sawAnyField) {
    endRow();
  }

  return rows;
}
