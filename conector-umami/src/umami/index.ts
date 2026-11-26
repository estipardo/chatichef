import { webFetch } from "./config.js";
import { MealPlans } from "./mealplans.js";
import { Photos } from "./photos.js";
import { Recipes } from "./recipes.js";
import { Session } from "./session.js";
import { Store } from "./store.js";

export { Session } from "./session.js";
export { UmamiError } from "./errors.js";

/** Everything the MCP tools need, for one signed-in Umami user. */
export class Umami {
  readonly recipes: Recipes;
  readonly plans: MealPlans;
  readonly photos: Photos;

  constructor(session: Session, http: typeof fetch = webFetch) {
    const store = new Store(session, http);
    this.recipes = new Recipes(store, session);
    this.plans = new MealPlans(store, session, this.recipes);
    this.photos = new Photos(session, http);
  }
}
