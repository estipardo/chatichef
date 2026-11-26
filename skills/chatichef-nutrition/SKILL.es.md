---
name: chatichef-nutrition
description: "ChatiChef: úsala SIEMPRE antes de dar kcal o proteína de cualquier receta (nueva, repetida, cambiada, replanificada, comida suelta, sesión doble o postre). Ejecuta una calculadora en Python con tabla de ingredientes en lugar de estimar de cabeza: cuenta cada cucharada de aceite, mide lo denso, comprueba el listón, detecta ingredientes prohibidos según quién come, avisa de dos almidones y marca cuándo un número no coincide con el que se dio antes."
---

# Calorías y proteína: calculadora de ChatiChef

Esta skill es un procedimiento. **Se suma a las instrucciones del proyecto ChatiChef, no las sustituye.** Si algo de aquí choca con las instrucciones del proyecto o con lo que pide el usuario en el momento, manda eso.

Por qué existe: los números estimados de cabeza fallan, sobre todo por no contar todo el aceite (unas lentejas dadas en ~530 kcal eran ~600). **Ningún número de kcal o proteína sale de memoria**: sale de esta calculadora.

## Antes de empezar: el perfil

El script lee `profile.json` (junto a él) o el que se le pase con `--profile`. Ahí van los ingredientes prohibidos (para todos y por comensal), el listón de kcal y proteína por tipo de semana y turno, y los almidones que no van en la cena. Si no existe, copia `scripts/profile.example.json` a `/tmp/chatichef/profile.json` y rellénalo con las restricciones de las instrucciones del proyecto.

## Cómo usarla

1. Copia `scripts/chatichef_nutrition.py` de esta skill a `/tmp/chatichef/` (y el perfil, si no está).
2. Por cada receta, escribe un JSON en `/tmp/chatichef/<id>.json` (formato abajo) con **las cantidades totales de la receta** y el número de raciones.
3. Ejecuta `python3 /tmp/chatichef/chatichef_nutrition.py /tmp/chatichef/<id>.json`. Para una semana entera, un bucle con todos los JSON.
4. Si sale `ERROR`, **corrige y vuelve a ejecutar**. Nunca des un número de una ejecución con error.
5. Usa los números redondeados de «PER SERVING» (por ración) (`~415 kcal · ~42 g`) en la receta, el tablero y Umami. Son los mismos en los tres sitios.
6. `python3 /tmp/chatichef/chatichef_nutrition.py --list <texto>` enseña los ids que conoce (p. ej. `--list tuna`). Los ids en español de la versión anterior también valen como alias (`atun-lata`, `contramuslo-pollo`…).

La calculadora escribe sus mensajes en inglés: abajo tienes qué significa cada uno.

### Formato del JSON

```json
{
  "name": "Pollo al chilindrón con patata",
  "servings": 2,
  "meal": "dinner",
  "week": "normal",
  "for": "everyone",
  "ingredients": [
    {"id": "chicken-thigh", "g": 400},
    {"id": "potato", "g": 200},
    {"id": "frozen-pepper", "g": 200},
    {"id": "carrot", "pc": 1},
    {"id": "garlic", "g": 10},
    {"id": "tomato-paste", "tbsp": 2},
    {"id": "olive-oil", "tsp": 1, "note": "dorar el pollo"},
    {"id": "olive-oil", "tsp": 1, "note": "sofrito"},
    {"id": "paprika"}, {"id": "water", "ml": 300}
  ],
  "custom": {"queso-vegano": {"kcal": 280, "protein": 2, "fat": 22, "carbs": 18, "source": "etiqueta"}},
  "previous": {"kcal": 415, "protein": 42}
}
```

- `meal` (turno): `dinner` (cena) · `lunch` (comida) · `dessert` (postre).
- `week` (semana): cualquier clave de `targets` del perfil (`normal`, `light`, `light_dinner`…) o `no_target` (postres).
- `for` (para quién): `everyone` (todos; comprueba los prohibidos de todos los comensales) o el nombre de un comensal del perfil (comprueba los comunes y los suyos).
- Cantidades: `g`, `ml`, `pc` (unidades con peso conocido: huevo, zanahoria, tomate, lata de atún…), `tbsp` (cucharada, 15 ml), `tsp` (cucharadita, 5 ml). Lo trivial (sal, especias, agua, vinagre, laurel, eritritol, estevia…) puede ir sin cantidad: cuenta 0.
- `custom`: cualquier producto que no esté en la tabla o cuya **etiqueta** tengas. Valores por 100 g (o por 100 ml con `"por": "ml"`). La etiqueta manda sobre la tabla.
- `previous`: el número que se dio antes de **esta misma receta**. Ponlo siempre que repitas, cambies o replanifiques una receta.

## Reglas al rellenar

- **Aceite: una entrada por cada uso** (sofrito, dorar, freír los huevos, cuajar la tortilla, aliño, engrasar), con su `note`. En fritura, el aceite que cuenta es el **absorbido**, no el de la sartén: en una tortilla de patatas bien escurrida, ~10 g por persona.
- Pesos **en crudo** y en la forma en que se compra: legumbre de paquete en seco, de bote escurrida; arroz y pasta en crudo; anacardos en crudo aunque luego se hiervan.
- **Huevos**: `egg` = 55 g sin cáscara. Si sabes la talla, `egg-m` (50 g) o `egg-l` (60 g).
- **Atún**: `tuna-can` = lata pequeña de 52 g escurridos. Si la lata es otra, pon `g`.
- **Proteína real, no la teórica**: si la bandeja pesa 580 g y el plato usa 300 g, pon 300 g.
- Un postre va con las raciones definidas que salen («8 vasitos» = 8).
- **Sesión doble**: un JSON por receta, nunca juntas.

## Qué decir con lo que sale

- Por ración: **~kcal y ~g de proteína**, y las **cantidades por persona de proteína e hidrato**.
- **Lo denso**: lo que sale en «Calorie-dense per serving» (densos por ración), en gramos o ml y kcal.
- **Listón** («Target»): si sale «ABOVE» (por encima) o «BELOW» (por debajo), dilo con el número; si la proteína se queda corta, **refuérzala antes de proponer** el plato o dilo explícitamente.
- **CORRECTION** (corrección): si aparece, dilo así o parecido: «Antes te dije ~530 kcal y 34 g; bien contado son ~600 kcal y 34 g», y usa el nuevo en todas partes.
- **CHECK** (revisar: dos almidones, o un almidón de mediodía en la cena): corrígelo, salvo que sea una receta fija o la haya pedido el usuario; en ese caso, una línea diciéndolo.
- **Notes** (avisos de etiquetado): pásalos a la nota «Etiquetado» de la receta.
- Los valores de la tabla son medios (±10 %). No des decimales: «~415 kcal», «~42 g».

## Si la tabla no tiene algo

1. Busca un alias con `--list`.
2. Si es un producto comprado con etiqueta, usa `custom` con los valores de la etiqueta.
3. Si es un alimento genérico que falta, usa `custom` con un valor medio de una tabla oficial (BEDCA o USDA) y `"source": "BEDCA"`, y dilo.
4. **Nunca** lo quites de la receta para que no dé error, ni lo cuentes como 0.
