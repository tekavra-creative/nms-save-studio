// Minimal reader for the MXML text that MBINCompiler writes. Our own code, not MBINCompiler's: the
// format is plain XML with one element type, e.g.
//
//   <Data template="cGcSubstanceTable">
//     <Property name="Table">
//       <Property name="Table" value="GcRealitySubstanceData" _id="FUEL1">
//         <Property name="Name" value="UI_FUEL_1_NAME" />
//         <Property name="Rarity" value="GcRarity"><Property name="Rarity" value="Common" /></Property>
//
// Supported: elements, double/single-quoted attributes, self-closing tags, comments, the XML
// declaration, and the five named entities plus numeric character references. Text content between
// tags is ignored (MXML keeps every value in attributes).

export class MxmlError extends Error {
  override name = 'MxmlError';
}

export interface MxmlNode {
  /** Element tag (`Data` or `Property`). */
  tag: string;
  /** The `name` attribute ('' when absent). */
  name: string;
  /** The `value` attribute, when present. */
  value?: string;
  /** The `_id` attribute (keyed array element), when present. */
  id?: string;
  children: MxmlNode[];
  attrs: Record<string, string>;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

const ATTR = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NAME_CHAR = /[\w:.-]/;

function makeNode(tag: string, attrText: string): MxmlNode {
  const attrs: Record<string, string> = {};
  ATTR.lastIndex = 0;
  for (let m = ATTR.exec(attrText); m; m = ATTR.exec(attrText)) attrs[m[1]!] = decodeEntities(m[2] ?? m[3] ?? '');
  const node: MxmlNode = { tag, name: attrs['name'] ?? '', children: [], attrs };
  if (attrs['value'] !== undefined) node.value = attrs['value'];
  if (attrs['_id'] !== undefined) node.id = attrs['_id'];
  return node;
}

/** Parse an MXML document; returns the root element (normally `<Data template="…">`). */
export function parseMxml(text: string): MxmlNode {
  const stack: MxmlNode[] = [];
  let root: MxmlNode | undefined;
  let i = text.indexOf('<');
  while (i >= 0 && i < text.length) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) throw new MxmlError(`unterminated comment at ${i}`);
      i = text.indexOf('<', end + 3);
      continue;
    }
    if (text.startsWith('<?', i) || text.startsWith('<!', i)) {
      const end = text.indexOf('>', i + 2);
      if (end < 0) throw new MxmlError(`unterminated declaration at ${i}`);
      i = text.indexOf('<', end + 1);
      continue;
    }
    // Find the closing '>' outside quotes.
    let j = i + 1;
    let quote = '';
    for (; j < text.length; j++) {
      const c = text[j]!;
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= text.length) throw new MxmlError(`unterminated tag at ${i}`);
    const inner = text.slice(i + 1, j);
    if (inner[0] === '/') {
      const tag = inner.slice(1).trim();
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new MxmlError(`mismatched </${tag}> at ${i}`);
    } else {
      const selfClosing = inner.endsWith('/');
      const body = selfClosing ? inner.slice(0, -1) : inner;
      let k = 0;
      while (k < body.length && NAME_CHAR.test(body[k]!)) k++;
      const tag = body.slice(0, k);
      if (!tag) throw new MxmlError(`bad tag at ${i}`);
      const node = makeNode(tag, body.slice(k));
      const parent = stack.at(-1);
      if (parent) parent.children.push(node);
      else if (root) throw new MxmlError(`second root element <${tag}> at ${i}`);
      else root = node;
      if (!selfClosing) stack.push(node);
    }
    i = text.indexOf('<', j + 1);
  }
  if (stack.length) throw new MxmlError(`unclosed <${stack.at(-1)!.tag}>`);
  if (!root) throw new MxmlError('no root element');
  return root;
}

// ---- Accessors ------------------------------------------------------------------------------

export function child(node: MxmlNode | undefined, name: string): MxmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function childrenNamed(node: MxmlNode | undefined, name: string): MxmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

/** The `value` of a direct child property ('' becomes undefined). */
export function prop(node: MxmlNode | undefined, name: string): string | undefined {
  const v = child(node, name)?.value;
  return v === undefined || v === '' ? undefined : v;
}

/**
 * A wrapped enum or struct-with-one-field: `<Property name="Rarity" value="GcRarity"><Property
 * name="Rarity" value="Common" /></Property>` → `Common`.
 */
export function enumProp(node: MxmlNode | undefined, name: string): string | undefined {
  const c = child(node, name);
  if (!c) return undefined;
  const inner = c.children.length === 1 ? c.children[0]!.value : c.value;
  return inner === undefined || inner === '' ? undefined : inner;
}

/** A texture/model resource's filename: `<Property name="Icon"><Property name="Filename" …/>`. */
export function resourceFile(node: MxmlNode | undefined, name: string): string | undefined {
  return prop(child(node, name), 'Filename');
}

export function numProp(node: MxmlNode | undefined, name: string): number | undefined {
  const v = prop(node, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function boolProp(node: MxmlNode | undefined, name: string): boolean | undefined {
  const v = prop(node, name);
  return v === 'true' ? true : v === 'false' ? false : undefined;
}

/** Rows of a `cGc…Table` document: `Data > Table > Table*`. */
export function tableRows(root: MxmlNode, list = 'Table'): MxmlNode[] {
  return child(root, list)?.children ?? [];
}
