import { describe, expect, it } from "vitest";
import { toMarkdown, toRichText } from "../src/umami/richtext.js";

const roundTrip = (md: string) => toMarkdown(toRichText(md));

describe("rich text", () => {
  it("keeps paragraphs, headings and both kinds of list", () => {
    const md = "## Sauce\n\n200 g tomato\n\n- garlic\n- pimentón\n\n1. Fry gently.\n2. Blend.";
    expect(roundTrip(md)).toBe(md);
    const rich = toRichText(md);
    expect(rich.children?.map((b) => Object.keys(b)[0])).toEqual(["heading", "paragraph", "list", "list"]);
  });

  it("keeps bold, italic, underline and links", () => {
    const md = "**Careful:** *don't* let it <u>boil</u>, see [the guide](<https://example.com/a>)";
    expect(roundTrip(md)).toBe(md);
    const para = toRichText(md).children![0] as any;
    expect(para.children[0]).toEqual({ text: { text: "Careful:", bold: true } });
    expect(para.children.at(-1).link.url).toBe("https://example.com/a");
  });

  it("escapes text that looks like Markdown so it comes back unchanged", () => {
    const plain = { root: {}, children: [{ paragraph: {}, children: [{ text: { text: "2. not a list * nor [a link] _x_" } }] }] };
    const md = toMarkdown(plain);
    expect(toRichText(md)).toEqual(plain);
  });

  it("keeps line breaks inside a paragraph and handles empty text", () => {
    expect(roundTrip("crème line 1\nbrûlée line 2")).toBe("crème line 1\nbrûlée line 2");
    expect(toRichText("")).toEqual({ root: {} });
    expect(toMarkdown(undefined)).toBe("");
  });

  it("does not turn non-web links into links", () => {
    const rich = toRichText("[x](javascript:alert(1))") as any;
    expect(rich.children[0].children.every((n: any) => "text" in n)).toBe(true);
  });
});
