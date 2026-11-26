import { describe, expect, it } from "vitest";
import { toMarkdown, toRichText } from "../src/umami/richtext.js";

const roundTrip = (md: string) => toMarkdown(toRichText(md));

describe("rich text", () => {
  it("keeps paragraphs, headings and both kinds of list", () => {
    const md = "## Salsa\n\n200 g de tomate\n\n- ajo\n- pimentón\n\n1. Sofríe.\n2. Tritura.";
    expect(roundTrip(md)).toBe(md);
    const rich = toRichText(md);
    expect(rich.children?.map((b) => Object.keys(b)[0])).toEqual(["heading", "paragraph", "list", "list"]);
  });

  it("keeps bold, italic, underline and links", () => {
    const md = "**Ojo:** *no* lo dejes <u>hervir</u>, mira [la guía](<https://example.com/a>)";
    expect(roundTrip(md)).toBe(md);
    const para = toRichText(md).children![0] as any;
    expect(para.children[0]).toEqual({ text: { text: "Ojo:", bold: true } });
    expect(para.children.at(-1).link.url).toBe("https://example.com/a");
  });

  it("escapes text that looks like Markdown so it comes back unchanged", () => {
    const plain = { root: {}, children: [{ paragraph: {}, children: [{ text: { text: "2. no es lista * ni [enlace] _x_" } }] }] };
    const md = toMarkdown(plain);
    expect(toRichText(md)).toEqual(plain);
  });

  it("keeps line breaks inside a paragraph and handles empty text", () => {
    expect(roundTrip("línea 1\nlínea 2")).toBe("línea 1\nlínea 2");
    expect(toRichText("")).toEqual({ root: {} });
    expect(toMarkdown(undefined)).toBe("");
  });

  it("does not turn non-web links into links", () => {
    const rich = toRichText("[x](javascript:alert(1))") as any;
    expect(rich.children[0].children.every((n: any) => "text" in n)).toBe(true);
  });
});
