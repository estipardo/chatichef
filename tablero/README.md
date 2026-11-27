# Tableros de ChatiChef

Dos páginas para el móvil que funcionan como **artifacts de Claude** con base de datos (`window.claude.use("db")`). Fuera de claude.ai no guardan nada.

## Tablero ChatiChef (`tablero.html`)

Seis pestañas:

- **Hoy:** los platos de hoy y mañana, lo que toca bajar del congelador y lo que caduca pronto.
- **Resumen:** la semana entera en una sola pantalla del móvil: día, plato, kcal, proteína y minutos de cuchillo, con un color por tipo de proteína.
- **Semana:** cada receta completa, con casillas en los ingredientes. Botones «Marcar como hecha» (descuenta de la despensa lo que has usado), «Correr un día», «Cambiar con mañana», nota de 1 a 5 estrellas y comentario. Arriba, el botón **«Pedir el menú»** de la semana siguiente.
- **Despensa:** lo que hay en la nevera, el congelador y dos armarios, con cantidad, caducidad y fecha de apertura. Cada producto dice cuánto está **libre** y cuánto **reservado**, y para qué platos.
- **Compra:** la lista de la semana, compartida, con contador. Se ajusta sola a la despensa: si algo ya está en casa sale de la lista, y si falta de lo que tenías, entra.
- **Notas:** las recetas hechas con sus estrellas y comentarios, que Claude lee antes de repetir platos.

Se pueden ver dos semanas a la vez (la que acaba y la nueva).

## Tablero de alimentos (`alimentos.html`)

- **Preguntas:** Claude deja aquí sus dudas sobre lo que podéis comer (con respuestas para tocar y una nota opcional). Las contestas cuando quieras y Claude actualiza las instrucciones del proyecto.
- **Alimentos:** la lista de cada persona: lo que no puede tomar, lo que solo en poca cantidad (con cuánto), lo que no le gusta y lo que sí.

## Cómo montarlos

1. En un chat de tu proyecto ChatiChef, adjunta `tablero.html` y pide: «Publica este archivo como artifact, tal cual, con base de datos». Haz lo mismo con `alimentos.html`.
2. Copia el **enlace** y el **slug** que te dé y pégalos en `skills/chatichef-tablero/SKILL.md` («Datos fijos») antes de subir la skill.
3. En `tablero.html`, cambia `COBERTURA` (al principio del script) por las comidas que sueles cubrir.
4. Para compartirlo con quien cocine contigo: desde claude.ai, Compartir → invitar por correo **como Editor** (con enlace público solo puede mirar). Necesita cuenta de Claude.
5. En el iPhone: abre el enlace en Safari → Compartir → «Añadir a pantalla de inicio».

## Colecciones

| Tablero | Colección | Qué guarda |
|---|---|---|
| ChatiChef | `config/current` | Semana principal, semanas visibles, versión y resúmenes |
| ChatiChef | `meals` | Un documento por plato y día (`meals/2026-11-19-cena`) |
| ChatiChef | `shopping` | Una línea por producto, «tengo» o «falta», con los campos de la compra viva |
| ChatiChef | `inventory` | Lo que hay en casa, con cantidad, sitio, caducidad y movimientos |
| ChatiChef | `requests` | Pedidos del botón «Pedir el menú» |
| ChatiChef | `avisos` | Avisos de caducidad ya enviados |
| Alimentos | `preguntas` | Las dudas de Claude y tus respuestas |
| Alimentos | `alimentos` | Qué puede y qué no puede comer cada persona |

Los campos exactos están en `skills/chatichef-tablero/SKILL.md`.
