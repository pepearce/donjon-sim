export type Node =
  | { kind: 'lit'; text: string }
  | { kind: 'slot'; path: string; filters: Filter[] }
  | { kind: 'pool'; pool: string; tag: string | null; filters: Filter[] }
  | { kind: 'alt'; branches: Array<{ weight: number; nodes: Node[] }> }
  | { kind: 'opt'; p: number; nodes: Node[] };

export interface Filter {
  name: string;
  arg: string | null;
}

export interface ParseError {
  message: string;
  index: number;
}

export class TemplateSyntaxError extends Error {
  constructor(
    message: string,
    readonly index: number,
    readonly source: string,
  ) {
    super(`${message} at ${index} in "${source}"`);
    this.name = 'TemplateSyntaxError';
  }
}

function parseFilters(spec: string): { head: string; filters: Filter[] } {
  const parts = spec.split('|');
  const head = (parts.shift() ?? '').trim();
  const filters: Filter[] = parts.map((raw) => {
    const [name = '', arg] = raw.split(':');
    return { name: name.trim(), arg: arg === undefined ? null : arg.trim() };
  });
  return { head, filters };
}

export function parseTemplate(source: string): Node[] {
  let i = 0;

  function parseNodes(stopAt: string[]): Node[] {
    const nodes: Node[] = [];
    let literal = '';

    const flush = (): void => {
      if (literal.length > 0) {
        nodes.push({ kind: 'lit', text: literal });
        literal = '';
      }
    };

    while (i < source.length) {
      const ch = source[i] ?? '';
      if (stopAt.includes(ch)) break;

      if (ch === '\\' && i + 1 < source.length) {
        literal += source[i + 1];
        i += 2;
        continue;
      }

      if (ch === '{') {
        flush();
        const close = source.indexOf('}', i);
        if (close === -1) throw new TemplateSyntaxError('unclosed {', i, source);
        const body = source.slice(i + 1, close);
        i = close + 1;
        const { head, filters } = parseFilters(body);
        if (head.startsWith('@')) {
          const [pool = '', tag] = head.slice(1).split('#');
          nodes.push({ kind: 'pool', pool, tag: tag ?? null, filters });
        } else {
          nodes.push({ kind: 'slot', path: head, filters });
        }
        continue;
      }

      if (ch === '<') {
        flush();
        i += 1;
        const branches: Array<{ weight: number; nodes: Node[] }> = [];
        for (;;) {
          const branchNodes = parseNodes(['|', '>']);
          let weight = 1;
          let finalNodes = branchNodes;
          const first = branchNodes[0];
          if (first && first.kind === 'lit') {
            const m = /^(\d+):(.*)$/s.exec(first.text);
            if (m) {
              weight = Number(m[1]);
              finalNodes = [{ kind: 'lit', text: m[2] ?? '' }, ...branchNodes.slice(1)];
            }
          }
          branches.push({ weight, nodes: finalNodes });
          const here = source[i];
          if (here === '|') {
            i += 1;
            continue;
          }
          if (here === '>') {
            i += 1;
            break;
          }
          throw new TemplateSyntaxError('unclosed <', i, source);
        }
        nodes.push({ kind: 'alt', branches });
        continue;
      }

      if (ch === '[') {
        flush();
        i += 1;
        const inner = parseNodes([']']);
        if (source[i] !== ']') throw new TemplateSyntaxError('unclosed [', i, source);
        i += 1;
        let p = 0.5;
        if (source[i] === '?') {
          i += 1;
          const m = /^[0-9]*\.?[0-9]+/.exec(source.slice(i));
          if (m) {
            p = Number(m[0]);
            i += m[0].length;
          }
        }
        nodes.push({ kind: 'opt', p, nodes: inner });
        continue;
      }

      literal += ch;
      i += 1;
    }

    flush();
    return nodes;
  }

  const result = parseNodes([]);
  if (i < source.length) throw new TemplateSyntaxError('unexpected trailing input', i, source);
  return result;
}

export function countRandomNodes(nodes: Node[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === 'alt') {
      n += 1;
      for (const branch of node.branches) n += countRandomNodes(branch.nodes);
    } else if (node.kind === 'opt') {
      n += 1;
      n += countRandomNodes(node.nodes);
    } else if (node.kind === 'pool') {
      n += 1;
    }
  }
  return n;
}
