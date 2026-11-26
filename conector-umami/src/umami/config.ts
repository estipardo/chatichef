/**
 * Facts about the Umami Recipes backend (a Firebase project). These are the
 * public values the Umami web app itself uses.
 */
export const UMAMI = {
  apiKey: "AIzaSyAWqAA_Et_FByVw5KkO5K6_LBdGYaMZ8CU",
  project: "umami-api",
  bucket: "umami-api.appspot.com",
  collections: {
    book: "umami.RecipeBook",
    recipe: "umami.Recipe",
    plan: "umami.MealPlan",
  },
  addPhotosRpc: "https://www.umami.recipes/api/rpc/umami.AppService/AddRecipePhotos",
} as const;

export const DB_PATH = `projects/${UMAMI.project}/databases/(default)`;
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/${DB_PATH}`;
export const STORAGE_URL = `https://firebasestorage.googleapis.com/v0/b/${UMAMI.bucket}/o`;
export const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${UMAMI.apiKey}`;
export const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${UMAMI.apiKey}`;

/** Limits the Umami app enforces on recipes. */
export const LIMITS = {
  name: 60,
  shortField: 24,
  tag: 24,
  markdown: 50_000,
  photoBytes: 10 * 1024 * 1024,
} as const;

/**
 * The global fetch, wrapped. Workers throw "Illegal invocation" when fetch is
 * called as a method of another object (this.http(...)), so it is never
 * stored or passed around bare.
 */
export const webFetch: typeof fetch = (input, init) => fetch(input, init);
