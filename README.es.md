# ChatiChef

*[Read in English](README.md)*

Un asistente de cocina semanal montado sobre un **proyecto de Claude**. Reinterpreta platos de siempre en versiones saludables (lasaña de calabacín, bechamel de anacardos, carbonara sin nata…), monta el menú de la semana alrededor de lo que ya tienes en la nevera y te da la lista de la compra solo con lo que falta.

Lo que lo hace distinto de pedirle recetas a un chat:

- **Tiempos honestos**: cada receta lleva tres números (cuchillo, fuego y total realista), porque el tiempo de fogón no cuenta pelar ni picar.
- **Calorías calculadas, no estimadas**: una calculadora en Python suma cada cucharada de aceite, comprueba tu listón de proteína y detecta ingredientes prohibidos según quién se come el plato.
- **Aprovechamiento**: pregunta qué te ha sobrado y cuánto, coloca primero lo abierto y lo descongelado, y la compra pasa a ser de reposición.
- **Recetas para nivel básico**: un paso por acción, la señal visible de "ya está hecho" y los errores típicos.
- **Tablero en el móvil** (opcional): menú, despensa (con lo que está libre y lo reservado para cada plato), compra que se ajusta sola y notas, sincronizado con Claude. Se ve en español o en inglés según el idioma del móvil.
- **Tablero de alimentos** (opcional): qué puede y qué no puede comer cada persona, y las dudas que Claude te va preguntando.
- **Avisos por correo** (opcional): lo que caduca, cuándo preparar la compra y cuándo bajar algo del congelador.
- **Umami** (opcional): guarda las recetas confirmadas en tu recetario y en el plan de comidas, con un conector propio incluido en este repositorio.

## Qué hay aquí

| Carpeta | Qué es |
|---|---|
| `instructions/project-instructions.es.md` | Plantilla de las instrucciones del proyecto. Rellena lo que va entre `[corchetes]`. |
| `instructions/prep-times.es.md` | Tabla para estimar el tiempo de cuchillo. |
| `instructions/cooking-lessons.es.md` | Técnicas que suelen fallar y cómo se arreglan. Ve añadiendo las tuyas. |
| `skills/chatichef-nutrition` | Skill + calculadora de kcal y proteína (`scripts/chatichef_nutrition.py`) con tu `profile.json`. |
| `skills/chatichef-board` | Skill para leer y escribir en el tablero. |
| `skills/chatichef-save-to-umami` | Skill para guardar las recetas en Umami. |
| `boards/` | El tablero de la semana y el de alimentos, para publicarlos como artifacts. |
| `docs/` | El botón «Pedir el menú» del tablero y los avisos por correo (caducidad, compra, descongelar). |
| `umami-connector/` | Conector MCP para Umami Recipes (recetario, plan de comidas y lista de la compra), listo para desplegar en Cloudflare. |

El proyecto está en inglés, y cada documento tiene al lado su copia en español (`.es.md`); cada skill, su `SKILL.es.md`. Los nombres de carpetas, archivos e identificadores son en inglés en las dos versiones.

## Cómo montarlo

1. **Crea un proyecto** en Claude (por ejemplo, «ChatiChef»).
2. **Instrucciones**: copia `instructions/project-instructions.es.md` en las instrucciones del proyecto y rellena tus datos: cuántos sois, restricciones, lo que no coméis, equipo de cocina, supermercados. Quita las secciones *(opcional)* que no uses.
3. **Documentos**: sube `prep-times.es.md` y `cooking-lessons.es.md` al proyecto.
4. **Perfil de la calculadora**: copia `skills/chatichef-nutrition/scripts/profile.example.json` como `profile.json` en la misma carpeta y pon tus prohibidos y tu listón. Los ids son los de la tabla del script (`python3 chatichef_nutrition.py --list`).
5. **Skills**: ejecuta `./package-skills.sh --es`; deja en `dist/` un `.zip` por skill con la versión en español. Súbelas como skills en Claude. Si no usas el tablero o Umami, sube solo `chatichef-nutrition`.
6. **Tableros** (opcional): sigue `boards/README.es.md`.
   Avisos (opcional): sigue `docs/reminders.es.md`.
7. **Umami** (opcional): despliega el conector de `umami-connector/` siguiendo su README (`README.es.md`) y añádelo a Claude. La skill `chatichef-save-to-umami` usa sus herramientas de recetario, plan de comidas y lista de la compra.

Luego, en un chat del proyecto: «Hazme el menú de esta semana». Te preguntará qué comidas cubre, qué días coméis fuera y qué te ha sobrado.

## Probar la calculadora

```bash
cd skills/chatichef-nutrition/scripts
cp profile.example.json profile.json
cat > /tmp/receta.json <<'JSON'
{"name": "Pollo con patata", "servings": 2, "meal": "dinner", "week": "normal", "for": "everyone",
 "ingredients": [{"id": "chicken-thigh", "g": 400}, {"id": "potato", "g": 300},
                 {"id": "olive-oil", "tsp": 2, "note": "dorar"}, {"id": "paprika"}]}
JSON
python3 chatichef_nutrition.py /tmp/receta.json
```

Los valores de la tabla son medios (±10 %) de tablas como BEDCA o USDA. **No es consejo médico ni nutricional**: si tienes una alergia o intolerancia, revisa siempre la etiqueta tú.

## Licencia

[MIT](LICENSE).

## Usarlo con otras IA que no sean Claude

ChatiChef está hecho con Claude, pero **casi todo es texto normal**, así que sirve con otras IA (ChatGPT, Gemini…). No hace falta saber programar. Esto es lo que funciona fuera de Claude:

| Parte | ¿Funciona en otra IA? |
|---|---|
| Instrucciones (`project-instructions.es.md`) | **Sí.** Es lo más importante y funciona en cualquier IA que tenga «proyectos», «instrucciones personalizadas» o «Gems». |
| Tiempos reales y aprendizajes de cocina | **Sí.** Se suben como archivos. |
| Calculadora de calorías (`chatichef_nutrition.py`) | **Sí, si la IA puede ejecutar código Python.** ChatGPT puede; en otras, depende. Si no, la IA estimará los números (menos exactos). |
| Skills (`skills/…/SKILL.md`) | **A medias.** Otras IA no las activan solas, pero puedes subirlas como archivos normales y decirle cuándo leerlas (abajo tienes el texto). |
| Conector de Umami | **Solo si la IA admite conectores MCP** (un estándar abierto para conectar apps). ChatGPT lo admite, con límites según el plan. |
| Tableros (semana y alimentos) | **No.** Usan la base de datos de Claude. Abajo tienes alternativas. |
| Avisos por correo | **Depende** de si la IA tiene tareas programadas. Si no, usa los recordatorios del móvil. |

### Paso 1. Descarga los archivos

1. En esta página de GitHub, pulsa el botón verde **«Code»** y luego **«Download ZIP»**.
2. Abre el archivo descargado (doble clic) para descomprimirlo. Te queda una carpeta `chatichef-main` con todo.

Los archivos que acaban en `.md` son texto normal: se abren con el Bloc de notas (Windows), TextEdit (Mac) o cualquier editor de texto.

### Paso 2. Prepara tus instrucciones

1. Abre `instructions/project-instructions.es.md`.
2. Rellena todo lo que va entre `[corchetes]`: cuántos sois, qué no podéis comer, qué tenéis en la cocina, dónde compráis… Si una frase no va contigo, bórrala.
3. **Borra estas secciones**, que solo funcionan en Claude: «Guardar las recetas en Umami» (salvo que conectes Umami, paso 5) y «Avisos y recordatorios».
4. En la sección «Formato de la propuesta semanal», borra los dos párrafos que empiezan por *(Si usas el tablero)* y *(Si no)* y pon en su lugar:
   > Dame el menú en el chat, con cada receta separada por un título con el día y la comida. Al final, la lista de la compra agrupada por sección del súper, en una lista con casillas que pueda copiar.
5. Al final del todo, pega este bloque (cambia los nombres si renombras los archivos):
   > **Cómo usar los archivos del proyecto.** Antes de dar calorías o proteína de cualquier receta, lee `chatichef-nutrition.md` y ejecuta `chatichef_nutrition.py` como explica (con mi `profile.json`); nunca calcules de cabeza. Para los tiempos, usa la tabla de `prep-times.es.md`. Antes de proponer una técnica, mira `cooking-lessons.es.md`.

### Paso 3. Crea el proyecto en tu IA

**En ChatGPT:**

1. En la barra lateral, busca **«Proyectos»** y crea uno nuevo llamado «ChatiChef».
2. En la configuración del proyecto, pega tus instrucciones (paso 2) en el apartado de **instrucciones**.
3. Sube como **archivos del proyecto**:
   - `instructions/prep-times.es.md`
   - `instructions/cooking-lessons.es.md`
   - `skills/chatichef-nutrition/SKILL.es.md` (renómbralo antes a `chatichef-nutrition.md` para que se entienda qué es)
   - `skills/chatichef-nutrition/scripts/chatichef_nutrition.py`
   - tu `profile.json` (paso 4)

**En Gemini:** crea un **Gem** («Gems» en el menú), pega las instrucciones en su descripción y añade los mismos archivos como conocimiento. Si tu cuenta no puede ejecutar el script, quita la frase del script del bloque del paso 2.5: la IA estimará los números.

**En cualquier otra IA:** busca algo como «proyecto», «asistente personalizado» o «instrucciones personalizadas». Lo importante es que las instrucciones queden guardadas y que pueda leer los archivos.

### Paso 4. Tu perfil para la calculadora

1. Copia `skills/chatichef-nutrition/scripts/profile.example.json` y llama a la copia `profile.json`.
2. Ábrelo con el editor de texto y cambia:
   - en `forbidden` (prohibidos), lo que no puede comer nadie (`everyone`) y lo de cada persona (pon vuestros nombres en lugar de `ana` y `luis`);
   - en `targets` (listón), las calorías mínimas, las máximas y la proteína mínima de cada comida (`dinner` = cena, `lunch` = comida).
3. Los nombres de los ingredientes tienen que ser los de la calculadora (en inglés; los antiguos en español también valen). Si no sabes cómo se llama uno, pregúntaselo a la IA: «¿cómo se llama el atún en la tabla de la calculadora?» (ella puede ejecutar `python3 chatichef_nutrition.py --list tuna`).

### Paso 5 (opcional). Umami en ChatGPT

1. Despliega el conector siguiendo `umami-connector/README.es.md` (es gratis y no hace falta instalar nada si usas el panel de Cloudflare).
2. En ChatGPT, busca en los ajustes la opción de **añadir un servidor MCP propio** (suele estar en «Apps», «Conectores» o «Plugins»; en algunos planes hay que activar antes el «modo desarrollador»).
3. Pega la dirección de tu conector terminada en `/mcp` y entra con tu email y contraseña de Umami.
4. Sube también `skills/chatichef-save-to-umami/SKILL.es.md` como archivo (renómbralo a `chatichef-save-to-umami.md`) y añade a tus instrucciones: «Cuando confirme las recetas, guárdalas en Umami siguiendo `chatichef-save-to-umami.md`».

Si tu plan no deja conectarlo, pide las recetas en el chat y cópialas a Umami a mano.

### Paso 6. Úsalo

Escribe en el proyecto: **«Hazme el menú de esta semana»**. Te preguntará qué comidas cubre, qué días coméis fuera y qué te ha sobrado. Cuando estés de acuerdo, pídele la lista de la compra.

### Lo que no tendrás sin Claude, y cómo apañarte

- **Tablero de la semana:** pide el menú y la compra en el chat y guárdalos donde ya los mires (Notas del móvil, Google Keep, Umami). Para la despensa, pídele al principio de cada semana: «Esto es lo que tengo en casa: …».
- **Tablero de alimentos:** pon lo que no podéis comer directamente en las instrucciones. Cuando la IA te haga preguntas, añade tus respuestas a las instrucciones para que no se olviden.
- **Avisos:** pide a la IA, al darte el menú, una lista de recordatorios con día y hora («bajar el pollo del congelador el miércoles a las 21:30») y créalos en el móvil.

### Palabras que pueden sonar raras

- **Archivo `.md` (Markdown):** texto normal con algún símbolo para títulos (`#`) y listas (`-`).
- **Python / script:** un pequeño programa. La calculadora es uno: suma calorías en vez de que la IA las adivine.
- **Skill:** un archivo de instrucciones para una tarea concreta. Claude las lee solo; otras IA, cuando se lo pides.
- **MCP / conector:** la forma estándar de que una IA hable con otra app (aquí, Umami).
- **Artifact:** una página que Claude publica y que se puede abrir en el móvil. Los tableros lo son.
