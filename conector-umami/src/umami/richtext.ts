/**
 * Umami stores ingredients, directions and notes as a small rich-text tree:
 *
 *   { root: {}, children: Block[] }
 *   Block  = { paragraph: {}, children: Inline[] }
 *          | { heading: { level }, children: Inline[] }
 *          | { list: { type: 0 (bullets) | 1 (numbers) }, children: { paragraph, children }[] }
 *   Inline = { text: { text, bold?, italic?, underline? } }
 *          | { link: { url }, children: Inline[] }
 *
 * The MCP tools exchange this as a small subset of Markdown: paragraphs
 * (separated by a blank line), # headings, "- " and "1. " lists, **bold**,
 * *italic*, <u>underline</u> and [links](https://…).
 */
import { LIMITS } from "./config.js";
import { UmamiError } from "./errors.js";

interface Marks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}
type TextNode = { text: { text: string } & Marks };
type LinkNode = { link: { url: string }; children: Inline[] };
type Inline = TextNode | LinkNode;
type Para = { paragraph: Record<string, never>; children: Inline[] };
type Block =
  | Para
  | { heading: { level: number }; children: Inline[] }
  | { list: { type: 0 | 1 }; children: Para[] };
export interface RichText {
  root: Record<string, never>;
  children?: Block[];
}

// ---------------- Markdown -> rich text ----------------

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

export function toRichText(markdown: string | undefined): RichText {
  const source = (markdown ?? "").replace(/\r\n?/g, "\n");
  if (source.length > LIMITS.markdown) {
    throw new UmamiError(`Text is longer than ${LIMITS.markdown} characters`);
  }
  const blocks: Block[] = [];
  let paragraph: string[] | null = null;
  let list: { type: 0 | 1; items: string[] } | null = null;

  const flush = () => {
    if (paragraph) blocks.push({ paragraph: {}, children: parseInline(paragraph.join("\n")) });
    if (list) {
      blocks.push({
        list: { type: list.type },
        children: list.items.map((item) => ({ paragraph: {}, children: parseInline(item) })),
      });
    }
    paragraph = null;
    list = null;
  };

  for (const line of source.split("\n")) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (heading) {
      flush();
      blocks.push({ heading: { level: heading[1]!.length }, children: parseInline(heading[2]!) });
    } else if (bullet || numbered) {
      const type: 0 | 1 = bullet ? 0 : 1;
      const text = (bullet ?? numbered)![1]!;
      if (paragraph || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push(text);
    } else if (list && /^\s+\S/.test(line)) {
      // Indented line: continuation of the previous list item.
      list.items[list.items.length - 1] += "\n" + line.trim();
    } else {
      if (list) flush();
      (paragraph ??= []).push(line.trim());
    }
  }
  flush();
  return blocks.length ? { root: {}, children: blocks } : { root: {} };
}

/** Parses the inline Markdown subset into text and link nodes. */
export function parseInline(source: string, marks: Marks = {}): Inline[] {
  const out: Inline[] = [];
  const pushText = (text: string, m: Marks) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && "text" in last && sameMarks(last.text, m)) {
      last.text.text += text;
      return;
    }
    out.push({ text: { text, ...(m.bold ? { bold: true } : {}), ...(m.italic ? { italic: true } : {}), ...(m.underline ? { underline: true } : {}) } });
  };

  let i = 0;
  let plain = "";
  const emitPlain = () => {
    pushText(plain, marks);
    plain = "";
  };

  while (i < source.length) {
    const rest = source.slice(i);
    const ch = source[i]!;

    if (ch === "\\" && i + 1 < source.length && /[\\`*_[\]<>!~#+\-.()]/.test(source[i + 1]!)) {
      plain += source[i + 1];
      i += 2;
      continue;
    }

    const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strong) {
      emitPlain();
      for (const node of parseInline(strong[2]!, { ...marks, bold: true })) out.push(node);
      i += strong[0].length;
      continue;
    }

    const em = /^(\*|_)(?=\S)([\s\S]*?\S)\1(?!\1)/.exec(rest);
    if (em && !(ch === "_" && /\w/.test(source[i - 1] ?? ""))) {
      emitPlain();
      for (const node of parseInline(em[2]!, { ...marks, italic: true })) out.push(node);
      i += em[0].length;
      continue;
    }

    const under = /^<u>([\s\S]*?)<\/u>/i.exec(rest);
    if (under) {
      emitPlain();
      for (const node of parseInline(under[1]!, { ...marks, underline: true })) out.push(node);
      i += under[0].length;
      continue;
    }

    const link = /^\[([^\]]*)\]\(\s*<?([^)>\s]+)>?\s*\)/.exec(rest);
    if (link && isWebUrl(link[2]!)) {
      emitPlain();
      out.push({ link: { url: link[2]! }, children: parseInline(link[1]!, marks) });
      i += link[0].length;
      continue;
    }

    plain += ch;
    i += 1;
  }
  emitPlain();
  return mergeAdjacent(out);
}

function mergeAdjacent(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (last && "text" in last && "text" in node && sameMarks(last.text, node.text)) {
      last.text.text += node.text.text;
    } else out.push(node);
  }
  return out;
}

// ---------------- rich text -> Markdown ----------------

export function toMarkdown(value: unknown): string {
  if (!isObject(value) || !Array.isArray(value.children)) return "";
  return value.children
    .map(blockToMarkdown)
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function blockToMarkdown(block: unknown): string {
  if (!isObject(block)) return "";
  const children = Array.isArray(block.children) ? block.children : [];
  if (isObject(block.heading)) {
    const level = Math.min(Math.max(Number(block.heading.level) || 2, 1), 6);
    return "#".repeat(level) + " " + inlineToMarkdown(children);
  }
  if (isObject(block.list)) {
    const numbered = block.list.type === 1;
    return children
      .map((item, n) => {
        const text = isObject(item) && Array.isArray(item.children) ? inlineToMarkdown(item.children) : "";
        return (numbered ? `${n + 1}. ` : "- ") + text.replaceAll("\n", "\n   ");
      })
      .join("\n");
  }
  return inlineToMarkdown(children);
}

function inlineToMarkdown(nodes: unknown[]): string {
  let out = "";
  for (const node of nodes) {
    if (!isObject(node)) continue;
    if (isObject(node.text) && typeof node.text.text === "string") {
      out += wrap(escape(node.text.text), node.text as Marks);
    } else if (isObject(node.link) && typeof node.link.url === "string") {
      const label = inlineToMarkdown(Array.isArray(node.children) ? node.children : []);
      out += isWebUrl(node.link.url) ? `[${label}](<${node.link.url.replaceAll(">", "%3E")}>)` : label;
    } else if (Array.isArray(node.children)) {
      out += inlineToMarkdown(node.children);
    }
  }
  return out;
}

function wrap(text: string, marks: Marks): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  let core = m[2]!;
  if (!core) return text;
  if (marks.underline) core = `<u>${core}</u>`;
  if (marks.bold) core = `**${core}**`;
  if (marks.italic) core = `*${core}*`;
  return m[1] + core + m[3];
}

/** Escapes characters that would otherwise be read back as Markdown. */
function escape(text: string): string {
  return text
    .replace(/[\\`*_[\]<>]/g, (c) => "\\" + c)
    .replace(/^(\s{0,3})([#+-])/gm, "$1\\$2")
    .replace(/^(\s{0,3}\d+)([.)])(?=\s)/gm, "$1\\$2");
}

function sameMarks(a: Marks, b: Marks): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
