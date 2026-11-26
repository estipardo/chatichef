/**
 * Umami grocery lists (umami.GroceryList). A list keeps its products in one
 * `groceries` array; each product looks like:
 *   { id (22 chars), name, quantity?, aisle?, recipeId?, recipeName?,
 *     created, updated, completed? (when it was ticked off) }
 * Members are in `members.<uid>`, like meal plans. We rewrite the array as a
 * whole, keeping every product we don't touch exactly as the app stored it,
 * and guard the write with the document's update time.
 */
import { UMAMI } from "./config.js";
import { UmamiError } from "./errors.js";
import type { Session } from "./session.js";
import { fromWireFields, newId, pathSegment, type Store, toWireLike, where, type Wire, type WireFields } from "./store.js";

const LISTS = UMAMI.collections.groceries;

export interface GroceryItem {
  id: string;
  name: string;
  quantity?: string;
  aisle?: string;
  recipeId?: string;
  recipeName?: string;
  completed: boolean;
  completedAt?: string;
}

export interface NewGrocery {
  name: string;
  quantity?: string;
  aisle?: string;
  recipeId?: string;
  recipeName?: string;
}

interface ListData {
  id: string;
  name: string;
  members?: Record<string, { id?: string; displayName?: string }>;
  groceries?: Array<Record<string, unknown>>;
}

export class Groceries {
  constructor(
    private readonly store: Store,
    private readonly session: Session,
  ) {}

  async lists() {
    return (await this.all()).map((list) => {
      const items = list.groceries ?? [];
      return {
        id: list.id,
        name: list.name,
        members: Object.values(list.members ?? {})
          .map((m) => m.displayName || m.id || "")
          .filter(Boolean),
        itemCount: items.length,
        toBuy: items.filter((g) => !g.completed).length,
      };
    });
  }

  async items(groceryListId?: string) {
    const list = await this.pick(groceryListId);
    return { groceryListId: list.id, groceryListName: list.name, items: (list.groceries ?? []).map(view) };
  }

  /** Adds products, skipping any that is already on the list and not ticked off (same name, same recipe). */
  async add(groceryListId: string | undefined, products: NewGrocery[]) {
    if (!products.length) throw new UmamiError("Give at least one product");
    for (const p of products) if (!p.name?.trim()) throw new UmamiError("Every product needs a name");
    return this.change(groceryListId, (items, sample) => {
      const added: GroceryItem[] = [];
      const skipped: string[] = [];
      const now = new Date();
      for (const p of products) {
        const name = p.name.trim();
        const dup = items.find((w) => {
          const v = plain(w);
          return !v.completed && norm(String(v.name ?? "")) === norm(name) && (v.recipeId ?? null) === (p.recipeId ?? null);
        });
        if (dup) {
          skipped.push(name);
          continue;
        }
        const item: Record<string, unknown> = { id: newId(22), name, created: now, updated: now };
        if (p.quantity?.trim()) item.quantity = p.quantity.trim();
        if (p.aisle?.trim()) item.aisle = p.aisle.trim();
        if (p.recipeId) item.recipeId = p.recipeId;
        if (p.recipeName) item.recipeName = p.recipeName;
        items.push(encodeLike(sample, item));
        added.push(view(item));
      }
      return { added, skipped };
    });
  }

  /** Changes name, quantity, aisle or ticked state of existing products. */
  async update(groceryListId: string | undefined, changes: Array<{ itemId: string; name?: string; quantity?: string; aisle?: string; completed?: boolean }>) {
    return this.change(groceryListId, (items, sample) => {
      const updated: GroceryItem[] = [];
      for (const c of changes) {
        const i = items.findIndex((w) => plain(w).id === c.itemId);
        if (i < 0) throw new UmamiError(`Product ${c.itemId} is not on this list (see get_grocery_list)`);
        const fields = { ...(("mapValue" in items[i]! && items[i]!.mapValue.fields) || {}) } as WireFields;
        const like = { ...sample, ...fields };
        const set = (k: string, v: unknown) => {
          if (v === undefined) return;
          if (v === null || v === "") delete fields[k];
          else fields[k] = toWireLike(like[k], v);
        };
        set("name", c.name?.trim());
        set("quantity", c.quantity === undefined ? undefined : c.quantity.trim());
        set("aisle", c.aisle === undefined ? undefined : c.aisle.trim());
        if (c.completed !== undefined) set("completed", c.completed ? new Date() : null);
        set("updated", new Date());
        items[i] = { mapValue: { fields } };
        updated.push(view(plain(items[i]!)));
      }
      return { updated };
    });
  }

  async remove(groceryListId: string | undefined, itemIds: string[]) {
    if (!itemIds.length) throw new UmamiError("Give at least one itemId");
    return this.change(groceryListId, (items) => {
      const removed: GroceryItem[] = [];
      const missing: string[] = [];
      for (const id of itemIds) {
        const i = items.findIndex((w) => plain(w).id === id);
        if (i < 0) missing.push(id);
        else removed.push(view(plain(items.splice(i, 1)[0]!)));
      }
      return { removed, missing };
    });
  }

  private async change<T extends object>(groceryListId: string | undefined, edit: (items: Wire[], sample: WireFields) => T) {
    const list = await this.pick(groceryListId);
    const raw = await this.store.getRaw(LISTS, list.id);
    if (!raw.updateTime) throw new UmamiError("Refusing to write: the grocery list has no update time");
    const current = raw.fields?.groceries;
    const items: Wire[] = current && "arrayValue" in current ? [...(current.arrayValue.values ?? [])] : [];
    // Type template: for each field, how the app stored it in the first product that has it.
    const sample: WireFields = {};
    for (const w of items) {
      if (!("mapValue" in w)) continue;
      for (const [k, v] of Object.entries(w.mapValue.fields ?? {})) if (!(k in sample)) sample[k] = v;
    }
    const result = edit(items, sample);
    await this.store.commit([
      {
        update: {
          name: raw.name,
          fields: { groceries: { arrayValue: { values: items } }, updated: toWireLike(raw.fields?.updated, new Date()) },
        },
        updateMask: { fieldPaths: ["groceries", "updated"] },
        currentDocument: { updateTime: raw.updateTime },
      },
    ]);
    return { groceryListId: list.id, groceryListName: list.name, ...result };
  }

  private async all(): Promise<ListData[]> {
    const uid = await this.session.userId();
    const docs = await this.store.query<ListData>({ collection: LISTS, where: where.notNull(`members.${pathSegment(uid)}`) });
    return docs.map((d) => ({ ...d.data, id: d.data.id ?? d.id }));
  }

  /** By id or exact name (case-insensitive); optional when there is only one list. */
  private async pick(idOrName?: string): Promise<ListData> {
    const lists = await this.all();
    if (!idOrName) {
      if (lists.length === 1) return lists[0]!;
      throw new UmamiError(lists.length ? "This account has several grocery lists: pass groceryListId (see list_grocery_lists)" : "No grocery lists found: create one in the Umami app");
    }
    const key = idOrName.trim().toLowerCase();
    const list = lists.find((l) => l.id === idOrName) ?? lists.find((l) => l.name.trim().toLowerCase() === key);
    if (!list) throw new UmamiError(`Grocery list "${idOrName}" is not shared with this account`);
    return list;
  }
}

function encodeLike(sample: WireFields, item: Record<string, unknown>): Wire {
  const fields: WireFields = {};
  for (const [k, v] of Object.entries(item)) if (v !== undefined) fields[k] = toWireLike(sample[k], v);
  return { mapValue: { fields } };
}

function plain(w: Wire): Record<string, unknown> {
  return "mapValue" in w ? fromWireFields(w.mapValue.fields ?? {}) : {};
}

function view(g: Record<string, unknown>): GroceryItem {
  const at = g.completed instanceof Date ? g.completed.toISOString() : typeof g.completed === "string" ? g.completed : undefined;
  const out: GroceryItem = { id: String(g.id ?? ""), name: String(g.name ?? ""), completed: !!g.completed };
  if (g.quantity) out.quantity = String(g.quantity);
  if (g.aisle) out.aisle = String(g.aisle);
  if (g.recipeId) out.recipeId = String(g.recipeId);
  if (g.recipeName) out.recipeName = String(g.recipeName);
  if (at) out.completedAt = at;
  return out;
}

function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
