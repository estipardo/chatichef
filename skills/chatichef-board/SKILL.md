---
name: chatichef-board
description: "ChatiChef: use it whenever you read from or write to the ChatiChef board (the artifact made from boards/board.html). Before planning or re-planning the menu (real pantry, dishes done, moved and rated), when loading a new week, when changing, moving or removing a dish, when redoing the shopping list and when updating the pantry. Gives the exact fields of config/current, meals, shopping and inventory, the write order, how to write with ifVersion without overwriting what the user ticks, and the final check. The menu lives in the board's database: never publish a new page per week."
---

# ChatiChef board: reading it and loading the menu

This skill is a procedure. **It adds to the ChatiChef project instructions; it does not replace them.** If something here clashes with the project instructions or with what the user asks at the moment, those win.

Goal: **the board always shows the agreed menu, complete, and nothing is left half-written**. If a write fails, **say so in the same reply**: what failed, what is already written and what is missing. Never hide it or assume it worked.

## Fixed data

- Artifact: slug `<YOUR-BOARD-SLUG>` · fixed link `<YOUR-BOARD-LINK>` (you get both when you publish `boards/board.html` as an artifact; put them here).
- Tools: `db_get`, `db_list`, `db_query`, `db_write` from the artifacts server (load them with ToolSearch if they are deferred).
- Do **not** publish another version of the page (`publish_version`, `publish_files`, `edit_version`) or create a new artifact for the menu. The menu is **data**: you only write documents. If the page itself needs a change, that's a different task: ask first.
- Collections: `config/current`, `meals`, `shopping`, `inventory`, `requests` (orders from the «Ask for the menu» button) and `alerts` (expiry alerts already sent).
- Week = the **Monday** date as `YYYY-MM-DD` (`2026-11-16`), even if the coverage starts on another day.
- Dates and times: the user's time zone. `updatedAt` in ISO with the real time of writing (`2026-11-15T22:45:00Z` or with an offset `+01:00`). Work out dates and weekdays with code, not in your head.
- The page shows itself in Spanish or English depending on the phone's language. **The data is not translated**: identifiers (`fridge`, `dinner`, `buy`…) are always the English ones below, and the texts you write (titles, steps, notes, shopping lines) go in the user's language.

## Write rules (the database enforces them)

1. **A document that already exists needs `ifVersion`.** Read it first (`db_get`, `db_list` or `db_query` give you its `version`). Without it, or if it changed, the whole call is rejected and nothing is written: read again and resend.
2. **A new document → `set` without `ifVersion`.**
3. On existing documents use **`update` or `merge` with only the fields that change**. `set` replaces the whole document and would wipe what the user wrote.
4. **Never touch** the fields the user writes from the phone: in `meals`, `status`, `used`, `rating`, `comment` and `movedFrom` (except when you move a dish yourself, see below); in `shopping`, `checked`. Don't delete a dish with `status: "done"` or a shopping line with `checked: true` either.
5. At most **50 operations per call**. A call with several operations is written whole or not at all. After a big call, wait 2 seconds before the next one.
6. Put an `idempotencyKey` on every call (e.g. `chatichef-2026-11-16-v1-meals`). If a call fails with a network error or gets cut off, **retry with the same key**: that way nothing is duplicated.

## 1. Before planning or re-planning: read the board

1. `db_get config/current` → current week and version.
2. `db_list inventory` with `limit: 1000` (if it returns `nextCursor`, keep paging to the end). This is what there **really** is:
   - `qty: null` = unknown amount: **ask for it** before sharing out the protein.
   - `expires`, `opened` and `note` decide the order of use (opened and thawed things first). In the freezer a past date is not a problem: it only counts once it is more than 2 months past.
   - Whatever is already **reserved** for pending dishes (see «Free and reserved») is not free: don't assign it twice.
   - `place`: `fridge`, `freezer`, `pantry` (shown as «Pantry 1») or `pantry-2` («Pantry 2»). When you say where something is, use the name the user sees.
3. `db_query meals` with `week == <current week>` → what is done (`status: "done"` and `used`, what it really used), what was moved (`date` different from the one in the id, and `movedFrom`) and what is still pending.
4. `db_query meals` with `status == "done"` → ratings (`rating`, `comment`) to decide repeats: repeat 4–5 star dishes; don't suggest 1–2 star ones without asking.
5. If there are moved dishes and you use reminders (see the project instructions), reschedule them to the new day.
6. «Pantry updated» is the most recent `updatedAt` in `inventory`. If the pantry hasn't been touched for days, ask before trusting it.
7. If the foods board exists (`boards/foods.html`), read its `foods` collection and the answered `questions`: they override whatever you remember.

Keep asking what the board doesn't know: meals eaten out, leftovers that aren't in the pantry, whether they want desserts.

## 2. Loading a new week

Do it **only once the user has accepted the menu** (or when you handle an order from the «Ask for the menu» button, see `docs/menu-request-button.md`). Before that:

- If the previous week still has `pending` dishes, **ask** whether to switch the board to the new week now or wait until the old one ends. The board shows the weeks in `config/current.week` and `config/current.weeks`.
- Have each recipe's numbers worked out with the `chatichef-nutrition` skill (kcal, prot) and its three times.

### Write order (so a week is never left half-written)

1. **`meals`** for the new week (one or more calls of ≤ 50).
2. **`shopping`** for the new week.
3. **`config/current` last**, with `update` + `ifVersion`. That is what switches the board to the new week: if anything before it fails, the board keeps showing the whole old week instead of half a new one.

### `meals/<date>-<slot>` (set)

Id: `meals/2026-11-19-dinner`, `meals/2026-11-21-lunch`. Desserts: `meals/<week>-dessert-1`, `-dessert-2`… If a recipe is eaten on two days (second serving), one document per day.

When a week is over, remove it from `config/current.weeks` (update with `ifVersion`).

```
{
  week: "2026-11-16",
  date: "2026-11-19",                  // null for desserts
  slot: "dinner" | "lunch" | "dessert",
  order: 0,
  for: "for 2" | "for <name>",         // free text, in the user's language
  servings: 2,                          // 1 for a single lunch for one person; for desserts, the servings it makes
  title: "Chicken chilindrón with potato",   // the same name as in Umami
  short: "Chicken chilindrón",          // ≤ ~45 characters, for the Summary tab
  protein: "meat" | "fish" | "egg" | "legume",   // border colour in Summary (fish includes seafood and tuna)
  badge: "Match 21:00",                 // optional; for desserts "Big" or "Quick"
  yield: "8 cups · 4 days",             // desserts only
  origin: "Based on … The change: …",   // traditional dish and what makes it healthy
  tag: "quick" | "medium" | "long",     // [Quick, <15 min] | [Medium, 20–40 min] | [Long]
  kcal: 415, prot: 42,                  // per serving, from chatichef-nutrition
  times: { knife: 14, fire: 38, total: 45, overlap: "What overlaps with what and which part of the heat time is waiting." },
  thaw: { date: "2026-11-18", text: "Move the chicken thighs to the fridge" },   // optional: the day to take something out of the freezer
  ingredients: [
    { text: "200 g frozen chopped pepper (all you have)", inv: "chopped-pepper", qty: 200 },
    { text: "400 g boneless, skinless chicken thighs (200 g per person)" }
  ],
  steps: ["One step per action, with its reason and its done sign…", "…"],
  notes: [ { title: "Per serving", text: "…" }, … ],
  status: "pending"
}
```

- `ingredients[].inv` = id of the `inventory` document it comes from, and `qty` **in that document's unit** (g, ml, pc, can…). Put it **only** on what they already have at home: it is what the board takes off when the user marks the dish as done. Check that the id exists in the inventory you read; if it doesn't, don't invent it.
- `notes`: use these titles, in this order, when they apply: «Repeated» (week it was made and what changes), «Per serving» (kcal, protein, amounts of protein and carbs per person, the dense stuff), «From your pantry» (which of their ingredients it uses and how much), «Shopping and dates», «Labels», «Common mistakes», «Leftovers», «Make ahead», «Pans and dishes». Write the titles in the user's language.
- Recipes are written the way the project instructions ask (detailed steps, visible signs, three times). This skill only says **where** they go.

### `shopping/<week>-<n>` (set)

```
{ week: "2026-11-16", order: 1, section: "Greengrocer", kind: "buy" | "have",
  text: "2 kg potatoes (~1.2 kg used)", dest: "Tu, We and Th dinner (200 g each)",
  store: "Lidl",   // only if it is NOT one of the usual supermarkets
  umamiItemId: "…", // written by the chatichef-save-to-umami skill when the line goes to the Umami list
  checked: false }
```

- `kind: "buy"` = what has to be bought; `kind: "have"` = what they already have, with `dest` saying where each thing goes.
- **Live shopping list:** every line that is a measurable product also carries these fields, and then the page adjusts the list by itself to what is in the Pantry (if it is already at home it leaves the list; if they are short of something they had, it comes in) and works out what is free and what is reserved:
  ```
  key: "prawns",                         // inventory id if there is one; otherwise a short name
  match: ["prawn","shrimp"], excl: ["burger"],   // lowercase words without accents to find it by name in the Pantry
  unit: "g" | "ml" | "pc" | "can" | "jar" | "pack", per: 250,   // per = grams per piece (optional)
  uses: [{m:"2026-11-25-dinner", q:350}] // dish in meals and amount in `unit`
  ```
  Several lines can share a `key` (e.g. «1 dozen eggs» to buy and «4 eggs» you have): their `uses` add up, so a given dish goes in only one of them. Lines that bundle several products («cornflour, erythritol and baking powder») go without `key`.
- `n` and `order` run from 1. Usual sections: Greengrocer, Butcher, Fishmonger, Deli, Frozen, Pantry, Fridge, Freezer (in the user's language).
- One line per product, with the units properly counted (two recipes with tinned chickpeas = 2 jars).

### `config/current` (update, last)

```
{ week: "2026-11-16", weeks: ["2026-11-09","2026-11-16"],   // weeks: weeks shown at the same time (the old one until it ends)
  label: "Week of 16 Nov", version: "v1", summaries: { "2026-11-16": "…" },
  summary: "~5 h of clock · ~1 h 55 of knife · 8 of 9 recipes under 15 min of knife · oven 0 times",
  updatedAt: "<ISO, real time>" }
```

«What you still have left» and how to keep it go in the chat reply (the board has no place for it).

## 3. Changing, moving or removing a dish mid-week

Read the document first (`db_get`) to get its `version`.

- **Change the recipe in the same slot**: `update` the same document with the new fields (title, origin, tag, kcal, prot, times, thaw, ingredients, steps, notes). Don't touch `status`, `used`, `rating` or `comment`.
- **Move it to another day or slot**: keep the id as it is (that's what the page's «Move one day» button does) and `update` `date` and/or `slot` plus `movedFrom: "<previous date>"`. Check that the new slot isn't taken by another pending dish; if it is, move that one too or ask.
- **Remove a dish**: `delete` with `ifVersion`, **only if it is `pending` and has no `rating`**. If it's already done, leave it.
- **Shopping**: add the new lines with the next free `n`; delete the ones no longer needed only if `checked: false`. If it was already ticked (bought), leave it and say so («you already bought this: it goes to…»). In the chat give the **top-up list**, not the whole shopping list again.
- **Always**, in the same call or right after: `update config/current` bumping `version` (v1 → v2) and `updatedAt`.
- When you change a confirmed dish, also sync Umami with the `chatichef-save-to-umami` skill (if you use it) and check that dish's reminders.

## 4. Pantry (inventory)

- **An amount the user gives in the chat**: `update` `qty` (in the document's unit), add a move at the end of `moves` (`{ at: "<ISO>", delta: <new - old>, why: "Changed from the chat" }`, keeping the existing ones) and `updatedAt` with the real time.
- **A new product or shopping done**: `set` `inventory/<slug>` (lowercase, no accents, hyphens: `frozen-peas`). If the slug already exists for another product, add a suffix.
  ```
  { name: "Frozen peas", qty: 400, unit: "g" | "ml" | "pc" | "can" | "jar" | "pack",
    place: "fridge" | "freezer" | "pantry" | "pantry-2",
    expires: "2027-03-10" | null, opened: "2026-11-17" | null, note: "",
    moves: [], updatedAt: "<ISO>" }
  ```
- **Don't take off** what a dish uses when you plan it: the page takes it off when the user marks it «Done». Only adjust by hand if they say in the chat that they used something outside the board.
- Every new item or change carries `updatedAt` with the real time: «Pantry updated» comes from it.

## 5. Final check (required)

1. `db_get config/current` → `week`, `version` and `updatedAt` are the new ones.
2. `db_query meals` with `week == <week>` → there is **exactly** one document per agreed recipe and day (no more, no fewer), each with `title`, `kcal`, `prot`, `times` and `steps`, and the dates fall on the right weekday.
3. `db_query shopping` with `week == <week>` → the expected number of lines and no duplicates.
4. Say it in **one line**: «Board: week of 16 Nov, v2 — 9 dishes and 27 shopping lines» with the link. If something couldn't be written, say so in that same line with what is missing.

## 6. Free and reserved (the page works it out)

The Pantry tab shows «Free X · reserved Y» on each product and, when you open it, which dishes it is reserved for. It comes from:

- the ingredients of pending `meals` with `inv` (what the dish takes from home), and
- shopping lines with `key` and `uses` whose product is already in the Pantry (what was bought for a dish).

It is allocated first to whatever expires first. That's why it matters to fill in `inv`, `qty`, `key` and `uses` properly: if they're missing, the page doesn't know something already has a dish.

## 7. Expiry alerts

A daily scheduled task (see `docs/reminders.md`) reads `inventory` and sends an email with what expires within 2 days (outside the freezer) and with what has been past its date in the freezer for more than 2 months. It records each alert sent in `alerts/exp-<id>-<expires>` (or `alerts/frz-<id>-<expires>`) so it isn't repeated. Don't touch that collection by hand.
