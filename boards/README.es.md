# Tableros de ChatiChef

*Versión en inglés: [README.md](README.md)*

Dos páginas para el móvil que funcionan como **artifacts de Claude** con base de datos (`window.claude.use("db")`). Fuera de claude.ai no guardan nada.

Las dos páginas se ven **en español si el móvil está en español, y en inglés si no**. Los datos son los mismos en los dos idiomas: se puede compartir un tablero entre un móvil en español y otro en inglés.

## Tablero ChatiChef (`board.html`)

Seis pestañas:

- **Hoy:** los platos de hoy y mañana, lo que toca bajar del congelador y lo que caduca pronto.
- **Resumen:** la semana entera en una sola pantalla del móvil: día, plato, kcal, proteína y minutos de cuchillo, con un color por tipo de proteína.
- **Semana:** cada receta completa, con casillas en los ingredientes. Botones «Marcar como hecha» (descuenta de la despensa lo que has usado), «Correr un día», «Cambiar con mañana», nota de 1 a 5 estrellas y comentario. Arriba, el botón **«Pedir el menú»** de la semana siguiente.
- **Despensa:** lo que hay en la nevera, el congelador y dos armarios, con cantidad, caducidad y fecha de apertura. Cada producto dice cuánto está **libre** y cuánto **reservado**, y para qué platos.
- **Compra:** la lista de la semana, compartida, con contador. Se ajusta sola a la despensa: si algo ya está en casa sale de la lista, y si falta de lo que tenías, entra.
- **Notas:** las recetas hechas con sus estrellas y comentarios, que Claude lee antes de repetir platos.

Se pueden ver dos semanas a la vez (la que acaba y la nueva).

## Tablero de alimentos (`foods.html`)

- **Preguntas:** Claude deja aquí sus dudas sobre lo que podéis comer (con respuestas para tocar y una nota opcional). Las contestas cuando quieras y Claude actualiza las instrucciones del proyecto.
- **Alimentos:** la lista de cada persona: lo que no puede tomar, lo que solo en poca cantidad (con cuánto), lo que no le gusta y lo que sí.

## Cómo montarlos

1. En un chat de tu proyecto ChatiChef, adjunta `board.html` y pide: «Publica este archivo como artifact, tal cual, con base de datos». Haz lo mismo con `foods.html`.
2. Copia el **enlace** y el **slug** que te dé y pégalos en `skills/chatichef-board/SKILL.es.md` (y en `SKILL.md`), en «Datos fijos», antes de subir la skill.
3. En `board.html`, cambia `COVERAGE` (al principio del script) por las comidas que sueles cubrir, en los dos idiomas.
4. Para compartirlo con quien cocine contigo: desde claude.ai, Compartir → invitar por correo **como Editor** (con enlace público solo puede mirar). Necesita cuenta de Claude.
5. En el iPhone: abre el enlace en Safari → Compartir → «Añadir a pantalla de inicio».

## Colecciones

Los identificadores van en inglés en los dos idiomas.

| Tablero | Colección | Qué guarda |
|---|---|---|
| ChatiChef | `config/current` | Semana principal, semanas visibles, versión y resúmenes |
| ChatiChef | `meals` | Un documento por plato y día (`meals/2026-11-19-dinner`) |
| ChatiChef | `shopping` | Una línea por producto, `have` (tengo) o `buy` (falta), con los campos de la compra viva |
| ChatiChef | `inventory` | Lo que hay en casa, con cantidad, sitio, caducidad y movimientos |
| ChatiChef | `requests` | Pedidos del botón «Pedir el menú» |
| ChatiChef | `alerts` | Avisos de caducidad ya enviados |
| Alimentos | `questions` | Las dudas de Claude y tus respuestas |
| Alimentos | `foods` | Qué puede y qué no puede comer cada persona |

Los campos exactos del Tablero ChatiChef están en `skills/chatichef-board/SKILL.es.md`. Los del tablero de alimentos:

```
questions/<id>: { order: 1, person: "me" | "partner" | "both", topic: "Lácteos",   // me = tú, partner = tu pareja, both = los dos
                  text: "…", why: "…", options: ["…", "…"],     // options: [] = respuesta libre
                  status: "pending" | "answered", answer: "…", note: "…", answeredAt: "<ISO>" }
foods/<id>:     { name: "Pimiento verde", person: "me" | "partner" | "both",
                  status: "no" | "little" | "dislike" | "yes", amount: "25–30 g por persona", note: "…", updatedAt: "<ISO>" }
```

`no` = no puede tomarlo · `little` = solo en poca cantidad (`amount` dice cuánto) · `dislike` = no le gusta · `yes` = sin problema. Claude escribe las preguntas (en el idioma del usuario) y el usuario las contesta desde el móvil.
