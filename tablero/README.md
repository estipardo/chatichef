# Tablero ChatiChef

Una página para el móvil con seis pestañas: **Hoy**, **Resumen**, **Semana**, **Despensa**, **Compra** y **Notas**. Claude carga el menú en su base de datos; tú marcas desde el móvil los platos hechos (y se descuenta de la despensa lo que usaste), corres un plato a mañana, puntúas las recetas, tachas la compra y llevas el inventario de nevera, congelador y despensa.

Funciona como **artifact de Claude** con base de datos (`window.claude.use("db")`): fuera de claude.ai no guarda nada.

## Cómo montarlo

1. En un chat de tu proyecto ChatiChef, adjunta `tablero.html` y pide: «Publica este archivo como artifact, tal cual».
2. Copia el **slug** y el **enlace** que te dé y pégalos en `skills/chatichef-tablero/SKILL.md` (apartado «Datos fijos») antes de subir la skill.
3. Si quieres el botón «Pedir el menú», cambia `COBERTURA` al principio del script y sigue `docs/pedir-menu-desde-el-tablero.md`.
4. Para compartirlo con quien cocine contigo, compártelo desde claude.ai con permiso de edición.

## Colecciones

| Colección | Qué guarda |
|---|---|
| `config/current` | Semana que se enseña, versión y resumen de tiempos |
| `meals` | Un documento por plato y día (`meals/2026-11-19-cena`) |
| `shopping` | Una línea por producto, «tengo» o «falta» |
| `inventory` | Lo que hay en casa, con cantidad, sitio, caducidad y movimientos |
| `requests` | Pedidos del botón «Pedir el menú» |

Los campos exactos están en `skills/chatichef-tablero/SKILL.md`.
