import { createMcpHandler } from "agents/mcp/server";
import { beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/tools.js";
import { UMAMI } from "../src/umami/config.js";
import { Umami } from "../src/umami/index.js";
import { toWire } from "../src/umami/store.js";
import { FakeUmami, UID } from "./fake-umami.js";

/** Talks to the real MCP HTTP handler, as Claude would. */
let call: (method: string, params?: unknown) => Promise<any>;

beforeAll(() => {
  const fake = new FakeUmami();
  fake.put(UMAMI.collections.book, "book1", { id: toWire("book1"), name: toWire("Recetas"), owner: toWire({ id: UID }) });
  const handler = createMcpHandler(() => buildServer(new Umami(fake.session(), fake.fetch)), { route: "/mcp" });
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  let id = 0;
  call = async (method, params) => {
    const response = await handler(
      new Request("https://w.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      }),
      {},
      ctx,
    );
    const text = await response.text();
    const json = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5);
    return JSON.parse(json);
  };
});

describe("MCP tools over HTTP", () => {
  it("offers the recipe, meal plan and grocery tools", async () => {
    await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    const { result } = await call("tools/list");
    expect(result.tools.map((t: any) => t.name).sort()).toEqual(
      [
        "add_grocery_items",
        "add_meal_plan_item",
        "add_recipe_photo",
        "create_recipe",
        "edit_recipe",
        "find_recipes",
        "get_grocery_list",
        "get_meal_plan_items",
        "get_recipe",
        "list_grocery_lists",
        "list_meal_plans",
        "list_recipe_books",
        "list_recipe_tags",
        "remove_grocery_items",
        "remove_meal_plan_item",
        "update_grocery_items",
        "update_meal_plan_item",
      ].sort(),
    );
    const create = result.tools.find((t: any) => t.name === "create_recipe");
    expect(create.inputSchema.required).toEqual(["name"]);
  });

  it("runs a tool and returns structured content", async () => {
    const { result } = await call("tools/call", { name: "create_recipe", arguments: { name: "Flan", tags: ["Postres"] } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ name: "Flan", recipeBookName: "Recetas", tags: ["Postres"] });
  });

  it("returns Umami errors as tool errors, not crashes", async () => {
    const { result } = await call("tools/call", { name: "add_meal_plan_item", arguments: { recipeId: "x", date: "2026-11-30", meal: "DINNER" } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No meal plans found/);
  });
});
