import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UMAMI } from "../src/umami/config.js";
import { Umami } from "../src/umami/index.js";
import { pathSegment, toWire, toWireLike } from "../src/umami/store.js";
import { FakeUmami, UID } from "./fake-umami.js";

const { book: BOOKS, recipe: RECIPES, plan: PLANS } = UMAMI.collections;
let fake: FakeUmami;
let umami: Umami;

beforeEach(() => {
  fake = new FakeUmami();
  umami = new Umami(fake.session(), fake.fetch);
  fake.put(BOOKS, "book1", {
    id: toWire("book1"),
    name: toWire("Recetas ChatiChef"),
    owner: toWire({ id: UID }),
    recipes: toWire({}),
    recipeTags: toWire({}),
    updated: toWire(new Date("2026-01-01")),
  });
  fake.put(BOOKS, "other", { id: toWire("other"), name: toWire("Not mine"), owner: toWire({ id: "someone" }) });
  fake.put(BOOKS, "shared", {
    id: toWire("shared"),
    name: toWire("Shared with me"),
    owner: toWire({ id: "friend" }),
    joined: toWire({ [UID]: { id: UID } }),
  });
});

describe("recipe books", () => {
  it("lists owned and shared books, not other people's", async () => {
    const names = (await umami.recipes.listBooks()).map((b) => b.name).sort();
    expect(names).toEqual(["Recetas ChatiChef", "Shared with me"]);
  });
});

describe("recipes", () => {
  it("creates a recipe and updates the book's recipe list and tag counts", async () => {
    const recipe = await umami.recipes.create({
      recipeBookId: "book1",
      name: "Pollo al ajillo",
      ingredients: "400 g de contramuslo\n\n1 cabeza de ajo",
      directions: "1. Dora el pollo.\n2. Añade el ajo.",
      tags: ["Cena", "ChatiChef"],
      nutritionInformation: { Calorías: "~415 kcal" },
    });
    expect(recipe.ingredients).toBe("400 g de contramuslo\n\n1 cabeza de ajo");
    expect(recipe.directions).toBe("1. Dora el pollo.\n2. Añade el ajo.");
    expect(fake.field(BOOKS, "book1", `recipes.${recipe.id}`)).toEqual({ booleanValue: true });
    expect(fake.field(BOOKS, "book1", "recipeTags.Cena")).toEqual({ integerValue: "1" });
    expect(fake.commits[0]![0].currentDocument).toEqual({ exists: false });

    const again = await umami.recipes.get(recipe.id);
    expect(again.tags.sort()).toEqual(["Cena", "ChatiChef"]);
    expect(again.nutritionInformation).toEqual({ Calorías: "~415 kcal" });
  });

  it("edits only the given fields and moves tag counts", async () => {
    const { id } = await umami.recipes.create({ recipeBookId: "book1", name: "Lentejas", notes: "Nota", tags: ["Semana 16 nov 2026", "Cena"] });
    const edited = await umami.recipes.edit(id, { tags: ["Semana 23 nov 2026", "Cena"], totalTime: "45 min" });
    expect(edited.notes).toBe("Nota");
    expect(edited.totalTime).toBe("45 min");
    expect(fake.field(BOOKS, "book1", "recipeTags.Semana 16 nov 2026")).toBeUndefined();
    expect(fake.field(BOOKS, "book1", "recipeTags.Semana 23 nov 2026")).toEqual({ integerValue: "1" });
    expect(fake.field(BOOKS, "book1", "recipeTags.Cena")).toEqual({ integerValue: "1" });
  });

  it("finds by tags and text without asking Firestore to filter tags", async () => {
    await umami.recipes.create({ recipeBookId: "book1", name: "Tortilla de patatas", tags: ["Cena"] });
    await umami.recipes.create({ recipeBookId: "book1", name: "Macarrones", tags: ["Comida"] });
    expect((await umami.recipes.find({ tags: ["Cena"] })).map((r) => r.name)).toEqual(["Tortilla de patatas"]);
    expect((await umami.recipes.find({ query: "MACARR" })).map((r) => r.name)).toEqual(["Macarrones"]);
  });

  it("rejects recipes in books the account cannot reach, and bad input", async () => {
    await expect(umami.recipes.create({ recipeBookId: "other", name: "X" })).rejects.toThrow(/not owned by or shared/);
    await expect(umami.recipes.create({ recipeBookId: "book1", name: "x".repeat(61) })).rejects.toThrow(/1 to 60/);
    await expect(umami.recipes.create({ recipeBookId: "book1", name: "X", tags: ["a.b"] })).rejects.toThrow(/not valid/);
  });

  it("refuses to overwrite a change made meanwhile", async () => {
    const { id } = await umami.recipes.create({ recipeBookId: "book1", name: "Pizza" });
    const original = fake.fetch;
    let first = true;
    fake.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (first && String(input).endsWith(":commit")) {
        first = false;
        fake.put(RECIPES, id, { id: toWire(id), recipeBookId: toWire("book1"), name: toWire("Changed in the app") });
      }
      return original(input, init);
    }) as typeof fetch;
    const racing = new Umami(fake.session(), fake.fetch);
    await expect(racing.recipes.edit(id, { name: "Pizza 2" })).rejects.toThrow(/changed in Umami/);
  });
});

describe("meal plans", () => {
  let recipeId: string;
  beforeEach(async () => {
    recipeId = (await umami.recipes.create({ recipeBookId: "book1", name: "Merluza a la bilbaína" })).id;
    // An entry written by the app: note `added` stored as epoch milliseconds.
    fake.put(PLANS, "plan1", {
      id: toWire("plan1"),
      name: toWire("Comidas y Cenas"),
      members: toWire({ [UID]: { id: UID, displayName: "Me" } }),
      items: {
        mapValue: {
          fields: {
            appItem: {
              mapValue: {
                fields: {
                  id: toWire("appItem"),
                  recipeId: toWire(recipeId),
                  name: toWire("Merluza a la bilbaína"),
                  year: toWire(2026),
                  month: toWire(11),
                  day: toWire(23),
                  meal: toWire("DINNER"),
                  added: { integerValue: "1764000000000" },
                },
              },
            },
          },
        },
      },
      updated: { integerValue: "1764000000000" },
    });
  });

  it("finds the plan by name and lists entries in a date range", async () => {
    const result = await umami.plans.entries({ mealPlanId: "comidas y cenas", from: "2026-11-23", to: "2026-11-29" });
    expect(result.items).toEqual([{ id: "appItem", date: "2026-11-23", meal: "DINNER", recipeId, name: "Merluza a la bilbaína" }]);
  });

  it("adds an entry with the same value types the app uses", async () => {
    const change = await umami.plans.add({ recipeId, date: "2026-11-25", meal: "LUNCH" });
    expect(change.changed).toBe(true);
    const write = fake.commits.at(-1)![0];
    expect(write.updateMask.fieldPaths).toEqual([`items.${pathSegment(change.item.id)}`, "updated"]);
    const added = fake.field(PLANS, "plan1", `items.${change.item.id}.added`);
    expect(added && "integerValue" in added).toBe(true);
    expect(fake.field(PLANS, "plan1", "items.appItem")).toBeDefined();
  });

  it("does not add the same recipe twice to the same meal", async () => {
    const change = await umami.plans.add({ recipeId, date: "2026-11-23", meal: "DINNER" });
    expect(change).toMatchObject({ changed: false, item: { id: "appItem" } });
  });

  it("moves an entry and removes it", async () => {
    const moved = await umami.plans.update({ itemId: "appItem", date: "2026-11-24", meal: "LUNCH" });
    expect(moved.item).toMatchObject({ date: "2026-11-24", meal: "LUNCH" });
    await umami.plans.remove({ itemId: "appItem" });
    expect(fake.field(PLANS, "plan1", "items.appItem")).toBeUndefined();
    expect((await umami.plans.entries({})).items).toEqual([]);
  });

  it("validates dates and meals", async () => {
    await expect(umami.plans.add({ recipeId, date: "2026-02-30", meal: "LUNCH" })).rejects.toThrow(/valid date/);
    await expect(umami.plans.add({ recipeId, date: "2026-02-03", meal: "BREAKFAST" })).rejects.toThrow(/LUNCH or DINNER/);
  });
});

describe("photos", () => {
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3));

  it("uploads, then registers with a protobuf { recipeId, path } message", async () => {
    const photo = await umami.photos.add("recipe1", { imageBase64: png });
    expect(photo.mimeType).toBe("image/png");
    expect(fake.uploads).toEqual([photo.path]);
    const bytes = Uint8Array.from(atob(fake.rpcBodies[0]!), (c) => c.charCodeAt(0));
    expect([...bytes.slice(0, 2)]).toEqual([0x0a, 7]);
    expect(new TextDecoder().decode(bytes.slice(2, 9))).toBe("recipe1");
    expect(bytes[9]).toBe(0x12);
    expect(new TextDecoder().decode(bytes.slice(11))).toBe(photo.path);
  });

  it("deletes the upload if Umami rejects it", async () => {
    fake.rpcStatus = "7";
    await expect(umami.photos.add("recipe1", { imageBase64: png })).rejects.toThrow(/did not accept/);
    expect(fake.deleted).toEqual(fake.uploads);
  });

  it("rejects files that are not images", async () => {
    await expect(umami.photos.add("recipe1", { imageBase64: btoa("hello") })).rejects.toThrow(/JPEG, PNG or WebP/);
  });
});

describe("toWireLike", () => {
  it("copies the app's type for dates and numbers", () => {
    const d = new Date(1000);
    expect(toWireLike({ integerValue: "1" }, d)).toEqual({ integerValue: "1000" });
    expect(toWireLike({ timestampValue: "x" }, d)).toEqual({ timestampValue: d.toISOString() });
    expect(toWireLike(undefined, 3)).toEqual({ integerValue: "3" });
    expect(toWireLike({ doubleValue: 1.5 }, 3)).toEqual({ doubleValue: 3 });
  });
});

describe("running on Workers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never calls the global fetch as a method of another object", async () => {
    vi.stubGlobal("fetch", fake.fetch);
    const { Session } = await import("../src/umami/session.js");
    const defaults = new Umami(Session.fromRefreshToken("refresh-1"));
    expect((await defaults.recipes.listBooks()).length).toBe(2);
    await expect(defaults.photos.add("r1", { imageBase64: btoa("x") })).rejects.toThrow(/JPEG, PNG or WebP/);
  });
});
