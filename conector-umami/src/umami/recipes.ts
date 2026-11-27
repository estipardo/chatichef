import { LIMITS, UMAMI } from "./config.js";
import { UmamiError } from "./errors.js";
import { toMarkdown, toRichText } from "./richtext.js";
import type { Session } from "./session.js";
import { type Doc, newId, patch, pathSegment, type Store, toWireFields, where } from "./store.js";

const { book: BOOKS, recipe: RECIPES } = UMAMI.collections;

/** Shape of an umami.RecipeBook document (only the fields we use). */
interface BookData {
  id: string;
  name: string;
  public?: boolean;
  owner?: { id?: string };
  recipes?: Record<string, boolean>;
  recipeTags?: Record<string, number>;
}

/** Shape of an umami.Recipe document. */
interface RecipeData {
  id: string;
  recipeBookId: string;
  name: string;
  servings?: string;
  activeTime?: string;
  totalTime?: string;
  ingredients?: unknown;
  directions?: unknown;
  notes?: unknown;
  nutritionInformation?: Record<string, string>;
  tags?: Record<string, boolean>;
  importUrl?: string | null;
  public?: boolean;
  photoCount?: number;
  created?: Date;
  updated?: Date;
}

export interface BookInfo {
  id: string;
  name: string;
  public: boolean;
  ownerId?: string;
}

export interface RecipeInfo {
  id: string;
  recipeBookId: string;
  recipeBookName?: string;
  name: string;
  servings?: string;
  activeTime?: string;
  totalTime?: string;
  tags: string[];
  updated?: string;
}

export interface RecipeFull extends RecipeInfo {
  ingredients: string;
  directions: string;
  notes: string;
  nutritionInformation?: Record<string, string>;
  importUrl?: string | null;
  public: boolean;
  photoCount: number;
  created?: string;
}

export interface RecipeFields {
  name?: string;
  ingredients?: string;
  directions?: string;
  notes?: string;
  servings?: string;
  activeTime?: string;
  totalTime?: string;
  tags?: string[];
  importUrl?: string | null;
  public?: boolean;
  nutritionInformation?: Record<string, string>;
}

export class Recipes {
  constructor(
    private readonly store: Store,
    private readonly session: Session,
  ) {}

  /** Books the user owns plus books shared with them. */
  async books(): Promise<Doc<BookData>[]> {
    const uid = await this.session.userId();
    // Shared books list their members under joined.<uid>; this is the query
    // shape Umami's security rules accept for members.
    const joined = `joined.${pathSegment(uid)}.id`;
    const [owned, shared] = await Promise.all([
      this.store.query<BookData>({ collection: BOOKS, where: where.eq("owner.id", uid) }),
      this.store.query<BookData>({
        collection: BOOKS,
        where: where.notEqNull(joined),
        orderBy: [{ field: joined, direction: "ASCENDING" }],
      }),
    ]);
    const byId = new Map<string, Doc<BookData>>();
    for (const doc of [...owned, ...shared]) byId.set(doc.id, doc);
    return [...byId.values()];
  }

  async listBooks(): Promise<BookInfo[]> {
    return (await this.books()).map(({ id, data }) => ({
      id,
      name: data.name,
      public: data.public ?? false,
      ...(data.owner?.id ? { ownerId: data.owner.id } : {}),
    }));
  }

  async listTags(recipeBookId?: string): Promise<Array<{ name: string; count: number; recipeBookIds: string[] }>> {
    const books = await this.pickBooks(recipeBookId);
    const tags = new Map<string, { count: number; recipeBookIds: string[] }>();
    for (const book of books) {
      for (const [name, count] of Object.entries(book.data.recipeTags ?? {})) {
        if (!(count > 0)) continue;
        const entry = tags.get(name) ?? { count: 0, recipeBookIds: [] };
        entry.count += count;
        entry.recipeBookIds.push(book.id);
        tags.set(name, entry);
      }
    }
    return [...tags]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Recently updated recipes, optionally filtered by text and tags. Tag
   * filtering is done here rather than in Firestore so it never needs a
   * composite index.
   */
  async find(input: { query?: string; recipeBookId?: string; tags?: string[]; limit?: number }): Promise<RecipeInfo[]> {
    const limit = clamp(input.limit ?? 50, 1, 500);
    const text = input.query?.trim().toLowerCase();
    const wanted = cleanTags(input.tags);
    const scan = text || wanted.length ? 500 : limit;
    const books = await this.pickBooks(input.recipeBookId);

    const perBook = await Promise.all(
      books.map(async (book) => {
        const docs = await this.store.query<RecipeData>({
          collection: RECIPES,
          where: where.eq("recipeBookId", book.id),
          orderBy: [{ field: "updated", direction: "DESCENDING" }],
          limit: scan,
        });
        return docs.map((doc) => ({ recipe: doc.data, bookName: book.data.name }));
      }),
    );

    return perBook
      .flat()
      .filter(({ recipe }) => {
        const tags = tagList(recipe);
        if (wanted.some((tag) => !tags.includes(tag))) return false;
        if (!text) return true;
        return [
          recipe.name,
          recipe.servings,
          recipe.activeTime,
          recipe.totalTime,
          recipe.importUrl,
          ...tags,
          toMarkdown(recipe.ingredients),
          toMarkdown(recipe.directions),
          toMarkdown(recipe.notes),
        ]
          .filter((part): part is string => typeof part === "string")
          .some((part) => part.toLowerCase().includes(text));
      })
      .sort((a, b) => time(b.recipe.updated) - time(a.recipe.updated))
      .slice(0, limit)
      .map(({ recipe, bookName }) => summary(recipe, bookName));
  }

  async get(recipeId: string): Promise<RecipeFull> {
    const doc = await this.store.get<RecipeData>(RECIPES, recipeId);
    const book = await this.book(doc.data.recipeBookId);
    return full(doc.data, book.data.name);
  }

  /** Throws unless the recipe exists and is in a book this user can reach. */
  async assertReachable(recipeId: string): Promise<RecipeData> {
    const doc = await this.store.get<RecipeData>(RECIPES, recipeId);
    await this.book(doc.data.recipeBookId);
    return doc.data;
  }

  async create(input: RecipeFields & { recipeBookId?: string; name: string }): Promise<RecipeFull> {
    validate(input);
    const target = input.recipeBookId ? await this.book(input.recipeBookId) : await this.onlyBook();
    const book = await this.store.get<BookData>(BOOKS, target.id);
    const tags = cleanTags(input.tags);
    const now = new Date();
    const id = newId();
    const recipe: RecipeData & Record<string, unknown> = {
      id,
      recipeBookId: book.id,
      name: input.name.trim(),
      servings: input.servings?.trim() ?? "",
      activeTime: input.activeTime?.trim() ?? "",
      totalTime: input.totalTime?.trim() ?? "",
      ingredients: toRichText(input.ingredients),
      directions: toRichText(input.directions),
      notes: toRichText(input.notes),
      nutritionInformation: input.nutritionInformation ?? {},
      photos: [],
      photoCount: 0,
      tags: Object.fromEntries(tags.map((tag) => [tag, true])),
      importUrl: input.importUrl ?? null,
      public: input.public ?? false,
      memberRatings: {},
      created: now,
      updated: now,
    };
    const counts = { ...(book.data.recipeTags ?? {}) };
    for (const tag of tags) counts[tag] = (counts[tag] ?? 0) + 1;

    await this.store.commit([
      {
        update: { name: this.store.docPath(RECIPES, id), fields: toWireFields(recipe) },
        currentDocument: { exists: false },
      },
      patch(book, toWireFields({ recipes: { ...(book.data.recipes ?? {}), [id]: true }, recipeTags: counts, updated: now })),
    ]);
    return full(recipe, book.data.name);
  }

  async edit(recipeId: string, input: RecipeFields): Promise<RecipeFull> {
    validate(input);
    const doc = await this.store.get<RecipeData>(RECIPES, recipeId);
    const reachable = await this.book(doc.data.recipeBookId);
    const changes: Record<string, unknown> = {};
    for (const key of ["name", "servings", "activeTime", "totalTime"] as const) {
      if (input[key] !== undefined) changes[key] = input[key]!.trim();
    }
    for (const key of ["ingredients", "directions", "notes"] as const) {
      if (input[key] !== undefined) changes[key] = toRichText(input[key]);
    }
    if (input.nutritionInformation !== undefined) changes.nutritionInformation = input.nutritionInformation;
    if (input.importUrl !== undefined) changes.importUrl = input.importUrl;
    if (input.public !== undefined) changes.public = input.public;

    const writes: unknown[] = [];
    const now = new Date();
    if (input.tags !== undefined) {
      const next = cleanTags(input.tags);
      const book = await this.store.get<BookData>(BOOKS, doc.data.recipeBookId);
      const counts = { ...(book.data.recipeTags ?? {}) };
      for (const tag of tagList(doc.data)) {
        const n = (counts[tag] ?? 0) - 1;
        if (n > 0) counts[tag] = n;
        else delete counts[tag];
      }
      for (const tag of next) counts[tag] = (counts[tag] ?? 0) + 1;
      changes.tags = Object.fromEntries(next.map((tag) => [tag, true]));
      writes.push(patch(book, toWireFields({ recipeTags: counts, updated: now })));
    }
    if (!Object.keys(changes).length) throw new UmamiError("Nothing to change: give at least one field");
    changes.updated = now;
    writes.unshift(patch(doc, toWireFields(changes)));
    await this.store.commit(writes);
    return full({ ...doc.data, ...changes } as RecipeData, reachable.data.name);
  }

  private async pickBooks(recipeBookId?: string): Promise<Doc<BookData>[]> {
    return recipeBookId ? [await this.book(recipeBookId)] : this.books();
  }

  private async book(recipeBookId: string): Promise<Doc<BookData>> {
    const found = (await this.books()).find((book) => book.id === recipeBookId);
    if (!found) throw new UmamiError(`Recipe book ${recipeBookId} is not owned by or shared with this account`);
    return found;
  }

  private async onlyBook(): Promise<Doc<BookData>> {
    const books = await this.books();
    if (books.length === 1) return books[0]!;
    throw new UmamiError(
      books.length ? "This account has several recipe books: pass recipeBookId (see list_recipe_books)" : "This account has no recipe books",
    );
  }
}

function validate(input: RecipeFields): void {
  if (input.name !== undefined) {
    const n = input.name.trim().length;
    if (n < 1 || n > LIMITS.name) throw new UmamiError(`The name must have 1 to ${LIMITS.name} characters`);
  }
  for (const key of ["servings", "activeTime", "totalTime"] as const) {
    if ((input[key]?.trim().length ?? 0) > LIMITS.shortField) {
      throw new UmamiError(`${key} must have at most ${LIMITS.shortField} characters`);
    }
  }
  cleanTags(input.tags);
}

/** Trims and de-duplicates tags, rejecting the ones Umami cannot store. */
export function cleanTags(tags: string[] | undefined): string[] {
  const out = [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  for (const tag of out) {
    if (tag.length > LIMITS.tag || /[~*/[\].]/.test(tag)) {
      throw new UmamiError(`Tag "${tag}" is not valid: at most ${LIMITS.tag} characters and none of ~ * / [ ] .`);
    }
  }
  return out;
}

function tagList(recipe: RecipeData): string[] {
  return Object.entries(recipe.tags ?? {})
    .filter(([, on]) => on)
    .map(([tag]) => tag);
}

function summary(recipe: RecipeData, bookName?: string): RecipeInfo {
  return {
    id: recipe.id,
    recipeBookId: recipe.recipeBookId,
    ...(bookName ? { recipeBookName: bookName } : {}),
    name: recipe.name,
    ...(recipe.servings ? { servings: recipe.servings } : {}),
    ...(recipe.activeTime ? { activeTime: recipe.activeTime } : {}),
    ...(recipe.totalTime ? { totalTime: recipe.totalTime } : {}),
    tags: tagList(recipe),
    ...(recipe.updated ? { updated: iso(recipe.updated) } : {}),
  };
}

function full(recipe: RecipeData, bookName?: string): RecipeFull {
  return {
    ...summary(recipe, bookName),
    ingredients: toMarkdown(recipe.ingredients),
    directions: toMarkdown(recipe.directions),
    notes: toMarkdown(recipe.notes),
    ...(recipe.nutritionInformation ? { nutritionInformation: recipe.nutritionInformation } : {}),
    ...(recipe.importUrl !== undefined ? { importUrl: recipe.importUrl } : {}),
    public: recipe.public ?? false,
    photoCount: recipe.photoCount ?? 0,
    ...(recipe.created ? { created: iso(recipe.created) } : {}),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function time(value: unknown): number {
  return value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) || 0 : 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(n), min), max);
}
