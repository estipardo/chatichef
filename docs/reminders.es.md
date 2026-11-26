# Avisos por correo (opcional)

*Versión en inglés: [reminders.md](reminders.md)*

ChatiChef puede avisarte de tres cosas. Las tres son **tareas programadas de Claude** (Claude las ejecuta solo, a su hora) que leen el tablero y te mandan un correo. En los ejemplos el correo sale por Home Assistant; si no lo usas, cambia ese paso por el conector de Gmail o por un recordatorio del móvil.

Para crear una tarea programada, en un chat del proyecto ChatiChef escribe: «Crea una tarea programada que se ejecute todos los días a las 18:47 con estas instrucciones:» y pega el texto.

## 1. Lo que caduca

Todos los días a la misma hora. Reglas:

- **Nevera y despensa:** avisa cuando faltan 2 días o menos.
- **Congelador:** congelado ya no caduca en su fecha original, así que solo avisa si la fecha pasó hace **más de 2 meses**.
- Un solo correo con todo, y solo si hay algo que contar.
- Para cada producto dice si ya tiene plato en el menú o no.

> Tarea de ChatiChef: avisarme por correo de lo que va a caducar. Trabaja sola y termina.
> 1. Lee del Tablero ChatiChef (`<ENLACE-DE-TU-TABLERO>`) las colecciones inventory, meals y alerts.
> 2. Con código, calcula la fecha de hoy y quédate con los productos de inventory con qty distinto de 0 y con expires: fuera del congelador (place distinto de "freezer"), si faltan 2 días o menos (incluido lo caducado en los últimos 3 días); en el congelador, solo si expires pasó hace más de 60 días. Quita los que ya tengan un documento alerts/exp-<id>-<expires> (o alerts/frz-<id>-<expires>). Si no queda ninguno, termina sin mandar nada.
> 3. Para cada uno, mira si algún plato de meals sin hacer lo usa (un ingrediente con inv igual a su id).
> 4. Mándame UN correo con todos: asunto «🥫 Caduca pronto: <el primero> y <n> más»; una línea por producto con cantidad, dónde está y cuándo caduca, y debajo si ya tiene plato o no. Al final, el enlace del tablero.
> 5. Si el correo ha salido, apunta cada producto en alerts/exp-<id>-<expires> (o alerts/frz-…) con {type, inv, expires, sentAt}, para no repetir el aviso.
> Nunca cambies inventory, meals ni shopping.

## 2. Preparar la compra

No es una tarea aparte: va en el correo de «menú listo» de la tarea del botón «Pedir el menú» (ver `menu-request-button.es.md`). Ese correo dice cuántas cosas hay que comprar, las lista por sección del súper y recuerda que la lista con casillas está en la pestaña Compra.

## 3. Descongelar

Al cargar un menú, Claude crea un aviso por cada plato que necesita bajar algo del congelador: la víspera por la noche (o un día y medio antes si el plato se prepara la tarde anterior). Con Home Assistant se hace con un calendario de avisos; sin él, pide a Claude que te cree recordatorios en el móvil.
