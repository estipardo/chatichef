/**
 * Umami meal plans (umami.MealPlan). A plan keeps every entry in one `items`
 * map keyed by a 22-character id:
 *   { id, recipeId, name, year, month (1-12), day, meal: "LUNCH" | "DINNER", added }
 * Members are listed in `members.<uid>`. We only ever write `items.<id>` and
 * `updated`, guarded by the document's update time, so nothing the app wrote
 * meanwhile is overwritten.
 */
import { UMAMI } from "./config.js";
import { UmamiError } from "./errors.js";
import type { Recipes } from "./recipes.js";
import type { Session } from "./session.js";
import { newId, pathSegment, type Store, toWireLike, where, type Wire, type WireFields } from "./store.js";

const PLANS = UMAMI.collections.plan;
export const MEALS = ["LUNCH", "DINNER"] as const;
export type Meal = (typeof MEALS)[number];

interface Item {
  id: string;
  recipeId: string;
  name: string;
  year: number;
  month: number;
  day: number;
  meal: string;
  added?: unknown;
  [extra: string]: unknown;
}

interface PlanData {
  id: string;
  name: string;
  members?: Record<string, { id?: string; displayName?: string }>;
  items?: Record<string, Item>;
}

export interface Entry {
  id: string;
  date: string;
  meal: string;
  recipeId: string;
  name: string;
}

export interface Change {
  mealPlanId: string;
  mealPlanName: string;
  item: Entry;
  /** false when an identical entry already existed and nothing was written. */
  changed: boolean;
}

export class MealPlans {
  constructor(
    private readonly store: Store,
    private readonly session: Session,
    private readonly recipes: Recipes,
  ) {}

  async list(): Promise<Array<{ id: string; name: string; members: string[]; itemCount: number }>> {
    return (await this.plans()).map((plan) => ({
      id: plan.id,
      name: plan.name,
      members: Object.values(plan.members ?? {})
        .map((member) => member.displayName || member.id || "")
        .filter(Boolean),
      itemCount: Object.keys(plan.items ?? {}).length,
    }));
  }

  async entries(input: { mealPlanId?: string; from?: string; to?: string }) {
    if (input.from) parseDate(input.from);
    if (input.to) parseDate(input.to);
    const plan = await this.pick(input.mealPlanId);
    const items = Object.values(plan.items ?? {})
      .map(view)
      .filter((entry) => (!input.from || entry.date >= input.from) && (!input.to || entry.date <= input.to))
      .sort(byDateThenMeal);
    return { mealPlanId: plan.id, mealPlanName: plan.name, items };
  }

  async add(input: { mealPlanId?: string; recipeId: string; date: string; meal: string }): Promise<Change> {
    const day = parseDate(input.date);
    const meal = checkMeal(input.meal);
    const plan = await this.pick(input.mealPlanId);
    const recipe = await this.recipes.assertReachable(input.recipeId);
    const same = Object.values(plan.items ?? {}).find(
      (item) =>
        item.recipeId === recipe.id && item.meal === meal && item.year === day.year && item.month === day.month && item.day === day.day,
    );
    if (same) return { mealPlanId: plan.id, mealPlanName: plan.name, item: view(same), changed: false };

    const item: Item = { id: newId(22), recipeId: recipe.id, name: recipe.name, ...day, meal, added: new Date() };
    await this.write(plan.id, item);
    return { mealPlanId: plan.id, mealPlanName: plan.name, item: view(item), changed: true };
  }

  async update(input: { mealPlanId?: string; itemId: string; recipeId?: string; date?: string; meal?: string }): Promise<Change> {
    if (!input.itemId.trim()) throw new UmamiError("itemId is required");
    const day = input.date === undefined ? {} : parseDate(input.date);
    const meal = input.meal === undefined ? {} : { meal: checkMeal(input.meal) };
    const plan = await this.pick(input.mealPlanId);
    const current = plan.items?.[input.itemId];
    if (!current) throw new UmamiError(`Entry ${input.itemId} is not in meal plan "${plan.name}" (see get_meal_plan_items)`);
    // Re-read the recipe so the entry always shows its current name.
    const recipe = await this.recipes.assertReachable(input.recipeId ?? current.recipeId);
    const item: Item = { ...current, recipeId: recipe.id, name: recipe.name, ...day, ...meal };
    await this.write(plan.id, item);
    return { mealPlanId: plan.id, mealPlanName: plan.name, item: view(item), changed: true };
  }

  /**
   * Deletes one entry. Firestore removes a map key when its path is in the
   * update mask but not in the written fields.
   */
  async remove(input: { mealPlanId?: string; itemId: string }): Promise<{ mealPlanId: string; mealPlanName: string; removed: Entry }> {
    const plan = await this.pick(input.mealPlanId);
    const current = plan.items?.[input.itemId];
    if (!current) throw new UmamiError(`Entry ${input.itemId} is not in meal plan "${plan.name}" (see get_meal_plan_items)`);
    const raw = await this.store.getRaw(PLANS, plan.id);
    if (!raw.updateTime) throw new UmamiError("Refusing to write: the meal plan has no update time");
    await this.store.commit([
      {
        update: { name: raw.name, fields: { updated: toWireLike(raw.fields?.updated, new Date()) } },
        updateMask: { fieldPaths: [`items.${pathSegment(input.itemId)}`, "updated"] },
        currentDocument: { updateTime: raw.updateTime },
      },
    ]);
    return { mealPlanId: plan.id, mealPlanName: plan.name, removed: view(current) };
  }

  private async plans(): Promise<PlanData[]> {
    const uid = await this.session.userId();
    const docs = await this.store.query<PlanData>({
      collection: PLANS,
      where: where.notNull(`members.${pathSegment(uid)}`),
    });
    return docs.map((doc) => ({ ...doc.data, id: doc.data.id ?? doc.id }));
  }

  /** By id or exact name (case-insensitive); optional when there is only one plan. */
  private async pick(idOrName?: string): Promise<PlanData> {
    const plans = await this.plans();
    if (!idOrName) {
      if (plans.length === 1) return plans[0]!;
      throw new UmamiError(plans.length ? "This account has several meal plans: pass mealPlanId (see list_meal_plans)" : "No meal plans found");
    }
    const key = idOrName.trim().toLowerCase();
    const plan = plans.find((p) => p.id === idOrName) ?? plans.find((p) => p.name.trim().toLowerCase() === key);
    if (!plan) throw new UmamiError(`Meal plan "${idOrName}" is not shared with this account`);
    return plan;
  }

  private async write(planId: string, item: Item): Promise<void> {
    const raw = await this.store.getRaw(PLANS, planId);
    if (!raw.updateTime) throw new UmamiError("Refusing to write: the meal plan has no update time");
    const sample = sampleItem(raw.fields?.items);
    const fields: WireFields = {};
    for (const [key, value] of Object.entries(item)) {
      if (value !== undefined) fields[key] = toWireLike(sample[key], value);
    }
    await this.store.commit([
      {
        update: {
          name: raw.name,
          fields: {
            items: { mapValue: { fields: { [item.id]: { mapValue: { fields } } } } },
            updated: toWireLike(raw.fields?.updated, new Date()),
          },
        },
        updateMask: { fieldPaths: [`items.${pathSegment(item.id)}`, "updated"] },
        currentDocument: { updateTime: raw.updateTime },
      },
    ]);
  }
}

/** Wire fields of an entry the app already wrote, used as the type template. */
function sampleItem(items: Wire | undefined): WireFields {
  if (!items || !("mapValue" in items)) return {};
  for (const entry of Object.values(items.mapValue.fields ?? {})) {
    if ("mapValue" in entry) return entry.mapValue.fields ?? {};
  }
  return {};
}

export function parseDate(text: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  const [year, month, day] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (!m || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    throw new UmamiError(`"${text}" is not a valid date: use YYYY-MM-DD`);
  }
  return { year, month, day };
}

function checkMeal(meal: string): Meal {
  if ((MEALS as readonly string[]).includes(meal)) return meal as Meal;
  throw new UmamiError(`meal must be LUNCH or DINNER, not "${meal}"`);
}

function view(item: Item): Entry {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return {
    id: item.id,
    date: `${pad(item.year, 4)}-${pad(item.month)}-${pad(item.day)}`,
    meal: item.meal,
    recipeId: item.recipeId,
    name: item.name,
  };
}

function byDateThenMeal(a: Entry, b: Entry): number {
  const rank = (meal: string) => {
    const i = (MEALS as readonly string[]).indexOf(meal);
    return i < 0 ? 9 : i;
  };
  return a.date.localeCompare(b.date) || rank(a.meal) - rank(b.meal) || a.name.localeCompare(b.name);
}
