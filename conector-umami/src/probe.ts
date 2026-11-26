/**
 * TEMPORAL (solo lectura): busca en qué colección guarda Umami las listas de
 * la compra. Se quitará en cuanto se sepa.
 */
import { UMAMI } from "./umami/config.js";
import type { Session } from "./umami/session.js";
import { pathSegment, Store, where } from "./umami/store.js";

const CANDIDATES = [
  "umami.GroceryList",
  "umami.ShoppingList",
  "umami.Grocery",
  "umami.GroceryItem",
  "umami.List",
  "umami.Pantry",
];

export async function probeGroceries(store: Store, session: Session, extra: string[] = []) {
  const uid = await session.userId();
  const out: unknown[] = [];
  for (const collection of [...extra, ...CANDIDATES]) {
    const filters: Array<[string, unknown]> = [
      ["members.<uid> not null", where.notNull(`members.${pathSegment(uid)}`)],
      ["ownerId == uid", where.eq("ownerId", uid)],
      ["owner.id == uid", where.eq("owner.id", uid)],
      ["joined.<uid>.id != null", where.notEqNull(`joined.${pathSegment(uid)}.id`)],
    ];
    for (const [label, filter] of filters) {
      try {
        const docs = await store.query<Record<string, unknown>>({ collection, where: filter, limit: 2 });
        if (!docs.length) continue;
        out.push({ collection, filter: label, count: docs.length, sample: JSON.stringify(docs[0]).slice(0, 6000) });
        break;
      } catch (error) {
        out.push({ collection, filter: label, error: String((error as Error).message).slice(0, 160) });
      }
    }
  }
  return { uid, plansCollection: UMAMI.collections.plan, results: out };
}
