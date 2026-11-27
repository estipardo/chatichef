---
name: chatichef-tablero
description: "ChatiChef: úsala siempre que haya que leer o escribir en el Tablero ChatiChef (el artifact de tablero/tablero.html). Antes de montar o replanificar el menú (inventario real, platos hechos, movidos y con nota), al cargar una semana nueva, al cambiar, mover o quitar un plato, al rehacer la lista de la compra y al actualizar el inventario. Trae los campos exactos de config/current, meals, shopping e inventory, el orden de escritura, cómo escribir con ifVersion sin pisar lo que marca el usuario y la comprobación final. El menú va en la base de datos del tablero: nunca se publica una página nueva por semana."
---

# Tablero ChatiChef: leer y cargar el menú

Esta skill es un procedimiento. **Se suma a las instrucciones del proyecto ChatiChef, no las sustituye.** Si algo de aquí choca con las instrucciones del proyecto o con lo que pide el usuario en el momento, manda eso.

Objetivo: que **el tablero refleje siempre el menú acordado, entero, y que nada se quede a medias**. Si una escritura falla, **dilo en la misma respuesta**: qué ha fallado, qué está ya escrito y qué falta. Nunca lo calles ni lo des por hecho.

## Datos fijos

- Artifact: slug `<SLUG-DE-TU-TABLERO>` · enlace fijo `<ENLACE-DE-TU-TABLERO>` (los ves al publicar `tablero/tablero.html` como artifact; ponlos aquí).
- Herramientas: `db_get`, `db_list`, `db_query`, `db_write` del servidor de artifacts (cárgalas con ToolSearch si están diferidas).
- **No** publiques otra versión de la página (`publish_version`, `publish_files`, `edit_version`) ni crees un artifact nuevo para el menú. El menú son **datos**: solo se escriben documentos. Si la página en sí necesita un cambio, es otra tarea: pregunta antes.
- Colecciones: `config/current`, `meals`, `shopping`, `inventory`, `requests` (pedidos del botón «Pedir el menú») y `avisos` (avisos de caducidad ya enviados).
- Semana = fecha del **lunes** en `AAAA-MM-DD` (`2026-11-16`), aunque la cobertura empiece otro día.
- Fechas y horas: la zona horaria del usuario. `updatedAt` en ISO con la hora real del momento de escribir (`2026-11-15T22:45:00Z` o con desfase `+01:00`). Calcula fechas y días de la semana con código, no de cabeza.

## Reglas de escritura (las impone la base de datos)

1. **Documento que ya existe → necesita `ifVersion`.** Léelo antes (`db_get`, `db_list` o `db_query` te dan su `version`). Sin ella, o si ha cambiado, se rechaza la llamada entera y no se escribe nada: vuelve a leer y reenvía.
2. **Documento nuevo → `set` sin `ifVersion`.**
3. En documentos que ya existen usa **`update` o `merge` con solo los campos que cambian**. `set` reemplaza el documento entero y borraría lo que haya escrito el usuario.
4. **Nunca toques** los campos que escribe el usuario desde el móvil: en `meals`, `status`, `used`, `rating`, `comment` y `movedFrom` (salvo al mover tú un plato, ver abajo); en `shopping`, `checked`. Tampoco borres un plato con `status: "done"` ni una línea de compra con `checked: true`.
5. Máximo **50 operaciones por llamada**. Una llamada con varias operaciones se escribe entera o no se escribe. Tras una llamada grande, espera 2 segundos antes de la siguiente.
6. Pon un `idempotencyKey` en cada llamada (p. ej. `chatichef-2026-11-16-v1-meals`). Si una llamada da error de red o se corta, **reintenta con la misma clave**: así no se duplica nada.

## 1. Antes de montar o replanificar: leer el tablero

1. `db_get config/current` → semana y versión actuales.
2. `db_list inventory` con `limit: 1000` (si vuelve `nextCursor`, sigue paginando hasta el final). Es lo que hay **de verdad**:
   - `qty: null` = cantidad desconocida: **pregúntala** antes de repartir proteína.
   - `expires`, `opened` y `note` deciden el orden de uso (primero lo abierto y descongelado). En el congelador, una fecha pasada no es problema: solo cuenta si lleva más de 2 meses pasada.
   - Lo que ya está **reservado** para platos sin hacer (ver «Libre y reservado») no está libre: no lo asignes dos veces.
   - `place`: `nevera`, `congelador`, `despensa` (se ve como «Despensa 1») o `despensa-2` («Despensa 2»). Al decir dónde está algo, usa el nombre que ve el usuario.
3. `db_query meals` con `week == <semana actual>` → qué está hecho (`status: "done"` y `used`, lo que usó de verdad), qué se ha movido (`date` distinta de la del id y `movedFrom`) y qué queda pendiente.
4. `db_query meals` con `status == "done"` → notas (`rating`, `comment`) para decidir repeticiones: repite las de 4–5 estrellas; no propongas las de 1–2 sin preguntar.
5. Si hay platos movidos y usas avisos (ver las instrucciones del proyecto), reprográmalos al nuevo día.
6. «Inventario actualizado» es la `updatedAt` más reciente de `inventory`. Si el inventario lleva días sin tocarse, pregunta antes de fiarte de él.
7. Si existe el tablero de alimentos (`tablero/alimentos.html`), lee sus colecciones `alimentos` y `preguntas` contestadas: mandan sobre lo que recuerdes.

Sigue preguntando lo que el tablero no sabe: comidas fuera, sobras que no estén en el inventario, si quiere postres.

## 2. Cargar una semana nueva

Hazlo **solo cuando el usuario haya aceptado el menú** (o cuando atiendas un pedido del botón «Pedir el menú», ver `docs/pedir-menu-desde-el-tablero.md`). Antes:

- Si la semana anterior aún tiene platos `pending`, **pregunta** si cambias ya el tablero a la nueva o esperas a que acabe la anterior. El tablero solo enseña la semana de `config/current.week`.
- Ten los números de cada receta calculados con la skill `chatichef-nutricion` (kcal, prot) y los tres tiempos.

### Orden de escritura (para no dejar una semana a medias)

1. **`meals`** de la semana nueva (una o varias llamadas de ≤ 50).
2. **`shopping`** de la semana nueva.
3. **`config/current` al final**, con `update` + `ifVersion`. Es lo que hace que el tablero cambie a la semana nueva: si algo de lo anterior falla, el tablero sigue enseñando la semana vieja entera en vez de una nueva a medias.

### `meals/<fecha>-<turno>` (set)

Id: `meals/2026-11-19-cena`, `meals/2026-11-21-comida`. Postres: `meals/<semana>-postre-1`, `-postre-2`… Si una receta se come dos días (segundo servicio), un documento por día.

Al acabar una semana, quítala de `config/current.weeks` (update con `ifVersion`).

```
{
  week: "2026-11-16",
  date: "2026-11-19",                  // null en postres
  slot: "cena" | "comida" | "postre",
  order: 0,
  for: "para 2" | "para <nombre>",
  servings: 2,                          // 1 en una comida suelta de una persona; en postres, las raciones que salen
  title: "Pollo al chilindrón con patata",   // el mismo nombre que en Umami
  short: "Pollo al chilindrón",         // ≤ ~45 caracteres, para la pestaña Resumen
  protein: "carne" | "pescado" | "huevo" | "legumbre",   // color del borde en Resumen (pescado incluye marisco y atún)
  badge: "Partido 21:00",               // opcional; en postres "Grande" o "Exprés"
  yield: "8 vasitos · 4 días",          // solo en postres
  origin: "Parte del … El cambio: …",   // plato tradicional y qué lo hace saludable
  tag: "rapida" | "media" | "larga",    // [Al momento, <15 min] | [Media, 20–40 min] | [Larga]
  kcal: 415, prot: 42,                  // por ración, de chatichef-nutricion
  times: { knife: 14, fire: 38, total: 45, overlap: "Qué se solapa con qué y qué parte del fuego es espera." },
  thaw: { date: "2026-11-18", text: "Pasa los contramuslos a la nevera" },   // opcional: el día de bajar algo del congelador
  ingredients: [
    { text: "200 g de pimiento troceado congelado (todo el que tienes)", inv: "pimiento-troceado", qty: 200 },
    { text: "400 g de contramuslos de pollo deshuesados y sin piel (200 g por persona)" }
  ],
  steps: ["Un paso por acción, con su porqué y su señal de hecho…", "…"],
  notes: [ { title: "Por ración", text: "…" }, … ],
  status: "pending"
}
```

- `ingredients[].inv` = id del documento de `inventory` del que sale, y `qty` **en la unidad de ese documento** (g, ml, ud, lata). Ponlo **solo** en lo que ya tiene en casa: es lo que el tablero descuenta cuando el usuario marca el plato como hecho. Comprueba que el id existe en el inventario que leíste; si no existe, no lo inventes.
- `notes`: usa estos títulos, en este orden, cuando apliquen: «Repetida» (semana en que se hizo y qué cambia), «Por ración» (kcal, proteína, cantidades por persona de proteína e hidrato, lo denso), «De tu despensa» (qué ingrediente suyo usa y cuánto), «Compra y fecha», «Etiquetado», «Errores típicos», «Lo que sobre», «Si quieres adelantarlo», «Cacharros».
- Las recetas se escriben como piden las instrucciones del proyecto (pasos extendidos, señales visibles, tres tiempos). Esta skill solo dice **dónde** van.

### `shopping/<semana>-<n>` (set)

```
{ week: "2026-11-16", order: 1, section: "Frutería", kind: "falta" | "tengo",
  text: "2 kg de patatas (se gastan ~1,2 kg)", dest: "Ma, Mi y Ju cena (200 g cada una)",
  store: "Lidl",   // solo si NO es de los supermercados habituales
  umamiItemId: "…", // lo escribe la skill chatichef-guardar-umami al pasar la línea a la lista de Umami
  checked: false }
```

- `kind: "falta"` = lo que hay que comprar; `kind: "tengo"` = lo que ya tiene, con `dest` diciendo a dónde va cada cosa.
- **Compra viva:** cada línea que sea un producto medible lleva además estos campos, y entonces la página ajusta sola la lista a lo que hay en Despensa (si ya está en casa, sale de la lista; si falta de lo que había, entra) y calcula qué está libre y qué reservado:
  ```
  key: "gambas",                       // id de inventory si existe; si no, un nombre corto
  match: ["gamba","langostino"], excl: ["hamburguesa"],   // palabras sin tildes para encontrarlo por nombre en Despensa
  unit: "g" | "ml" | "ud" | "lata", per: 250,             // per = g por unidad (opcional)
  uses: [{m:"2026-11-25-cena", q:350}]  // plato de meals y cantidad en `unit`
  ```
  Varias líneas pueden compartir `key` (por ejemplo «1 docena de huevos» falta y «4 huevos» tengo): se suman sus `uses`, así que un mismo plato va en una sola de ellas. Las líneas que juntan varios productos («maicena, eritritol y levadura») van sin `key`.
- `n` y `order` correlativos desde 1. Secciones habituales: Frutería, Carnicería, Pescadería, Charcutería, Congelados, Despensa, Nevera, Congelador.
- Una línea por producto, con las unidades bien contadas (dos recetas con garbanzos de bote = 2 botes).

### `config/current` (update, al final)

```
{ week: "2026-11-16", weeks: ["2026-11-09","2026-11-16"],   // weeks: semanas visibles a la vez (la vieja hasta que acabe)
  label: "Semana del 16 nov", version: "v1", summaries: { "2026-11-16": "…" },
  summary: "~5 h de reloj · ~1 h 55 de cuchillo · 8 de 9 recetas con menos de 15 min de cuchillo · horno 0 veces",
  updatedAt: "<ISO, hora real>" }
```

«Qué te queda sin usar» y su conservación van en la respuesta del chat (el tablero no tiene sitio para ello).

## 3. Cambiar, mover o quitar un plato a mitad de semana

Lee primero el documento (`db_get`) para tener su `version`.

- **Cambiar la receta del mismo hueco**: `update` del mismo documento con los campos nuevos (title, origin, tag, kcal, prot, times, thaw, ingredients, steps, notes). No toques `status`, `used`, `rating` ni `comment`.
- **Mover a otro día o turno**: deja el id como está (así lo hace el botón «Correr un día» de la página) y haz `update` de `date` y/o `slot` más `movedFrom: "<fecha anterior>"`. Mira que el nuevo hueco no esté ocupado por otro plato pendiente; si lo está, colócalo o pregúntale.
- **Quitar un plato**: `delete` con `ifVersion`, **solo si está `pending` y sin `rating`**. Si ya está hecho, no lo toques.
- **Compra**: añade las líneas nuevas con el siguiente `n` libre; las que ya no hacen falta, `delete` solo si `checked: false`. Si ya estaba marcada (comprada), déjala y dilo («esto ya lo compraste: queda para…»). Da en el chat la **lista de reposición**, no la compra entera.
- **Siempre**, en la misma llamada o justo después: `update config/current` subiendo `version` (v1 → v2) y `updatedAt`.
- Al cambiar un plato confirmado, sincroniza también Umami con la skill `chatichef-guardar-umami` (si la usas) y revisa los avisos de ese plato.

## 4. Inventario

- **Cantidad que el usuario dice en el chat**: `update` de `qty` (en la unidad del documento), añade un movimiento al final de `moves` (`{ at: "<ISO>", delta: <nueva - anterior>, why: "Ajuste desde el chat" }`, conservando los que ya había) y `updatedAt` con la hora real.
- **Producto nuevo o compra hecha**: `set` de `inventory/<slug>` (minúsculas, sin tildes, con guiones: `guisantes-congelados`). Si el slug ya existe con otro producto, añade un sufijo.
  ```
  { name: "Guisantes congelados", qty: 400, unit: "g" | "ml" | "ud" | "lata",
    place: "nevera" | "congelador" | "despensa" | "despensa-2",
    expires: "2027-03-10" | null, opened: "2026-11-17" | null, note: "",
    moves: [], updatedAt: "<ISO>" }
  ```
- **No descuentes** lo que usa un plato al planificarlo: lo descuenta la página cuando el usuario marca «Hecha». Solo ajusta a mano si dice en el chat que ha gastado algo fuera del tablero.
- Toda alta o cambio lleva `updatedAt` con la hora real: de eso sale «Inventario actualizado».

## 5. Comprobación final (obligatoria)

1. `db_get config/current` → `week`, `version` y `updatedAt` son los nuevos.
2. `db_query meals` con `week == <semana>` → hay **exactamente** un documento por receta y día acordados (ni de más ni de menos), cada uno con `title`, `kcal`, `prot`, `times` y `steps`, y las fechas caen en el día de la semana correcto.
3. `db_query shopping` con `week == <semana>` → número de líneas esperado y sin duplicados.
4. Di en **una línea**: «Tablero: semana del 16 nov, v2 — 9 platos y 27 líneas de compra» con el enlace. Si algo no se ha podido escribir, dilo en esa misma línea con lo que falta.
## 6. Libre y reservado (lo calcula la página)

La pestaña Despensa enseña en cada producto «Libre X · reservado Y» y, al abrirlo, para qué platos está reservado. Sale de:

- los ingredientes de `meals` sin hacer con `inv` (lo que el plato saca de casa), y
- las líneas de compra con `key` y `uses` cuyo producto ya está en Despensa (lo comprado para un plato).

Se reparte primero en lo que caduca antes. Por eso es importante rellenar bien `inv`, `qty`, `key` y `uses`: si faltan, la página no sabe que algo tiene destino.

## 7. Avisos de caducidad

Una tarea programada diaria (ver `docs/avisos.md`) lee `inventory` y manda un correo con lo que caduca en 2 días o menos (fuera del congelador) y con lo que lleva más de 2 meses pasado de fecha en el congelador. Apunta cada aviso enviado en `avisos/cad-<id>-<expires>` (o `avisos/cong-<id>-<expires>`) para no repetirlo. No toques esa colección a mano.
