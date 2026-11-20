---
name: chatichef-guardar-umami
description: "ChatiChef: úsala en cuanto el usuario confirme que está de acuerdo con las recetas (las de la semana o una suelta), y cada vez que cambie, mueva o quite una receta ya confirmada. Guarda cada receta en el recetario de Umami (sin crear duplicados) con su nombre, etiquetas, tiempos, kcal y notas, y la pone en el plan de comidas en la fecha y la franja exactas. Antes de que el usuario confirme no se guarda nada. Necesita el conector umami-recipes-mcp."
---

# Guardar las recetas confirmadas en Umami

Esta skill es un procedimiento. **Se suma a las instrucciones del proyecto ChatiChef, no las sustituye.** Si algo de aquí choca con las instrucciones del proyecto o con lo que pide el usuario en el momento, manda eso.

Objetivo: que **cada receta confirmada esté una sola vez en el recetario y en su día y franja del plan**, sin duplicados ni entradas viejas. Si algo no se puede guardar, **dilo claramente en la misma respuesta**: qué receta, qué paso y qué tiene que hacer el usuario. Nunca lo des por hecho.

## Configura esto una vez

Pon aquí los nombres que usas en Umami (los ids se buscan solos):

- Recetario: **«Recetas ChatiChef»** (cámbialo si usas otro).
- Plan de comidas: **«Comidas y Cenas»** (cámbialo si usas otro).

## Cuándo

- **Solo después de que el usuario confirme** («vale», «de acuerdo», «perfecto», «súbelas»). Una pregunta o un cambio sobre la propuesta no es una confirmación. Si no está claro, pregunta.
- Sin que lo pida: la confirmación ya es la orden.
- También cuando cambia, mueve o quita una receta que ya estaba guardada.

## Datos que hay que buscar

- Herramientas: `mcp__Umami__*` (cárgalas con ToolSearch si están diferidas).
- `recipeBookId`: con `list_recipe_books`, por el nombre exacto del recetario. Ahí van todas las recetas, también los postres.
- `mealPlanId`: con `list_meal_plans`, por el nombre exacto del plan. Pásalo siempre.
- Franjas del plan: **comida = `LUNCH`** · **cena = `DINNER`**. Los postres no van al plan.
- **Limitaciones conocidas del conector**: `find_recipes` con `tags` puede dar error 400 (busca por `query` de texto y filtra tú por etiquetas); el plan **no tiene borrar** (solo `add_meal_plan_item` y `update_meal_plan_item`).

## Paso 0. Tabla de lo que se va a guardar

Antes de llamar a nada, monta (para ti) una fila por receta y día:

| fecha AAAA-MM-DD | día («Miércoles 18») | franja (LUNCH/DINNER/postre) | etiqueta de turno | nombre exacto |

- **Calcula la fecha con código** a partir del menú y comprueba que cae en el día de la semana correcto, sobre todo en semanas partidas o que empiezan a mitad de semana.
- Una receta que se come dos días (segundo servicio) = **una receta y dos filas**.
- Etiqueta de turno: «Cena», «Comida» o la que uses. Postres: «Postres».

## Paso 1. ¿Ya existe? (evitar duplicados)

Por cada receta:

1. `find_recipes` con `query` = el principio del nombre y el `recipeBookId`.
2. **Recetas fijas** (las que el usuario hace siempre igual; lístalas en las instrucciones del proyecto): **usa la que ya existe**, nunca crees otra.
3. **Receta repetida** de otra semana con el mismo nombre → usa esa misma (edítala si cambia algo).
4. Si salen **dos o más con el mismo nombre**, usa la más reciente (`updated`) y di cuáles sobran para que las borre el usuario en la app.
5. Solo si no existe → se crea.

## Paso 2. Crear o editar la receta

### Campos

- `name`: el mismo nombre que en el menú. **Máximo 60 caracteres**: si pasa, córtalo por el final.
- `servings`: «2 raciones» / «1 ración» / en postres, las que salen.
- `activeTime`: los minutos de **cuchillo** («14 min»). `totalTime`: el **total realista** («45 min»).
- `nutritionInformation`: `{ "Calorías": "~415 kcal por ración", "Proteína": "~42 g por ración" }`, con los números de la skill `chatichef-nutricion`.
- `ingredients`: un ingrediente por párrafo (separados por una línea en blanco), con la cantidad delante.
- `directions`: lista numerada `1. …`, un paso por acción.
- `notes`: párrafos separados por una línea en blanco, en este orden y solo los que apliquen:
  1. `Miércoles 18 · cena · para 2`
  2. `Tiempos: cuchillo X min · fuego Y min · total ~Z min. <qué se solapa con qué>. No incluye fregar.`
  3. El plato tradicional del que parte y el cambio que lo hace saludable.
  4. `Repetida: …` (semana en que se hizo y qué cambia).
  5. `Por ración: ~kcal y ~g de proteína. <cantidades por persona y lo denso>.`
  6. `Compra y fecha: …` · `De tu despensa: …` · `Etiquetado: …`
  7. `Errores típicos: …` · `Lo que sobre: …` · `Si quieres adelantarlo: …` · `Cacharros: …`
- `tags`: `["<Día> <n>", "Semana <d> <mes> <aaaa>", "<turno>", "ChatiChef"]`, p. ej. `["Jueves 19", "Semana 16 nov 2026", "Cena", "ChatiChef"]`. La semana es la del **lunes**, con el mes en tres letras y en minúscula. Postres: `["Semana 16 nov 2026", "Postres", "ChatiChef"]`.

### Receta nueva

`create_recipe` con todo lo anterior. **Si la llamada da error o se corta, antes de reintentar busca con `find_recipes`** si se llegó a crear; si está, edítala en vez de crear otra.

### Receta que ya existe

- `get_recipe` para ver sus etiquetas actuales. `edit_recipe` **sustituye la lista entera de etiquetas**: quita solo las de fecha antiguas («Semana …» o un día de la semana seguido de número) y las de turno, añade las nuevas y **conserva el resto**.
- **Receta fija**: no cambies ingredientes ni pasos salvo que el usuario haya pedido cambiar la receta en sí.
- **Repetida con cambios**: actualiza los campos que cambian. Si un número anterior estaba mal, dilo en el chat con el corregido.

## Paso 3. Ponerla en el plan

1. `get_meal_plan_items` con `mealPlanId`, `from` = primer día y `to` = último día de la cobertura.
2. Para cada fila de la tabla del paso 0 (salvo postres):
   - Ya hay una entrada con **la misma receta, fecha y franja** → no hagas nada.
   - Ese día y franja tiene una entrada de **otra receta que venía de este menú** → `update_meal_plan_item` apuntando a la receta nueva.
   - Ese día y franja tiene una entrada que **puso el usuario** y no sale del menú → **no la toques**: pregunta.
   - No hay nada → `add_meal_plan_item` con `recipeId`, `date`, `meal` y `mealPlanId`.

## Cambios después de confirmar

- **Otro día u otro turno**: `update_meal_plan_item` (nueva `date` y/o `meal`) **y** cambia las etiquetas de día y turno de la receta.
- **Otra receta en ese hueco**: guarda la nueva y apunta la entrada del plan a ella. Si la vieja ya no se usa, quítale las etiquetas de esta semana.
- **Otra cantidad u otra versión de la misma receta**: `edit_recipe` de la misma; nunca una segunda receta.
- **Un plato cae y no tiene a dónde ir**: el plan no deja borrar. **Di exactamente qué entrada borrar en la app**: «Plan Comidas y Cenas → jueves 19, cena: “Pollo al chilindrón”».
- Si usas el tablero, mantenlo en paralelo (skill `chatichef-tablero`).

## Comprobación final (obligatoria)

1. `get_meal_plan_items` del rango otra vez y compáralo con la tabla del paso 0: **cada día y franja tiene exactamente su receta**.
2. Para las recetas creadas o editadas, comprueba con `find_recipes` que hay **una sola** con ese nombre y con las etiquetas de esta semana.
3. Di en **una línea** qué has añadido y dónde: «Umami: 9 recetas en «Recetas ChatiChef» (4 nuevas, 5 reutilizadas) y 9 entradas en «Comidas y Cenas» (mié 18 → dom 22)». Si algo falló, dilo en esa misma línea.
