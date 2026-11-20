# Botón «Pedir el menú» del tablero (opcional)

En la pestaña **Semana** del tablero hay un botón para pedir el menú de la semana siguiente sin abrir el chat. La página no monta el menú: solo deja un pedido en la base de datos, y una **tarea programada** de Claude lo atiende.

## Qué escribe la página

`requests/menu-<lunes>`:

```
{ type: "menu", week: "2026-11-23", status: "pending",
  coverage: "<COBERTURA de tablero.html>", postres: true,
  notes: "Lo que escribas en «Notas para Claude»", requestedAt: "<ISO>" }
```

Estados que enseña la página: `pending` (Pedido) · `working` (Montándose, con `startedAt`) · `done` (Listo, con `doneAt`) · `error` (con `error`). En `pending` y `error` se puede borrar el pedido.

## La tarea programada

Créala desde un chat del proyecto ChatiChef («crea una tarea programada que…»), cada hora en el horario que quieras, con un texto como este:

> Proyecto ChatiChef. Lee `requests` del Tablero ChatiChef (skill `chatichef-tablero`). Si no hay ningún pedido con `status: "pending"`, termina sin hacer nada. Si hay uno: márcalo `working` con `startedAt`; monta el menú de esa semana siguiendo las instrucciones del proyecto, con la cobertura, los postres y las notas del pedido, y los números de la skill `chatichef-nutricion`; cárgalo en el tablero (meals, shopping y config/current, en ese orden); marca el pedido `done` con `doneAt`. Si algo falla, márcalo `error` con el motivo. No guardes nada en Umami: eso se hace cuando lo confirme en el chat.

Si además tienes una tarea que monta el menú sola cada domingo, añádele un paso 0: si la semana siguiente ya tiene `meals` o un `requests/menu-<lunes>`, no hace nada.
