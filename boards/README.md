# ChatiChef boards

*Spanish version: [README.es.md](README.es.md)*

Two phone pages that work as **Claude artifacts** with a database (`window.claude.use("db")`). Outside claude.ai they don't save anything.

Both pages show themselves **in Spanish if the phone is in Spanish, and in English otherwise**. The data is the same in both languages: you can share a board between a Spanish phone and an English one.

## ChatiChef board (`board.html`)

Six tabs:

- **Today:** today's and tomorrow's dishes, what to take out of the freezer and what expires soon.
- **Summary:** the whole week on one phone screen: day, dish, kcal, protein and knife minutes, with a colour per type of protein.
- **Week:** each full recipe, with checkboxes on the ingredients. Buttons «Mark as done» (takes what you used off the pantry), «Move one day», «Swap with tomorrow», a 1–5 star rating and a comment. At the top, the **«Ask for the menu»** button for next week.
- **Pantry:** what's in the fridge, the freezer and two cupboards, with amount, expiry and opening date. Each product says how much is **free** and how much is **reserved**, and for which dishes.
- **Shopping:** the week's list, shared, with a counter. It adjusts itself to the pantry: if something is already at home it leaves the list, and if you're short of something you had, it comes in.
- **Notes:** the recipes you've made with their stars and comments, which Claude reads before repeating dishes.

Two weeks can be shown at once (the one that's ending and the new one).

## Foods board (`foods.html`)

- **Questions:** Claude leaves its questions about what you can eat here (with answers to tap and an optional note). You answer them whenever you like and Claude updates the project instructions.
- **Foods:** each person's list: what they can't have, what only in small amounts (and how much), what they don't like and what's fine.

## How to set them up

1. In a chat in your ChatiChef project, attach `board.html` and ask: «Publish this file as an artifact, as it is, with a database». Do the same with `foods.html`.
2. Copy the **link** and the **slug** it gives you and paste them into `skills/chatichef-board/SKILL.md` (and `SKILL.es.md`), under «Fixed data», before uploading the skill.
3. In `board.html`, change `COVERAGE` (at the start of the script) to the meals you usually cover, in both languages.
4. To share it with whoever cooks with you: from claude.ai, Share → invite by email **as Editor** (with a public link they can only look). They need a Claude account.
5. On the iPhone: open the link in Safari → Share → «Add to Home Screen».

## Collections

Identifiers are in English in both languages.

| Board | Collection | What it holds |
|---|---|---|
| ChatiChef | `config/current` | Main week, visible weeks, version and summaries |
| ChatiChef | `meals` | One document per dish and day (`meals/2026-11-19-dinner`) |
| ChatiChef | `shopping` | One line per product, `have` or `buy`, with the live-shopping fields |
| ChatiChef | `inventory` | What's at home, with amount, place, expiry and moves |
| ChatiChef | `requests` | Orders from the «Ask for the menu» button |
| ChatiChef | `alerts` | Expiry alerts already sent |
| Foods | `questions` | Claude's questions and your answers |
| Foods | `foods` | What each person can and can't eat |

The exact fields of the ChatiChef board are in `skills/chatichef-board/SKILL.md`. The foods board's:

```
questions/<id>: { order: 1, person: "me" | "partner" | "both", topic: "Dairy",
                  text: "…", why: "…", options: ["…", "…"],     // options: [] = free-text answer
                  status: "pending" | "answered", answer: "…", note: "…", answeredAt: "<ISO>" }
foods/<id>:     { name: "Green pepper", person: "me" | "partner" | "both",
                  status: "no" | "little" | "dislike" | "yes", amount: "25–30 g per person", note: "…", updatedAt: "<ISO>" }
```

`no` = can't have it · `little` = only a little (`amount` says how much) · `dislike` = doesn't like it · `yes` = no problem. Claude writes the questions (in the user's language) and the user answers them from the phone.
