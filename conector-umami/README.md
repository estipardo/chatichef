# Conector de Umami para Claude

*English below.*

Servidor MCP remoto (un Worker de Cloudflare) para usar [Umami Recipes](https://www.umami.recipes/) desde Claude u otro cliente MCP. Es el conector que usan las skills de ChatiChef para guardar recetas y llenar el plan de comidas.

Escrito desde cero para este repositorio, con licencia MIT. No es un producto oficial de Umami: usa la misma API privada que la app web de Umami, que puede cambiar sin aviso.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `list_recipe_books` | Recetarios propios y compartidos contigo |
| `list_recipe_tags` | Etiquetas en uso y cuántas recetas tiene cada una |
| `find_recipes` | Busca por texto y por etiquetas (todas deben coincidir) entre las 500 recetas más recientes de cada recetario |
| `get_recipe` | Receta completa; ingredientes, pasos y notas en Markdown |
| `create_recipe` / `edit_recipe` | Crea o cambia una receta (nombre, raciones, tiempos, etiquetas, información nutricional…) |
| `add_recipe_photo` | Sube una foto JPEG, PNG o WebP (máx. 10 MB) desde una URL https o en base64 |
| `list_meal_plans` | Planes de comidas compartidos contigo |
| `get_meal_plan_items` | Entradas de un plan entre dos fechas |
| `add_meal_plan_item` | Pone una receta en un día como `LUNCH` (comida) o `DINNER` (cena), sin duplicarla |
| `update_meal_plan_item` | Mueve una entrada a otro día o franja, o la apunta a otra receta |
| `remove_meal_plan_item` | Quita una entrada del plan (la receta no se borra) |

Todas las escrituras comprueban que nadie ha cambiado el documento desde que se leyó, así que nunca pisan algo que hayas hecho en la app mientras tanto.

## Cómo funciona el acceso

1. Al conectar, Claude abre una página del propio Worker donde escribes tu email y contraseña de Umami.
2. El Worker comprueba que el email está en `ALLOWED_EMAILS` **antes** de hablar con Umami (así nadie puede usar tu servidor para probar contraseñas ajenas).
3. Cambia la contraseña por un *refresh token* de Umami y se olvida de la contraseña. El token se guarda cifrado dentro del permiso OAuth, en el KV del Worker.
4. Cada petición vuelve a comprobar `ALLOWED_EMAILS`: si quitas un email, ese acceso deja de funcionar al momento.

Los logs del Worker están desactivados para que Cloudflare no guarde recetas ni datos de la cuenta.

## Desplegarlo en Cloudflare

Necesitas una cuenta gratuita de Cloudflare.

**Desde el panel (sin instalar nada):**

1. En Cloudflare: **Workers & Pages → Create → Import a repository** y elige tu copia de este repositorio.
2. Deja la configuración por defecto: directorio raíz `/` y comando de deploy `npx wrangler deploy`. El `wrangler.jsonc` de la raíz del repo ya apunta a esta carpeta.
3. Despliega. El KV para los permisos se crea solo la primera vez.
4. En el Worker: **Settings → Variables and Secrets → Add**, tipo **Secret**, nombre `ALLOWED_EMAILS`, valor tu email de Umami (varios, separados por comas).
5. En Claude, añade un conector personalizado con la URL `https://umami-mcp.<tu-subdominio>.workers.dev/mcp` y conéctalo con tu cuenta de Umami.

**Desde la terminal:**

```bash
# desde la raíz del repositorio
npm ci
npx wrangler login
npx wrangler deploy
npx wrangler secret put ALLOWED_EMAILS
```

Si tu cuenta de Umami se creó con «Iniciar sesión con Apple» o con Google, primero ponle contraseña desde la app de Umami (Ajustes de la cuenta).

## Desarrollo

```bash
# desde la raíz del repositorio
npm ci
npm test        # tests con un Umami falso en memoria
npm run check   # TypeScript
npm run dev     # Worker en local (http://localhost:8787)
```

---

## English

A remote MCP server (Cloudflare Worker) for [Umami Recipes](https://www.umami.recipes/): recipe books, recipes, photos and meal plans, with the 12 tools listed above. Written from scratch, MIT licensed, not affiliated with Umami; it talks to the same private API the Umami web app uses, which may change.

Deploy: import this repository in Cloudflare Workers with the default settings (the root `wrangler.jsonc` points to this folder), add a secret `ALLOWED_EMAILS` with your Umami email, then add `https://umami-mcp.<your-subdomain>.workers.dev/mcp` as a custom connector in Claude and sign in with your Umami email and password. The password is exchanged once for a refresh token and never stored; only allow-listed emails can sign in.
