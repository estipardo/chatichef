# ChatiChef

Un asistente de cocina semanal montado sobre un **proyecto de Claude**. Reinterpreta platos de siempre en versiones saludables (lasaña de calabacín, bechamel de anacardos, carbonara sin nata…), monta el menú de la semana alrededor de lo que ya tienes en la nevera y te da la lista de la compra solo con lo que falta.

Lo que lo hace distinto de pedirle recetas a un chat:

- **Tiempos honestos**: cada receta lleva tres números (cuchillo, fuego y total realista), porque el tiempo de fogón no cuenta pelar ni picar.
- **Calorías calculadas, no estimadas**: una calculadora en Python suma cada cucharada de aceite, comprueba tu listón de proteína y detecta ingredientes prohibidos según quién se come el plato.
- **Aprovechamiento**: pregunta qué te ha sobrado y cuánto, coloca primero lo abierto y lo descongelado, y la compra pasa a ser de reposición.
- **Recetas para nivel básico**: un paso por acción, la señal visible de "ya está hecho" y los errores típicos.
- **Tablero en el móvil** (opcional): menú, despensa, compra y notas, sincronizado con Claude.
- **Umami** (opcional): guarda las recetas confirmadas en tu recetario y en el plan de comidas.

## Qué hay aquí

| Carpeta | Qué es |
|---|---|
| `instrucciones/instrucciones-proyecto.md` | Plantilla de las instrucciones del proyecto. Rellena lo que va entre `[corchetes]`. |
| `instrucciones/tiempos-reales.md` | Tabla para estimar el tiempo de cuchillo. |
| `instrucciones/aprendizajes-de-cocina.md` | Técnicas que suelen fallar y cómo se arreglan. Ve añadiendo las tuyas. |
| `skills/chatichef-nutricion` | Skill + calculadora de kcal y proteína (`scripts/chatichef_nutricion.py`) con tu `perfil.json`. |
| `skills/chatichef-tablero` | Skill para leer y escribir en el tablero. |
| `skills/chatichef-guardar-umami` | Skill para guardar las recetas en Umami. |
| `tablero/` | La página del tablero, para publicarla como artifact. |
| `docs/` | El botón «Pedir el menú» del tablero y su tarea programada. |

## Cómo montarlo

1. **Crea un proyecto** en Claude (por ejemplo, «ChatiChef»).
2. **Instrucciones**: copia `instrucciones/instrucciones-proyecto.md` en las instrucciones del proyecto y rellena tus datos: cuántos sois, restricciones, lo que no coméis, equipo de cocina, supermercados. Quita las secciones *(opcional)* que no uses.
3. **Documentos**: sube `tiempos-reales.md` y `aprendizajes-de-cocina.md` al proyecto.
4. **Perfil de la calculadora**: copia `skills/chatichef-nutricion/scripts/perfil.ejemplo.json` como `perfil.json` en la misma carpeta y pon tus prohibidos y tu listón. Los ids son los de la tabla del script (`python3 chatichef_nutricion.py --lista`).
5. **Skills**: comprime cada carpeta de `skills/` en un `.zip` (o ejecuta `./empaquetar-skills.sh`) y súbelas como skills en Claude. Si no usas el tablero o Umami, sube solo `chatichef-nutricion`.
6. **Tablero** (opcional): sigue `tablero/README.md`.
7. **Umami** (opcional): necesitas un conector MCP de [Umami Recipes](https://www.umami.recipes/), por ejemplo [umami-recipes-mcp](https://github.com/Joshlucpoll/umami-recipes-mcp). La skill usa las herramientas de recetario y de plan de comidas.

Luego, en un chat del proyecto: «Hazme el menú de esta semana». Te preguntará qué comidas cubre, qué días coméis fuera y qué te ha sobrado.

## Probar la calculadora

```bash
cd skills/chatichef-nutricion/scripts
cp perfil.ejemplo.json perfil.json
cat > /tmp/receta.json <<'JSON'
{"nombre": "Pollo con patata", "raciones": 2, "turno": "cena", "semana": "normal", "para": "todos",
 "ingredientes": [{"id": "contramuslo-pollo", "g": 400}, {"id": "patata", "g": 300},
                  {"id": "aceite-oliva", "cdta": 2, "nota": "dorar"}, {"id": "pimenton"}]}
JSON
python3 chatichef_nutricion.py /tmp/receta.json
```

Los valores de la tabla son medios (±10 %) de tablas como BEDCA o USDA. **No es consejo médico ni nutricional**: si tienes una alergia o intolerancia, revisa siempre la etiqueta tú.

## Licencia

[MIT](LICENSE).
