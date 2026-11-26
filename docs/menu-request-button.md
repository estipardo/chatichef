# The board's «Ask for the menu» button (optional)

*Spanish version: [menu-request-button.es.md](menu-request-button.es.md)*

In the board's **Week** tab there is a button to ask for next week's menu without opening the chat. The page doesn't build the menu: it only leaves an order in the database, and a Claude **scheduled task** picks it up.

## What the page writes

`requests/menu-<Monday>`:

```
{ type: "menu", week: "2026-11-23", status: "pending",
  coverage: "<COVERAGE from board.html>", desserts: true,
  notes: "Whatever you write in «Notes for Claude»", requestedAt: "<ISO>" }
```

States the page shows: `pending` (Ordered) · `working` (Being made, with `startedAt`) · `done` (Ready, with `doneAt`) · `error` (with `error`). While `pending` or `error`, the order can be deleted.

## The scheduled task

Create it from a chat in the ChatiChef project («create a scheduled task that…»), every hour during the hours you like, with a text like this:

> ChatiChef project. Read `requests` from the ChatiChef board (skill `chatichef-board`). If there is no order with `status: "pending"`, finish without doing anything. If there is one: mark it `working` with `startedAt`; build that week's menu following the project instructions, with the order's coverage, desserts and notes, and the numbers from the `chatichef-nutrition` skill; before that, read the whole board (pantry, what is already reserved for pending dishes, notes and ratings). Load it on the board (meals with `short` and `protein`, shopping with the live-shopping fields, and config/current last); schedule the thawing reminders; mark the order `done` with `doneAt`. If something fails, mark it `error` with the reason. Finally, send me an email «🍽️🛒 Menu ready: time to get the shopping ready» saying: check it in the Summary tab, how many things need buying listed by supermarket section, how many come from home, and the link to the Shopping tab. Don't save anything to Umami: that happens when I confirm it in the chat.

If you also have a task that builds the menu by itself every Sunday, add a step 0 to it: if next week already has `meals` or a `requests/menu-<Monday>`, it does nothing.
