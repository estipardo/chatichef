# Umami connector for Claude

*Spanish version: [README.es.md](README.es.md)*

A remote MCP server (a Cloudflare Worker) to use [Umami Recipes](https://www.umami.recipes/) from Claude or any other MCP client. It is the connector the ChatiChef skills use to save recipes, fill the meal plan and keep the grocery list up to date.

Written from scratch for this repository, MIT licensed. It is not an official Umami product: it uses the same private API as the Umami web app, which may change without notice.

## Tools

| Tool | What it does |
|---|---|
| `list_recipe_books` | Your own recipe books and the ones shared with you |
| `list_recipe_tags` | Tags in use and how many recipes each one has |
| `find_recipes` | Searches by text and by tags (all must match) among the 500 most recent recipes of each book |
| `get_recipe` | Full recipe; ingredients, steps and notes in Markdown |
| `create_recipe` / `edit_recipe` | Creates or changes a recipe (name, servings, times, tags, nutrition information…) |
| `add_recipe_photo` | Uploads a JPEG, PNG or WebP photo (max. 10 MB) from an https URL or as base64. Careful: when you do, Umami re-saves the recipe and wipes the nutrition information |
| `list_meal_plans` | Meal plans shared with you |
| `get_meal_plan_items` | A plan's entries between two dates |
| `add_meal_plan_item` | Puts a recipe on a day as `LUNCH` or `DINNER`, without duplicating it |
| `update_meal_plan_item` | Moves an entry to another day or slot, or points it to another recipe |
| `remove_meal_plan_item` | Removes an entry from the plan (the recipe isn't deleted) |
| `list_grocery_lists` | Grocery lists shared with you, with how many items are still to buy |
| `get_grocery_list` | A list's items: amount, section, recipe and whether they're already bought |
| `add_grocery_items` | Adds items (without repeating those still pending) |
| `update_grocery_items` | Changes name, amount or section, or ticks and unticks an item as bought |
| `remove_grocery_items` | Removes items from the list |

Every write checks that nobody has changed the document since it was read, so it never overwrites something you did in the app in the meantime.

## How access works

1. When you connect, Claude opens a page on the Worker itself where you type your Umami email and password (in English or Spanish, depending on your browser).
2. The Worker checks that the email is in `ALLOWED_EMAILS` **before** talking to Umami (so nobody can use your server to try other people's passwords).
3. It exchanges the password for an Umami *refresh token* and forgets the password. The token is stored encrypted inside the OAuth grant, in the Worker's KV.
4. Every request checks `ALLOWED_EMAILS` again: if you remove an email, that access stops working straight away.

The Worker's logs are turned off so Cloudflare doesn't keep recipes or account data.

## Deploying it on Cloudflare

You need a free Cloudflare account.

**From the dashboard (nothing to install):**

1. In Cloudflare: **Workers & Pages → Create → Import a repository** and pick your copy of this repository.
2. Leave the default settings: root directory `/` and deploy command `npx wrangler deploy`. The `wrangler.jsonc` at the root of the repo already points to this folder.
3. Deploy. The KV for the grants is created by itself the first time.
4. In the Worker: **Settings → Variables and Secrets → Add** (the runtime ones, not the build ones), type **Secret**, name `ALLOWED_EMAILS`, value your Umami email (several, separated by commas).
5. In Claude, add a custom connector with the URL `https://umami-mcp.<your-subdomain>.workers.dev/mcp` and connect it with your Umami account.

**From the terminal:**

```bash
# from the root of the repository
npm ci
npx wrangler login
npx wrangler deploy
npx wrangler secret put ALLOWED_EMAILS
```

If your Umami account was created with «Sign in with Apple» or with Google, first give it a password from the Umami app (Account settings).

## Development

```bash
# from the root of the repository
npm ci
npm test        # tests with a fake in-memory Umami
npm run check   # TypeScript
npm run dev     # Worker running locally (http://localhost:8787)
```
