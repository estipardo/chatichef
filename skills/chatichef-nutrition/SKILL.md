---
name: chatichef-nutrition
description: "ChatiChef: use it ALWAYS before giving the kcal or protein of any recipe (new, repeated, changed, re-planned, single lunch, double session or dessert). Runs a Python calculator with an ingredient table instead of guessing: counts every spoonful of oil, measures the calorie-dense stuff, checks the target, spots forbidden ingredients depending on who eats, warns about two starches and flags when a number doesn't match the one given before."
---

# Calories and protein: the ChatiChef calculator

This skill is a procedure. **It adds to the ChatiChef project instructions; it does not replace them.** If something here clashes with the project instructions or with what the user asks at the moment, those win.

Why it exists: numbers guessed from memory go wrong, mostly because not all the oil gets counted (some lentils given as ~530 kcal were ~600). **No kcal or protein number comes from memory**: it comes from this calculator.

## Before you start: the profile

The script reads `profile.json` (next to it) or the one passed with `--profile`. It holds the forbidden ingredients (for everyone and per diner), the kcal and protein target per week type and meal, and the starches that don't go at dinner. If it doesn't exist, copy `scripts/profile.example.json` to `/tmp/chatichef/profile.json` and fill it in with the restrictions in the project instructions.

## How to use it

1. Copy `scripts/chatichef_nutrition.py` from this skill to `/tmp/chatichef/` (and the profile, if it isn't there).
2. For each recipe, write a JSON in `/tmp/chatichef/<id>.json` (format below) with **the recipe's total amounts** and the number of servings.
3. Run `python3 /tmp/chatichef/chatichef_nutrition.py /tmp/chatichef/<id>.json`. For a whole week, loop over all the JSON files.
4. If it says `ERROR`, **fix it and run it again**. Never give a number from a run with an error.
5. Use the rounded numbers from «PER SERVING» (`~415 kcal · ~42 g`) in the recipe, the board and Umami. They are the same in all three places.
6. `python3 /tmp/chatichef/chatichef_nutrition.py --list <text>` shows the ids it knows (e.g. `--list tuna`). The Spanish ids of the Spanish version also work (`atun-lata`, `contramuslo-pollo`…).

### JSON format

```json
{
  "name": "Chicken chilindrón with potato",
  "servings": 2,
  "meal": "dinner",
  "week": "normal",
  "for": "everyone",
  "ingredients": [
    {"id": "chicken-thigh", "g": 400},
    {"id": "potato", "g": 200},
    {"id": "frozen-pepper", "g": 200},
    {"id": "carrot", "pc": 1},
    {"id": "garlic", "g": 10},
    {"id": "tomato-paste", "tbsp": 2},
    {"id": "olive-oil", "tsp": 1, "note": "brown the chicken"},
    {"id": "olive-oil", "tsp": 1, "note": "sofrito"},
    {"id": "paprika"}, {"id": "water", "ml": 300}
  ],
  "custom": {"vegan-cheese": {"kcal": 280, "protein": 2, "fat": 22, "carbs": 18, "source": "label"}},
  "previous": {"kcal": 415, "protein": 42}
}
```

- `meal`: `dinner` · `lunch` · `dessert`.
- `week`: any key of `targets` in the profile (`normal`, `light`, `light_dinner`…) or `no_target` (desserts).
- `for`: `everyone` (checks every diner's forbidden list) or the name of one diner in the profile (checks the common list and theirs).
- Amounts: `g`, `ml`, `pc` (pieces with a known weight: egg, carrot, tomato, can of tuna…), `tbsp` (15 ml), `tsp` (5 ml). Trivial things (salt, spices, water, vinegar, bay leaf, erythritol, stevia…) can go without an amount: they count as 0.
- `custom`: any product that isn't in the table or whose **label** you have. Values per 100 g (or per 100 ml with `"per": "ml"`). The label beats the table.
- `previous`: the number given before for **this same recipe**. Always add it when you repeat, change or re-plan a recipe.

## Rules when filling it in

- **Oil: one entry per use** (sofrito, browning, frying the eggs, setting the omelette, dressing, greasing), with its `note`. When frying, the oil that counts is what is **absorbed**, not what is in the pan: in a well-drained potato omelette, ~10 g per person.
- Weights **raw** and in the form they are bought: dried pulses from a packet, drained pulses from a jar; rice and pasta raw; cashews raw even if they are boiled later.
- **Eggs**: `egg` = 55 g without the shell. If you know the size, `egg-m` (50 g) or `egg-l` (60 g).
- **Tuna**: `tuna-can` = a small can with 52 g drained. If the can is different, use `g`.
- **Real protein, not the theoretical one**: if the tray weighs 580 g and the dish uses 300 g, put 300 g.
- A dessert goes with the defined servings it makes («8 cups» = 8).
- **Double session**: one JSON per recipe, never together.

## What to say with the result

- Per serving: **~kcal and ~g of protein**, and the **per-person amounts of protein and carbs**.
- **The dense stuff**: what comes out under «Calorie-dense per serving», in grams or ml and kcal.
- **Target**: if it says «ABOVE» or «BELOW», say so with the number; if the protein falls short, **boost it before proposing** the dish or say so explicitly.
- **CORRECTION**: if it appears, say it like this or similar: «Before I said ~530 kcal and 34 g; properly counted it's ~600 kcal and 34 g», and use the new one everywhere.
- **CHECK** (two starches, or a lunch-only starch at dinner): fix it, unless it is a fixed recipe or the user asked for it; in that case, one line saying so.
- Labelling **notes**: move them to the recipe's «Labels» note.
- The table values are averages (±10 %). Don't give decimals: «~415 kcal», «~42 g».

## If the table is missing something

1. Look for an alias with `--list`.
2. If it is a bought product with a label, use `custom` with the label's values.
3. If it is a generic food that is missing, use `custom` with an average value from an official table (USDA, BEDCA or your country's) and `"source": "USDA"`, and say so.
4. **Never** remove it from the recipe to avoid the error, or count it as 0.
