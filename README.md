# ChatiChef

*[Leer en español](README.es.md)*

A weekly cooking assistant built on a **Claude project**. It reworks everyday dishes into healthy versions (courgette lasagne, cashew béchamel, carbonara without cream…), builds the week's menu around what you already have in the fridge and gives you a shopping list with only what is missing.

What makes it different from asking a chat for recipes:

- **Honest times**: every recipe has three numbers (knife, heat and a realistic total), because stove time doesn't count peeling and chopping.
- **Calories worked out, not guessed**: a Python calculator adds up every spoonful of oil, checks your protein target and spots forbidden ingredients depending on who is eating.
- **Using up what you have**: it asks what is left over and how much, uses opened and thawed things first, and shopping becomes a top-up.
- **Recipes for beginners**: one step per action, the visible sign that something is done, and the usual mistakes.
- **Board on your phone** (optional): menu, pantry (with what is free and what is reserved for each dish), a shopping list that adjusts itself and ratings, synced with Claude. It shows in English or Spanish depending on your phone's language.
- **Foods board** (optional): what each person can and can't eat, and the questions Claude asks you along the way.
- **Email reminders** (optional): what is about to expire, when to get the shopping ready and when to take something out of the freezer.
- **Umami** (optional): saves confirmed recipes to your recipe book and meal plan, with its own connector included in this repository.

## What's here

| Folder | What it is |
|---|---|
| `instructions/project-instructions.md` | Template for the project instructions. Fill in whatever is in `[brackets]`. |
| `instructions/prep-times.md` | Table to estimate knife time. |
| `instructions/cooking-lessons.md` | Techniques that tend to go wrong and how to fix them. Keep adding your own. |
| `skills/chatichef-nutrition` | Skill + kcal and protein calculator (`scripts/chatichef_nutrition.py`) with your `profile.json`. |
| `skills/chatichef-board` | Skill to read from and write to the board. |
| `skills/chatichef-save-to-umami` | Skill to save recipes to Umami. |
| `boards/` | The weekly board and the foods board, to publish as artifacts. |
| `docs/` | The board's «Ask for the menu» button and the email reminders (expiry, shopping, thawing). |
| `umami-connector/` | MCP connector for Umami Recipes (recipe book, meal plan and grocery list), ready to deploy on Cloudflare. |

Every document has a Spanish copy next to it (`.es.md`), and every skill has a `SKILL.es.md`.

## How to set it up

1. **Create a project** in Claude (e.g. «ChatiChef»).
2. **Instructions**: copy `instructions/project-instructions.md` into the project instructions and fill in your details: how many of you there are, restrictions, what you don't eat, kitchen equipment, supermarkets. Remove the *(optional)* sections you don't use. If you want Claude to answer in Spanish, use `project-instructions.es.md` instead.
3. **Documents**: upload `prep-times.md` and `cooking-lessons.md` to the project (or their `.es.md` copies).
4. **Calculator profile**: copy `skills/chatichef-nutrition/scripts/profile.example.json` as `profile.json` in the same folder and set your forbidden foods and your targets. The ids are the ones in the script's table (`python3 chatichef_nutrition.py --list`).
5. **Skills**: run `./package-skills.sh` (or `./package-skills.sh --es` for the Spanish skills); it leaves one `.zip` per skill in `dist/`. Upload them as skills in Claude. If you don't use the board or Umami, upload only `chatichef-nutrition`.
6. **Boards** (optional): follow `boards/README.md`.
   Reminders (optional): follow `docs/reminders.md`.
7. **Umami** (optional): deploy the connector in `umami-connector/` following its README and add it to Claude. The `chatichef-save-to-umami` skill uses its recipe book, meal plan and grocery list tools.

Then, in a chat in the project: «Make me this week's menu». It will ask which meals to cover, which days you eat out and what is left over.

## Try the calculator

```bash
cd skills/chatichef-nutrition/scripts
cp profile.example.json profile.json
cat > /tmp/recipe.json <<'JSON'
{"name": "Chicken with potatoes", "servings": 2, "meal": "dinner", "week": "normal", "for": "everyone",
 "ingredients": [{"id": "chicken-thigh", "g": 400}, {"id": "potato", "g": 300},
                 {"id": "olive-oil", "tsp": 2, "note": "browning"}, {"id": "paprika"}]}
JSON
python3 chatichef_nutrition.py /tmp/recipe.json
```

The table values are averages (±10 %) from tables such as USDA or BEDCA. **This is not medical or nutritional advice**: if you have an allergy or intolerance, always check the label yourself.

## Licence

[MIT](LICENSE).

## Using it with AIs other than Claude

ChatiChef is built with Claude, but **almost everything is plain text**, so it works with other AIs (ChatGPT, Gemini…). You don't need to know how to code. This is what works outside Claude:

| Part | Does it work in another AI? |
|---|---|
| Instructions (`project-instructions.md`) | **Yes.** It is the most important part and works in any AI with «projects», «custom instructions» or «Gems». |
| Prep times and cooking lessons | **Yes.** They are uploaded as files. |
| Calorie calculator (`chatichef_nutrition.py`) | **Yes, if the AI can run Python code.** ChatGPT can; for others, it depends. If not, the AI will estimate the numbers (less accurate). |
| Skills (`skills/…/SKILL.md`) | **Partly.** Other AIs don't trigger them on their own, but you can upload them as normal files and tell it when to read them (the text is below). |
| Umami connector | **Only if the AI supports MCP connectors** (an open standard for connecting apps). ChatGPT does, with limits depending on the plan. |
| Boards (weekly and foods) | **No.** They use Claude's database. There are alternatives below. |
| Email reminders | **It depends** on whether the AI has scheduled tasks. If not, use your phone's reminders. |

### Step 1. Download the files

1. On this GitHub page, press the green **«Code»** button and then **«Download ZIP»**.
2. Open the downloaded file (double-click) to unzip it. You get a `chatichef-main` folder with everything.

Files ending in `.md` are plain text: they open in Notepad (Windows), TextEdit (Mac) or any text editor.

### Step 2. Prepare your instructions

1. Open `instructions/project-instructions.md` (or `.es.md` for Spanish).
2. Fill in everything in `[brackets]`: how many of you there are, what you can't eat, what you have in the kitchen, where you shop… If a sentence doesn't apply to you, delete it.
3. **Delete these sections**, which only work in Claude: «Saving recipes to Umami» (unless you connect Umami, step 5) and «Reminders».
4. In the «Format of the weekly proposal» section, delete the two paragraphs that start with *(If you use the board)* and *(If not)* and put this instead:
   > Give me the menu in the chat, with each recipe under a heading with the day and the meal. At the end, the shopping list grouped by supermarket section, as a checklist I can copy.
5. At the very end, paste this block (change the names if you rename the files):
   > **How to use the project files.** Before giving the calories or protein of any recipe, read `chatichef-nutrition.md` and run `chatichef_nutrition.py` as it explains (with my `profile.json`); never work it out in your head. For times, use the table in `prep-times.md`. Before suggesting a technique, check `cooking-lessons.md`.

### Step 3. Create the project in your AI

**In ChatGPT:**

1. In the sidebar, look for **«Projects»** and create a new one called «ChatiChef».
2. In the project settings, paste your instructions (step 2) into the **instructions** field.
3. Upload as **project files**:
   - `instructions/prep-times.md`
   - `instructions/cooking-lessons.md`
   - `skills/chatichef-nutrition/SKILL.md` (rename it to `chatichef-nutrition.md` first so it's clear what it is)
   - `skills/chatichef-nutrition/scripts/chatichef_nutrition.py`
   - your `profile.json` (step 4)

**In Gemini:** create a **Gem** («Gems» in the menu), paste the instructions into its description and add the same files as knowledge. If your account can't run the script, remove the sentence about the script from the block in step 2.5: the AI will estimate the numbers.

**In any other AI:** look for something like «project», «custom assistant» or «custom instructions». What matters is that the instructions stay saved and that it can read the files.

### Step 4. Your calculator profile

1. Copy `skills/chatichef-nutrition/scripts/profile.example.json` and call the copy `profile.json`.
2. Open it in the text editor and change:
   - in `forbidden`, what nobody can eat (`everyone`) and what each person can't (put your names instead of `ana` and `luis`);
   - in `targets`, the minimum calories, the maximum calories and the minimum protein for each meal.
3. Ingredient names must be the calculator's. If you don't know what one is called, ask the AI: «what is tuna called in the calculator's table?» (it can run `python3 chatichef_nutrition.py --list tuna`).

### Step 5 (optional). Umami in ChatGPT

1. Deploy the connector following `umami-connector/README.md` (it's free and you don't need to install anything if you use the Cloudflare dashboard).
2. In ChatGPT, look in the settings for the option to **add your own MCP server** (usually under «Apps», «Connectors» or «Plugins»; on some plans you first have to turn on «developer mode»).
3. Paste your connector's address ending in `/mcp` and sign in with your Umami email and password.
4. Also upload `skills/chatichef-save-to-umami/SKILL.md` as a file and add to your instructions: «When I confirm the recipes, save them to Umami following `chatichef-save-to-umami.md`».

If your plan doesn't let you connect it, ask for the recipes in the chat and copy them to Umami by hand.

### Step 6. Use it

Write in the project: **«Make me this week's menu»**. It will ask which meals to cover, which days you eat out and what is left over. When you agree, ask it for the shopping list.

### What you won't have without Claude, and how to manage

- **Weekly board:** ask for the menu and the shopping in the chat and keep them wherever you already look (your phone's Notes, Google Keep, Umami). For the pantry, tell it at the start of each week: «This is what I have at home: …».
- **Foods board:** put what you can't eat straight into the instructions. When the AI asks you questions, add your answers to the instructions so they aren't forgotten.
- **Reminders:** when it gives you the menu, ask the AI for a list of reminders with a day and time («take the chicken out of the freezer on Wednesday at 21:30») and create them on your phone.

### Words that may sound odd

- **`.md` file (Markdown):** plain text with a few symbols for headings (`#`) and lists (`-`).
- **Python / script:** a small program. The calculator is one: it adds up calories instead of the AI guessing them.
- **Skill:** an instructions file for a specific task. Claude reads them on its own; other AIs, when you ask them to.
- **MCP / connector:** the standard way for an AI to talk to another app (here, Umami).
- **Artifact:** a page that Claude publishes and that you can open on your phone. The boards are artifacts.
