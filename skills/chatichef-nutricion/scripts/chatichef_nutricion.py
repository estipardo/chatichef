#!/usr/bin/env python3
"""Calculadora de kcal y proteína por ración para ChatiChef.

Uso:
  python3 chatichef_nutricion.py receta.json [--perfil perfil.json]  # calcula una receta
  python3 chatichef_nutricion.py --lista [texto]  # lista los ingredientes conocidos (filtra por texto)

Formato de receta.json:
{
  "nombre": "Pollo al chilindrón con patata",
  "raciones": 2,
  "turno": "cena",            # cena | comida | postre
  "semana": "ligera",         # normal | ligera | cena_ligera (día que come fuera) | sin_liston (postres)
  "para": "todos",            # todos | o el nombre de un comensal del perfil (decide qué prohibidos se comprueban)
  "ingredientes": [
    {"id": "contramuslo-pollo", "g": 400},
    {"id": "aceite-oliva", "cdta": 1, "nota": "dorar el pollo"},
    {"id": "aceite-oliva", "cdta": 1, "nota": "sofrito"},
    {"id": "zanahoria", "ud": 1},
    {"id": "pimenton"}
  ],
  "custom": {"queso-vegano-x": {"kcal": 280, "prot": 2, "grasa": 22, "hc": 18, "por": "g", "fuente": "etiqueta"}},
  "anterior": {"kcal": 530, "prot": 34}   # opcional: lo que se dijo antes de esta misma receta
}
Cantidades: g, ml, ud, cda (15 ml), cdta (5 ml). Los ingredientes sin cantidad solo valen para los "triviales"
(sal, especias, agua, vinagre, laurel...). Un ingrediente desconocido o sin cantidad es un ERROR: no se cuenta como 0.
"""
import json, sys, difflib

# id: (kcal, prot, grasa, hc por 100 g o 100 ml), por ("g"|"ml"), ud_g (peso de 1 unidad útil), cda_g (peso de 1 cda), denso, aviso
D = {}
def a(i, kcal, prot, grasa, hc, por="g", ud=None, cda=None, denso=False, aviso=None, alias=()):
    D[i] = dict(kcal=kcal, prot=prot, grasa=grasa, hc=hc, por=por, ud=ud, cda=cda, denso=denso, aviso=aviso)
    for x in alias:
        ALIAS[x] = i
ALIAS = {}

# --- Carne (cruda, peso limpio) ---
a("pechuga-pollo", 110, 23.0, 1.5, 0, alias=("pollo-pechuga", "filetes-pechuga", "solomillo-pollo"))
a("contramuslo-pollo", 121, 19.7, 4.6, 0, alias=("contramuslos", "muslo-pollo-sin-piel"))
a("pavo-pechuga", 112, 24.0, 1.5, 0, alias=("pavo",))
a("ternera-picada-magra", 137, 21.0, 5.5, 0, aviso="Magra = ≤5 % de grasa. Si la bandeja dice más, usa ternera-picada.")
a("ternera-picada", 215, 18.6, 15.0, 0, aviso="Picada normal (~15 % grasa). Mira la etiqueta: algunas llevan 'preparado de carne' con azúcar o soja.")
a("ternera-guisar", 145, 20.5, 7.0, 0, alias=("ternera", "morcillo", "aguja-ternera", "ternera-filetes"))
a("lomo-cerdo", 143, 21.4, 5.7, 0, alias=("cinta-lomo", "escalopines-cerdo", "filetes-lomo"))
a("solomillo-cerdo", 120, 21.0, 3.5, 0)
a("magro-cerdo", 150, 20.0, 7.5, 0, alias=("taquitos-magro",))
a("aguja-cerdo", 200, 17.0, 14.5, 0)
a("chorizo", 455, 24.0, 38.0, 2, denso=True, aviso="Procesado: máximo 1 receta/semana. Etiqueta: azúcar, lactosa.")
a("bacon", 300, 15.0, 26.0, 1, denso=True, aviso="Procesado. Valor medio de taquitos; usa la etiqueta si la tienes (azúcar, lactosa).")
a("jamon-serrano", 250, 30.0, 14.0, 0, aviso="Procesado.")
# --- Huevo ---
a("huevo", 143, 12.6, 9.5, 0.7, ud=55, alias=("huevos",), aviso="1 huevo = 55 g sin cáscara (entre M y L). Si son M usa huevo-m; si son L, huevo-l.")
a("huevo-m", 143, 12.6, 9.5, 0.7, ud=50)
a("huevo-l", 143, 12.6, 9.5, 0.7, ud=60)
a("clara", 52, 10.9, 0.2, 0.7, ud=33, alias=("claras",))
a("yema", 322, 15.9, 26.5, 3.6, ud=17, alias=("yemas",))
# --- Pescado y marisco (crudo) ---
a("merluza", 80, 17.5, 1.3, 0)
a("lubina", 97, 18.4, 2.0, 0)
a("dorada", 110, 20.0, 3.0, 0)
a("gambas", 85, 20.0, 0.5, 0, alias=("gambas-peladas", "langostinos-pelados"))
a("pota", 92, 15.6, 1.4, 3.1, alias=("calamar", "anillas-de-pota", "anillas-pota"))
a("salmon-ahumado", 117, 18.3, 4.3, 0, aviso="Etiqueta: azúcar en la salmuera (la dextrosa vale).")
a("atun-lata", 198, 29.0, 8.0, 0, ud=52, alias=("atun-aceite", "atun"), aviso="Lata pequeña: 52 g escurrido (comprueba el peso escurrido de la lata).")
a("atun-natural", 116, 26.0, 1.0, 0, ud=52)
a("anchoas", 210, 29.0, 10.0, 0, ud=30)
# --- Legumbre ---
a("lentejas-secas", 310, 24.0, 1.5, 49, alias=("lentejas-pardinas", "lentejas"), aviso="Peso en seco (90 g/ración).")
a("lentejas-bote", 90, 7.0, 0.5, 13, aviso="Peso escurrido. Etiqueta: azúcar.")
a("garbanzos-secos", 340, 19.5, 5.5, 50)
a("garbanzos-bote", 120, 7.0, 2.5, 16, alias=("garbanzos-cocidos",), aviso="Peso escurrido (mira el bote: varía mucho). Etiqueta: azúcar.")
a("alubias-bote", 100, 7.0, 0.5, 15, alias=("alubias-blancas-bote",), aviso="Peso escurrido. Etiqueta: azúcar.")
# --- Cereales, harinas, almidones ---
a("patata", 77, 2.0, 0.1, 17, alias=("patatas",))
a("arroz", 360, 7.0, 0.6, 79, alias=("arroz-blanco",), aviso="Peso en crudo.")
a("arroz-integral", 365, 7.6, 2.8, 74, aviso="Peso en crudo.")
a("arroz-integral-precocido", 145, 3.4, 1.6, 29, alias=("arroz-vasito",), aviso="Arroz de vasito/bote ya cocido.")
a("pasta", 355, 12.5, 1.5, 71, alias=("macarrones", "espaguetis", "fideos"), aviso="Peso en crudo.")
a("pasta-integral", 345, 13.0, 2.5, 64, aviso="Peso en crudo.")
a("quinoa", 368, 14.1, 6.1, 57, aviso="Peso en crudo.")
a("pan-hamburguesa", 270, 9.0, 4.5, 48, ud=60, aviso="Pan de 60 g por defecto: pésalo o mira la etiqueta.")
a("pan", 260, 9.0, 1.5, 51, alias=("pan-barra",))
a("base-pizza", 275, 8.5, 4.0, 52, ud=140, alias=("masa-pizza",), aviso="Base de 140 g; valor medio, confirma con la etiqueta si la tienes delante.")
a("tortilla-trigo", 310, 8.5, 7.0, 51, aviso="Etiqueta: azúcar.")
a("pan-rallado", 360, 12.0, 3.0, 72, cda=8)
a("harina-trigo", 340, 10.0, 1.2, 72, cda=8, alias=("harina",))
a("maicena", 380, 0.3, 0.1, 91, cda=8)
a("harina-almendra", 590, 21.0, 52.0, 7, cda=7, denso=True)
a("harina-avena", 380, 13.0, 7.0, 60, cda=7, alias=("copos-avena", "avena"))
a("harina-garbanzo", 380, 22.0, 6.5, 50, cda=8)
# --- Verdura y fruta (cruda) ---
a("calabacin", 17, 1.2, 0.3, 2.5)
a("pimiento-rojo", 31, 1.0, 0.3, 4.5, ud=180)
a("pimiento-verde", 20, 0.9, 0.2, 2.9, ud=120, alias=("pimiento-italiano",))
a("pimiento-congelado", 25, 1.0, 0.2, 4.0, alias=("pimiento-troceado", "pimiento-tiras"))
a("judias-verdes", 31, 1.8, 0.2, 4.0, alias=("judias-verdes-congeladas",))
a("zanahoria", 41, 0.9, 0.2, 7.0, ud=70, alias=("zanahoria-rallada",))
a("tomate", 18, 0.9, 0.2, 2.7, ud=120, alias=("tomates",))
a("tomate-triturado", 32, 1.6, 0.3, 5.0, aviso="Etiqueta: azúcar.")
a("tomate-concentrado", 82, 4.3, 0.5, 15, cda=15, aviso="Sin azúcar añadido.")
a("tomate-frito", 75, 1.5, 3.5, 9, aviso="Casi todos llevan azúcar: mira la etiqueta.")
a("champinon", 22, 3.1, 0.3, 2.3, alias=("champinones",))
a("champinon-bote", 25, 1.9, 0.3, 2.5, alias=("champinones-laminados", "champinones-bote"), aviso="Peso escurrido.")
a("espinacas", 25, 3.0, 0.4, 1.5, alias=("espinacas-congeladas",))
a("berenjena", 25, 1.0, 0.2, 3.0)
a("calabaza", 26, 1.0, 0.1, 6.5)
a("lechuga", 15, 1.4, 0.2, 1.8, alias=("cogollo", "hojas-ensalada", "bolsa-ensalada"))
a("ajo", 149, 6.4, 0.5, 30, ud=4, alias=("ajo-troceado", "diente-ajo"))
a("guisantes", 77, 5.2, 0.4, 9.5, alias=("guisantes-congelados",))
a("aceitunas", 145, 1.0, 15.0, 0.5, ud=4, denso=True)
a("limon-zumo", 22, 0.4, 0.2, 7, por="ml", alias=("zumo-limon", "lima-zumo"))
a("fresa", 32, 0.7, 0.3, 5.7, alias=("fresas",))
a("frambuesa", 52, 1.2, 0.7, 5.4, alias=("frambuesas",))
a("arandano", 57, 0.7, 0.3, 12, alias=("arandanos",))
a("platano", 89, 1.1, 0.3, 20, ud=120)
# --- Grasas y densos ---
a("aceite-oliva", 813, 0, 92, 0, por="ml", denso=True, alias=("aceite", "aove", "aceite-girasol"))
a("anacardos", 553, 18.2, 43.8, 27, denso=True, aviso="Peso en crudo, antes de hervir.")
a("almendra", 579, 21.0, 50.0, 10, denso=True, alias=("almendras",))
a("leche-coco", 190, 1.8, 19.5, 2.5, por="ml", denso=True, aviso="Lata normal (no light). Etiqueta: si pone light, usa custom.")
a("coco-rallado", 660, 6.9, 64.5, 6, denso=True)
a("tahini", 595, 17.0, 54.0, 10, cda=15, denso=True)
a("aguacate", 160, 2.0, 14.7, 1.8, denso=True)
a("nata-vegetal", 150, 1.0, 13.0, 7, por="ml", denso=True, alias=("nata-avena", "nata-almendra"), aviso="Valor medio; etiqueta: azúcar, inulina, soja.")
a("bebida-almendra", 13, 0.4, 1.1, 0.1, por="ml", alias=("leche-almendras",), aviso="Sin azúcares añadidos.")
a("bebida-avena", 42, 0.8, 1.5, 6.5, por="ml", alias=("leche-avena",), aviso="Sin azúcares añadidos.")
a("levadura-nutricional", 360, 48.0, 4.5, 15, cda=5, aviso="Valor medio de copos; confirma con la etiqueta.")
a("mostaza", 66, 4.4, 4.0, 2.0, cda=15, aviso="Etiqueta: miel, azúcar, jarabe de glucosa-fructosa.")
a("cacao-puro", 230, 20.0, 14.0, 21, cda=6)
a("dextrosa", 370, 0, 0, 92, cda=12)
a("sirope-arroz", 316, 0.6, 0.2, 76, por="ml")
a("caldo", 6, 0.6, 0.2, 0.4, por="ml", alias=("caldo-pollo", "caldo-verduras"), aviso="Etiqueta: soja, FOS.")
# --- Lácteos animales ---
a("leche-sin-lactosa", 62, 3.2, 3.5, 4.7, por="ml", alias=("leche-entera-sin-lactosa",))
a("feta", 264, 14.2, 21.3, 4.1, denso=True)
a("nata-animal", 345, 2.0, 36.0, 3.0, por="ml", denso=True)

TRIVIALES = {"sal", "pimienta", "pimenton", "pimenton-dulce", "pimenton-ahumado", "laurel", "oregano", "comino",
             "curcuma", "perejil", "tomillo", "romero", "guindilla", "cayena", "agua", "vinagre", "vinagre-vino",
             "especias", "eritritol", "estevia", "canela", "vainilla", "nuez-moscada", "levadura-quimica",
             "bicarbonato", "hielo", "ajo-en-polvo", "cebollino", "albahaca", "eneldo", "jengibre"}

ALMIDONES = {"patata": "patata", "arroz": "arroz", "arroz-integral": "arroz", "arroz-integral-precocido": "arroz",
             "pasta": "pasta", "pasta-integral": "pasta", "quinoa": "quinoa", "pan-hamburguesa": "pan", "pan": "pan",
             "base-pizza": "pan", "tortilla-trigo": "pan", "lentejas-secas": "legumbre", "lentejas-bote": "legumbre",
             "garbanzos-secos": "legumbre", "garbanzos-bote": "legumbre", "alubias-bote": "legumbre"}

# --- Perfil: prohibidos, listones y almidones de mediodía (ver perfil.ejemplo.json) ---
PERFIL_DEFECTO = {
    "prohibidos": {"todos": []},
    "solo_mediodia": [],
    "liston": {"normal": {"cena": [500, 550, 45], "comida": [500, 550, 45]}},
}
PERFIL = PERFIL_DEFECTO

def cargar_perfil(ruta):
    global PERFIL
    import os
    if ruta is None:
        cand = os.path.join(os.path.dirname(os.path.abspath(__file__)), "perfil.json")
        ruta = cand if os.path.exists(cand) else None
    if ruta:
        PERFIL = json.load(open(ruta, encoding="utf-8"))

def prohibido(i, para):
    """Devuelve el motivo si el ingrediente está prohibido para quien come el plato.
    perfil["prohibidos"] = {"todos": [...], "<comensal>": [...]}.
    Con para="todos" se comprueban las listas de todos los comensales; con un nombre, la común y la suya."""
    pro = PERFIL.get("prohibidos", {})
    listas = pro.items() if para == "todos" else [(k, v) for k, v in pro.items() if k in ("todos", para)]
    for quien, lista in listas:
        if i in lista:
            return "no lo come nadie" if quien == "todos" else f"{quien} no lo come"
    return None

def liston(semana, turno):
    v = PERFIL.get("liston", {}).get(semana, {}).get(turno)
    return tuple(v) if v else None

def err(msg):
    print("ERROR: " + msg)
    sys.exit(1)

def fallo(msg):
    raise ValueError(msg)

def resolver(i, custom):
    if i in custom:
        c = custom[i]
        for k in ("kcal", "prot"):
            if k not in c:
                err(f"custom '{i}' sin '{k}'.")
        return dict(kcal=c["kcal"], prot=c["prot"], grasa=c.get("grasa", 0), hc=c.get("hc", 0), por=c.get("por", "g"),
                     ud=c.get("ud"), cda=c.get("cda"), denso=c.get("denso", False), aviso="Valor de " + c.get("fuente", "custom"))
    return D.get(ALIAS.get(i, i))

def cantidad(ing, d):
    i = ing["id"]
    if "g" in ing:
        if d["por"] == "ml":
            dens = 0.92 if d["grasa"] >= 90 else 1.0
            return ing["g"] / dens, f'{ing["g"]} g'
        return ing["g"], f'{ing["g"]} g'
    if "ml" in ing:
        if d["por"] != "ml":
            fallo(f"'{i}' se mide en g, no en ml.")
        return ing["ml"], f'{ing["ml"]} ml'
    for u, ml in (("cda", 15), ("cdta", 5)):
        if u in ing:
            n = ing[u]
            if d["por"] == "ml":
                return n * ml, f"{n} {u} ({n*ml:g} ml)"
            if d.get("cda"):
                g = n * d["cda"] * (ml / 15)
                return g, f"{n} {u} (~{g:.0f} g)"
            fallo(f"'{i}' no tiene equivalencia de cucharada: da la cantidad en g.")
    if "ud" in ing:
        if not d.get("ud"):
            fallo(f"'{i}' no tiene peso por unidad: da la cantidad en g.")
        g = ing["ud"] * d["ud"]
        return g, f'{ing["ud"]} ud (~{g:g} g)'
    fallo(f"'{i}' no tiene cantidad (g, ml, ud, cda o cdta).")

def listar(filtro=""):
    for i in sorted(set(D) | set(ALIAS)):
        if filtro in i:
            d = D[ALIAS.get(i, i)]
            extra = f" (= {ALIAS[i]})" if i in ALIAS else ""
            print(f"{i}{extra}: {d['kcal']} kcal, {d['prot']} g prot / 100 {d['por']}" + (f" · 1 ud = {d['ud']} g" if d['ud'] else ""))
    print("Triviales (sin cantidad, 0 kcal): " + ", ".join(sorted(TRIVIALES)))

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--lista":
        return listar(sys.argv[2] if len(sys.argv) > 2 else "")
    args = sys.argv[1:]
    ruta_perfil = None
    if "--perfil" in args:
        k = args.index("--perfil")
        ruta_perfil = args[k + 1]
        del args[k:k + 2]
    if not args:
        err("pasa el archivo JSON de la receta (o --lista).")
    cargar_perfil(ruta_perfil)
    r = json.load(open(args[0], encoding="utf-8"))
    rac = r.get("raciones")
    if not rac or rac <= 0:
        err("falta 'raciones'.")
    custom = r.get("custom", {})
    para = r.get("para", "todos")
    problemas = []
    tot = dict(kcal=0, prot=0, grasa=0, hc=0)
    filas, densos, avisos, desconocidos, aceite_ml, n_aceite = [], {}, [], [], 0.0, 0
    for ing in r["ingredientes"]:
        i = ing["id"]
        if i in TRIVIALES:
            continue
        motivo = prohibido(ALIAS.get(i, i), para)
        if motivo:
            problemas.append(f"'{i}' está PROHIBIDO para este plato ({motivo}; para={para})")
            continue
        d = resolver(i, custom)
        if d is None:
            sug = difflib.get_close_matches(i, list(D) + list(ALIAS), n=3, cutoff=0.5)
            desconocidos.append(i + (f" (¿quizá {', '.join(sug)}?)" if sug else ""))
            continue
        try:
            q, txt = cantidad(ing, d)
        except ValueError as e:
            problemas.append(str(e))
            continue
        f = q / 100
        k, p = d["kcal"] * f, d["prot"] * f
        tot["kcal"] += k; tot["prot"] += p; tot["grasa"] += d["grasa"] * f; tot["hc"] += d["hc"] * f
        filas.append((i, txt + (f" · {ing['nota']}" if ing.get("nota") else ""), k / rac, p / rac))
        if d["denso"]:
            prev = densos.get(i, [0, 0, d["por"]])
            densos[i] = [prev[0] + q / rac, prev[1] + k / rac, d["por"]]
        if ALIAS.get(i, i) == "aceite-oliva":
            aceite_ml += q; n_aceite += 1
        if d.get("aviso") and d["aviso"] not in avisos:
            avisos.append(f"{i}: {d['aviso']}")
    if desconocidos:
        problemas.append("ingredientes que no conozco (no se cuentan como 0): " + "; ".join(desconocidos) +
                         ". Usa un id de --lista, un alias, o añádelo en 'custom' con los valores de la etiqueta")
    if problemas:
        print("ERROR — no se calcula nada hasta corregir esto:")
        for x in problemas:
            print("  - " + x)
        sys.exit(1)

    print(f"== {r.get('nombre', 'Receta')} · {rac} {'ración' if rac == 1 else 'raciones'} ==")
    print(f"{'Ingrediente':28} {'Cantidad (total)':42} {'kcal/rac':>9} {'prot/rac':>9}")
    for i, txt, k, p in filas:
        print(f"{i:28} {txt[:42]:42} {k:9.0f} {p:9.1f}")
    kr, pr = tot["kcal"] / rac, tot["prot"] / rac
    print(f"\nPOR RACIÓN: ~{5*round(kr/5)} kcal · ~{round(pr)} g proteína · {tot['grasa']/rac:.0f} g grasa · {tot['hc']/rac:.0f} g hidratos")
    print(f"(exacto: {kr:.0f} kcal, {pr:.1f} g)")
    if n_aceite:
        print(f"Aceite: {n_aceite} entrada(s), {aceite_ml:.0f} ml en total = {aceite_ml/rac:.1f} ml/ración "
              f"(~{aceite_ml*0.92*8.84/rac:.0f} kcal/ración). Comprueba que están TODAS las cucharadas (sofrito, dorar, huevos, cuajar, aliño).")
    else:
        if r.get("turno") != "postre": print("Aceite: NINGUNA entrada. Si la receta usa aceite en algún paso (sofrito, dorar, freír, aliñar, engrasar), añádelo.")
    if densos:
        print("Densos por ración (decírselo al usuario):")
        for i, (q, k, por) in densos.items():
            print(f"  - {i}: {q:.0f} {'ml' if por == 'ml' else 'g'} → ~{k:.0f} kcal")
    sem, turno = r.get("semana", "normal"), r.get("turno", "cena")
    lis = liston(sem, turno)
    if lis:
        lo, hi, pmin = lis
        msg = []
        if kr > hi * 1.03: msg.append(f"por ENCIMA de {hi} kcal")
        if lo and kr < lo * 0.9: msg.append(f"por debajo de {lo} kcal")
        if pr < pmin - 1: msg.append(f"proteína por DEBAJO de {pmin} g → refuérzala o díselo")
        print(f"Listón ({sem}, {turno}: {('%d–' % lo) if lo else '≤'}{hi} kcal, ≥{pmin} g): " + ("; ".join(msg) if msg else "dentro"))
    alm = sorted({ALMIDONES[ALIAS.get(x['id'], x['id'])] for x in r["ingredientes"] if ALIAS.get(x['id'], x['id']) in ALMIDONES})
    if len(alm) > 1:
        print(f"REVISAR: más de un almidón ({', '.join(alm)}). La regla es uno por plato; solo vale si es una receta fija o la ha pedido el usuario.")
    solo_mediodia = set(PERFIL.get("solo_mediodia", []))
    if turno == "cena" and solo_mediodia & set(alm):
        print(f"REVISAR: {', '.join(sorted(solo_mediodia & set(alm)))} en una CENA, y el perfil dice que son solo de mediodía.")
    ant = r.get("anterior")
    if ant:
        dk, dp = kr - ant.get("kcal", kr), pr - ant.get("prot", pr)
        if abs(dk) > max(30, 0.07 * kr) or abs(dp) >= 3:
            print(f"CORRECCIÓN: antes se dijo ~{ant.get('kcal')} kcal / {ant.get('prot')} g; ahora sale ~{5*round(kr/5)} kcal / {round(pr)} g. "
                  "Díselo explícitamente al usuario con el número corregido.")
        else:
            print(f"Coincide con lo dicho antes (~{ant.get('kcal')} kcal / {ant.get('prot')} g).")
    if avisos:
        print("Avisos:")
        for x in avisos:
            print("  - " + x)

if __name__ == "__main__":
    main()
