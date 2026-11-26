---
name: chatichef-save-to-umami
description: "ChatiChef: use it as soon as the user confirms they agree with the recipes (the week's or a single one), and every time they change, move or remove an already confirmed recipe. Saves each recipe in the Umami recipe book (without creating duplicates) with its name, tags, times, kcal and notes, puts it in the meal plan on the exact date and slot, copies the board's shopping list to an Umami grocery list (and keeps it up to date). Nothing is saved before the user confirms. Needs the connector in umami-connector/."
---

# Saving confirmed recipes to Umami

This skill is a procedure. **It adds to the ChatiChef project instructions; it does not replace them.** If something here clashes with the project instructions or with what the user asks at the moment, those win.

Goal: **every confirmed recipe is in the recipe book exactly once and on its day and slot in the plan**, with no duplicates or stale entries. If something can't be saved, **say so clearly in the same reply**: which recipe, which step and what the user has to do. Never assume it worked.

## Set this up once

Put the names you use in Umami here (the ids are looked up automatically):

- Recipe book: **«ChatiChef recipes»** (change it if you use another one).
- Meal plan: **«Lunch and dinner»** (change it if you use another one).
- Grocery list: **«ChatiChef shopping»** (create it in the Umami app and share it with whoever does the shopping).

Write the recipes, tags and notes in the user's language.

## When

- **Only after the user confirms** («ok», «agreed», «perfect», «save them»). A question or a change to the proposal is not a confirmation. If it isn't clear, ask.
- Without being asked: the confirmation is already the order.
- Also when they change, move or remove a recipe that was already saved.

## Data to look up

- Tools: the Umami connector's tools (their prefix depends on the name you gave the connector in Claude, e.g. `mcp__Umami__*`; load them with ToolSearch if they are deferred).
- `recipeBookId`: with `list_recipe_books`, by the exact name of the recipe book. All recipes go there, desserts too.
- `mealPlanId`: with `list_meal_plans`, by the exact name of the plan. Always pass it.
- Plan slots: **lunch = `LUNCH`** · **dinner = `DINNER`**. Desserts don't go in the plan.
- `find_recipes` accepts `tags` (all must match) and `query`. The plan is changed with `add_meal_plan_item`, `update_meal_plan_item` and `remove_meal_plan_item`.

## Step 0. Table of what will be saved

Before calling anything, build (for yourself) one row per recipe and day:

| date YYYY-MM-DD | day («Wednesday 18») | slot (LUNCH/DINNER/dessert) | meal tag | exact name |

- **Work out the date with code** from the menu and check that it falls on the right weekday, especially in split weeks or weeks that start mid-week.
- A recipe eaten on two days (second serving) = **one recipe and two rows**.
- Meal tag: «Dinner», «Lunch» or whatever you use. Desserts: «Desserts».

## Step 1. Does it already exist? (avoid duplicates)

For each recipe:

1. `find_recipes` with `query` = the beginning of the name, and the `recipeBookId`.
2. **Fixed recipes** (the ones the user always makes the same way; list them in the project instructions): **use the existing one**, never create another.
3. **A repeat** from another week with the same name → use that same one (edit it if something changes).
4. If **two or more with the same name** come up, use the most recent (`updated`) and say which ones are spare so the user can delete them in the app.
5. Only if it doesn't exist → create it.

## Step 2. Create or edit the recipe

### Fields

- `name`: the same name as in the menu. **At most 60 characters**: if longer, cut it from the end.
- `servings`: «2 servings» / «1 serving» / for desserts, the number it makes.
- `activeTime`: the **knife** minutes («14 min»). `totalTime`: the **realistic total** («45 min»).
- `nutritionInformation`: `{ "Calories": "~415 kcal per serving", "Protein": "~42 g per serving" }`, with the numbers from the `chatichef-nutrition` skill.
- `ingredients`: one ingredient per paragraph (separated by a blank line), with the amount first.
- `directions`: numbered list `1. …`, one step per action.
- `notes`: paragraphs separated by a blank line, in this order and only those that apply:
  1. `Wednesday 18 · dinner · for 2`
  2. `Times: knife X min · heat Y min · total ~Z min. <what overlaps with what>. Washing up not included.`
  3. The traditional dish it is based on and the change that makes it healthy.
  4. `Repeated: …` (week it was made and what changes).
  5. `Per serving: ~kcal and ~g of protein. <amounts per person and the dense stuff>.`
  6. `Shopping and dates: …` · `From your pantry: …` · `Labels: …`
  7. `Common mistakes: …` · `Leftovers: …` · `Make ahead: …` · `Pans and dishes: …`
- `tags`: `["<Day> <n>", "Week <d> <month> <yyyy>", "<meal>", "ChatiChef"]`, e.g. `["Thursday 19", "Week 16 Nov 2026", "Dinner", "ChatiChef"]`. The week is the **Monday's**, with the month in three letters. Desserts: `["Week 16 Nov 2026", "Desserts", "ChatiChef"]`. Always use the same format, so the recipes can be found by tag.

### New recipe

`create_recipe` with everything above. **If the call fails or gets cut off, before retrying search with `find_recipes`** whether it was created; if it was, edit it instead of creating another.

### Recipe that already exists

- `get_recipe` to see its current tags. `edit_recipe` **replaces the whole tag list**: remove only the old date tags («Week …» or a weekday followed by a number) and the meal tags, add the new ones and **keep the rest**.
- **Fixed recipe**: don't change ingredients or steps unless the user asked to change the recipe itself.
- **Repeat with changes**: update the fields that change. If an earlier number was wrong, say so in the chat with the corrected one.
- Avoid `add_recipe_photo`: when a photo is uploaded, the Umami app re-saves the recipe and loses the nutrition information and the numbering of the steps.

## Step 3. Put it in the plan

1. `get_meal_plan_items` with `mealPlanId`, `from` = first day and `to` = last day of the coverage.
2. For each row of the table in step 0 (except desserts):
   - There is already an entry with **the same recipe, date and slot** → do nothing.
   - That day and slot has an entry for **another recipe that came from this menu** → `update_meal_plan_item` pointing to the new recipe.
   - That day and slot has an entry **the user added** that doesn't come from the menu → **don't touch it**: ask.
   - There's nothing → `add_meal_plan_item` with `recipeId`, `date`, `meal` and `mealPlanId`.

## Step 4. Grocery list in Umami

If you use the board, when the user confirms a week's menu copy the board's shopping list to the Umami list (`groceryListId`: find it with `list_grocery_lists` by its name).

1. **Clear what was already bought in previous weeks:** `get_grocery_list` and remove with `remove_grocery_items` the items marked as bought (`completed: true`) whose id is in the `umamiItemId` field of a `shopping` line from previous weeks. Never remove what was added by hand or what is still unbought.
2. **Read the week's shopping:** `db_query shopping` with `week == <Monday>`. The lines that go to Umami are `kind: "buy"` with `checked: false`, except those already covered by what is in `inventory` (what the board shows as «Already at home»).
3. **One line = one item** in `add_grocery_items` (all in one call): `name` without amount («Potatoes»), `quantity` («2 kg»; if it is from another shop, «2 kg · Lidl»), `aisle` = the board's `section`, and `recipeId`/`recipeName` only if the line is for a single dish.
4. **Save the link:** `update` each `shopping/<id>` with `umamiItemId` (with `ifVersion`, without touching `checked`). If an item comes back in `skipped`, find its id with `get_grocery_list` and save it anyway.
5. What is ticked as bought on the board (`checked: true`) is also marked in Umami with `update_grocery_items` (`completed: true`). Not the other way round.

## Changes after confirming

- **Another day or another meal**: `update_meal_plan_item` (new `date` and/or `meal`) **and** change the recipe's day and meal tags.
- **Another recipe in that slot**: save the new one and point the plan entry to it. If the old one is no longer used, remove this week's tags from it.
- **Another amount or version of the same recipe**: `edit_recipe` on the same one; never a second recipe.
- **A dish is dropped and has nowhere to go**: remove its entry with `remove_meal_plan_item` and say so in the final line.
- **Shopping:** new line → `add_grocery_items` and save its `umamiItemId`; removed line → `remove_grocery_items` if it is still unbought in Umami; different amount → `update_grocery_items`.
- If you use the board, keep it in step (skill `chatichef-board`).

## Final check (required)

1. `get_meal_plan_items` for the range again and compare it with the table from step 0: **each day and slot has exactly its recipe**.
2. For the recipes created or edited, check with `find_recipes` that there is **only one** with that name and with this week's tags.
3. `get_grocery_list`: each «buy» line that had to go is there exactly once.
4. Say in **one line** what you added and where: «Umami: 9 recipes in «ChatiChef recipes» (4 new, 5 reused), 9 entries in «Lunch and dinner» (Wed 18 → Sun 22) and 21 items in «ChatiChef shopping»». If something failed, say so in that same line.
