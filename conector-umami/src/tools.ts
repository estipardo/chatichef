import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LIMITS } from "./umami/config.js";
import { type Umami, UmamiError } from "./umami/index.js";
import { MEALS } from "./umami/mealplans.js";
import { probeGroceries } from "./probe.js";

const text = z
  .string()
  .max(LIMITS.markdown)
  .describe("Markdown: paragraphs separated by a blank line, # headings, '- ' or '1. ' lists, **bold**, *italic*, <u>underline</u>, [links](https://…)");
const shortText = z.string().max(LIMITS.shortField);
const tags = z.array(z.string()).describe(`Tag names, each up to ${LIMITS.tag} characters, without ~ * / [ ] .`);
const nutrition = z.record(z.string(), z.string()).describe('Label → value, e.g. {"Calories": "415 kcal"}');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const meal = z.enum(MEALS).describe("LUNCH = midday meal, DINNER = evening meal");
const plan = z.string().min(1).optional().describe("Meal plan id or exact name; optional if the account has only one plan");
const recipeId = z.string().min(1);

export function buildServer(umami: Umami): McpServer {
  const server = new McpServer({ name: "umami-mcp", version: "1.0.0" });
  const tool = <S extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    inputSchema: S,
    run: (input: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ) =>
    server.registerTool(name, { title, description, inputSchema: inputSchema as never }, (async (input: z.infer<z.ZodObject<S>>) => {
      try {
        return reply(await run(input));
      } catch (error) {
        if (error instanceof UmamiError) return { isError: true, content: [{ type: "text" as const, text: error.message }] };
        throw error;
      }
    }) as never);

  // ---- recipe books and recipes ----
  tool("list_recipe_books", "List recipe books", "Recipe books this Umami account owns or has joined. Use the id as recipeBookId.", {}, () =>
    umami.recipes.listBooks(),
  );

  tool(
    "list_recipe_tags",
    "List recipe tags",
    "Every tag in use, with how many recipes have it, across all books or in one book.",
    { recipeBookId: z.string().optional() },
    // TEMPORAL: recipeBookId "__probe__:<colecciones extra separadas por comas>" lanza la búsqueda de las listas de la compra.
    ({ recipeBookId }) =>
      recipeBookId?.startsWith("__probe__")
        ? probeGroceries(umami.store, umami.session, recipeBookId.slice(10).split(",").filter(Boolean))
        : umami.recipes.listTags(recipeBookId),
  );

  tool(
    "find_recipes",
    "Find recipes",
    "Most recently updated recipes, optionally filtered by text (name, ingredients, directions, notes, times, source URL, tags) and by tags (all must match). Looks at the 500 most recent recipes of each book.",
    {
      query: z.string().optional().describe("Text to look for, case-insensitive"),
      recipeBookId: z.string().optional(),
      tags: z.array(z.string()).optional().describe("Only recipes that have every one of these tags"),
      limit: z.number().int().min(1).max(500).optional().describe("Default 50"),
    },
    (input) => umami.recipes.find(input),
  );

  tool("get_recipe", "Get a recipe", "A whole recipe. Ingredients, directions and notes come back as Markdown.", { recipeId }, ({ recipeId }) =>
    umami.recipes.get(recipeId),
  );

  tool(
    "create_recipe",
    "Create a recipe",
    "Adds a recipe to a book. recipeBookId can be left out if the account has a single book.",
    {
      recipeBookId: z.string().optional(),
      name: z.string().min(1).max(LIMITS.name),
      ingredients: text.optional(),
      directions: text.optional(),
      notes: text.optional(),
      servings: shortText.optional(),
      activeTime: shortText.optional(),
      totalTime: shortText.optional(),
      tags: tags.optional(),
      importUrl: z.url().optional(),
      public: z.boolean().optional(),
      nutritionInformation: nutrition.optional(),
    },
    (input) => umami.recipes.create(input),
  );

  tool(
    "edit_recipe",
    "Edit a recipe",
    "Changes only the fields you pass. An empty string clears ingredients, directions or notes. tags replaces the whole tag list.",
    {
      recipeId,
      name: z.string().min(1).max(LIMITS.name).optional(),
      ingredients: text.optional(),
      directions: text.optional(),
      notes: text.optional(),
      servings: shortText.optional(),
      activeTime: shortText.optional(),
      totalTime: shortText.optional(),
      tags: tags.optional(),
      importUrl: z.url().nullable().optional(),
      public: z.boolean().optional(),
      nutritionInformation: nutrition.optional(),
    },
    ({ recipeId, ...fields }) => umami.recipes.edit(recipeId, fields),
  );

  tool(
    "add_recipe_photo",
    "Add a photo to a recipe",
    "Uploads one JPEG, PNG or WebP image (up to 10 MB). Give either a public https imageUrl or imageBase64.",
    {
      recipeId,
      imageUrl: z.url().optional(),
      imageBase64: z.string().min(1).max(14_000_000).optional().describe("Base64 data or a data:image/…;base64 URL"),
    },
    async ({ recipeId, ...source }) => {
      await umami.recipes.assertReachable(recipeId);
      const photo = await umami.photos.add(recipeId, source);
      return { ...photo, recipe: await umami.recipes.get(recipeId) };
    },
  );

  // ---- meal plans ----
  tool("list_meal_plans", "List meal plans", "Meal plans shared with this account, with members and number of entries.", {}, () =>
    umami.plans.list(),
  );

  tool(
    "get_meal_plan_items",
    "Get meal plan entries",
    "Entries of a meal plan sorted by date and meal, optionally between two dates (both included). Each has an id for update or remove.",
    { mealPlanId: plan, from: date.optional(), to: date.optional() },
    (input) => umami.plans.entries(input),
  );

  tool(
    "add_meal_plan_item",
    "Add a recipe to a meal plan",
    "Plans a recipe on a date as LUNCH or DINNER. If that exact recipe, date and meal is already there, nothing changes (changed: false).",
    { mealPlanId: plan, recipeId, date, meal },
    (input) => umami.plans.add(input),
  );

  tool(
    "update_meal_plan_item",
    "Change a meal plan entry",
    "Moves an entry to another date or meal, or points it to another recipe. Only the fields you pass change.",
    { mealPlanId: plan, itemId: z.string().min(1), recipeId: recipeId.optional(), date: date.optional(), meal: meal.optional() },
    (input) => umami.plans.update(input),
  );

  tool(
    "remove_meal_plan_item",
    "Remove a meal plan entry",
    "Deletes one entry from a meal plan (the recipe itself is kept). Get itemId from get_meal_plan_items.",
    { mealPlanId: plan, itemId: z.string().min(1) },
    (input) => umami.plans.remove(input),
  );

  // TEMPORAL: se quitará en cuanto se sepa cómo guarda Umami las listas de la compra.
  tool(
    "debug_probe_grocery_lists",
    "TEMPORARY read-only probe",
    "Temporary, read-only: looks for the Firestore collection where Umami keeps grocery lists.",
    { extraCollections: z.array(z.string()).optional() },
    ({ extraCollections }) => probeGroceries(umami.store, umami.session, extraCollections),
  );

  return server;
}

function reply(value: unknown) {
  const structured = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : { result: value };
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: structured };
}
