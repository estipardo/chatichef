# Email reminders (optional)

*Spanish version: [reminders.es.md](reminders.es.md)*

ChatiChef can remind you of three things. All three are **Claude scheduled tasks** (Claude runs them by itself, at their time) that read the board and send you an email. In the examples the email goes out through Home Assistant; if you don't use it, replace that step with the Gmail connector or a phone reminder.

To create a scheduled task, write in a chat in the ChatiChef project: «Create a scheduled task that runs every day at 18:47 with these instructions:» and paste the text.

## 1. What is about to expire

Every day at the same time. Rules:

- **Fridge and pantry:** remind when there are 2 days or fewer left.
- **Freezer:** frozen food no longer expires on its original date, so it only reminds if the date passed **more than 2 months ago**.
- A single email with everything, and only if there is something to say.
- For each product it says whether it already has a dish on the menu or not.

> ChatiChef task: email me about what is about to expire. Work on your own and finish.
> 1. Read the collections inventory, meals and alerts from the ChatiChef board (`<YOUR-BOARD-LINK>`).
> 2. With code, work out today's date and keep the inventory products with qty other than 0 and with expires: outside the freezer (place other than "freezer"), if there are 2 days or fewer left (including what expired in the last 3 days); in the freezer, only if expires passed more than 60 days ago. Drop those that already have a document alerts/exp-<id>-<expires> (or alerts/frz-<id>-<expires>). If none are left, finish without sending anything.
> 3. For each one, check whether a pending dish in meals uses it (an ingredient with inv equal to its id).
> 4. Send me ONE email with all of them: subject «🥫 Expiring soon: <the first one> and <n> more»; one line per product with amount, where it is and when it expires, and below it whether it already has a dish or not. At the end, the board link.
> 5. If the email went out, record each product in alerts/exp-<id>-<expires> (or alerts/frz-…) with {type, inv, expires, sentAt}, so the alert isn't repeated.
> Never change inventory, meals or shopping.

## 2. Getting the shopping ready

It isn't a separate task: it goes in the «menu ready» email of the task behind the «Ask for the menu» button (see `menu-request-button.md`). That email says how many things need buying, lists them by supermarket section and reminds you that the checklist is in the Shopping tab.

## 3. Thawing

When a menu is loaded, Claude creates a reminder for each dish that needs something taken out of the freezer: the evening before (or a day and a half before if the dish is prepared the previous afternoon). With Home Assistant this is done with a reminders calendar; without it, ask Claude to create reminders on your phone.
