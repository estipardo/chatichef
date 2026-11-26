#!/usr/bin/env python3
"""ChatiChef calorie and protein calculator (per serving).

Usage:
  python3 chatichef_nutrition.py recipe.json [--profile profile.json]   # calculate one recipe
  python3 chatichef_nutrition.py --list [text]                          # list known ingredients (filter by text)

recipe.json:
{
  "name": "Chicken chilindron with potatoes",
  "servings": 2,
  "meal": "dinner",            # dinner | lunch | dessert
  "week": "light",             # any key of "targets" in the profile, or "no_target" (desserts)
  "for": "everyone",           # everyone | or the name of one diner in the profile (decides which forbidden lists apply)
  "ingredients": [
    {"id": "chicken-thigh", "g": 400},
    {"id": "olive-oil", "tsp": 1, "note": "brown the chicken"},
    {"id": "olive-oil", "tsp": 1, "note": "sofrito"},
    {"id": "carrot", "pc": 1},
    {"id": "paprika"}
  ],
  "custom": {"vegan-cheese-x": {"kcal": 280, "protein": 2, "fat": 22, "carbs": 18, "per": "g", "source": "label"}},
  "previous": {"kcal": 530, "protein": 34}   # optional: what was said before for this same recipe
}
Amounts: g, ml, pc (pieces), tbsp (15 ml), tsp (5 ml). Only "trivial" ingredients (salt, spices, water, vinegar,
bay leaf...) may go without an amount. An unknown ingredient, or one without an amount, is an ERROR: it is never counted as 0.
Spanish ids (from the Spanish version of ChatiChef) work as aliases.
"""
import json, os, sys, difflib

# id: kcal, protein, fat, carbs per 100 g (or 100 ml); per ("g"|"ml"); pc = grams in one useful piece;
# tbsp = grams in one tablespoon; dense = calorie-dense (report the portion); note = labelling or weighing warning
D = {}
ALIAS = {}
def a(i, kcal, protein, fat, carbs, per="g", pc=None, tbsp=None, dense=False, note=None, alias=()):
    D[i] = dict(kcal=kcal, protein=protein, fat=fat, carbs=carbs, per=per, pc=pc, tbsp=tbsp, dense=dense, note=note)
    for x in alias:
        ALIAS[x] = i

# --- Meat (raw, trimmed weight) ---
a("chicken-breast", 110, 23.0, 1.5, 0, alias=("chicken-fillet", "chicken-tenderloin", "pechuga-pollo", "pollo-pechuga", "filetes-pechuga", "solomillo-pollo"))
a("chicken-thigh", 121, 19.7, 4.6, 0, alias=("chicken-thighs", "skinless-chicken-thigh", "contramuslo-pollo", "contramuslos", "muslo-pollo-sin-piel"))
a("turkey-breast", 112, 24.0, 1.5, 0, alias=("turkey", "pavo-pechuga", "pavo"))
a("lean-minced-beef", 137, 21.0, 5.5, 0, alias=("ternera-picada-magra",), note="Lean = 5 % fat or less. If the pack says more, use minced-beef.")
a("minced-beef", 215, 18.6, 15.0, 0, alias=("ternera-picada",), note="Regular mince (~15 % fat). Check the label: some are a 'meat preparation' with sugar or soy.")
a("stewing-beef", 145, 20.5, 7.0, 0, alias=("beef", "beef-shank", "beef-steaks", "ternera-guisar", "ternera", "morcillo", "aguja-ternera", "ternera-filetes"))
a("pork-loin", 143, 21.4, 5.7, 0, alias=("pork-loin-steaks", "lomo-cerdo", "cinta-lomo", "escalopines-cerdo", "filetes-lomo"))
a("pork-tenderloin", 120, 21.0, 3.5, 0, alias=("solomillo-cerdo",))
a("lean-pork", 150, 20.0, 7.5, 0, alias=("diced-pork", "magro-cerdo", "taquitos-magro"))
a("pork-shoulder", 200, 17.0, 14.5, 0, alias=("aguja-cerdo",))
a("chorizo", 455, 24.0, 38.0, 2, dense=True, note="Processed: one recipe a week at most. Label: sugar, lactose.")
a("bacon", 300, 15.0, 26.0, 1, dense=True, note="Processed. Average for diced bacon; use the label if you have it (sugar, lactose).")
a("serrano-ham", 250, 30.0, 14.0, 0, alias=("jamon-serrano", "ham"), note="Processed.")
# --- Eggs ---
a("egg", 143, 12.6, 9.5, 0.7, pc=55, alias=("eggs", "huevo", "huevos"), note="1 egg = 55 g without shell (between M and L). For M use egg-m; for L, egg-l.")
a("egg-m", 143, 12.6, 9.5, 0.7, pc=50, alias=("huevo-m",))
a("egg-l", 143, 12.6, 9.5, 0.7, pc=60, alias=("huevo-l",))
a("egg-white", 52, 10.9, 0.2, 0.7, pc=33, alias=("egg-whites", "clara", "claras"))
a("egg-yolk", 322, 15.9, 26.5, 3.6, pc=17, alias=("egg-yolks", "yema", "yemas"))
# --- Fish and seafood (raw) ---
a("hake", 80, 17.5, 1.3, 0, alias=("merluza",))
a("sea-bass", 97, 18.4, 2.0, 0, alias=("lubina",))
a("sea-bream", 110, 20.0, 3.0, 0, alias=("dorada",))
a("prawns", 85, 20.0, 0.5, 0, alias=("shrimp", "peeled-prawns", "gambas", "gambas-peladas", "langostinos-pelados"))
a("squid", 92, 15.6, 1.4, 3.1, alias=("squid-rings", "pota", "calamar", "anillas-de-pota", "anillas-pota"))
a("smoked-salmon", 117, 18.3, 4.3, 0, alias=("salmon-ahumado",), note="Label: sugar in the brine (dextrose is fine).")
a("tuna-can", 198, 29.0, 8.0, 0, pc=52, alias=("tuna-in-oil", "tuna", "atun-lata", "atun-aceite", "atun"), note="Small can: 52 g drained (check the drained weight on the can).")
a("tuna-can-water", 116, 26.0, 1.0, 0, pc=52, alias=("atun-natural",))
a("anchovies", 210, 29.0, 10.0, 0, pc=30, alias=("anchoas",))
# --- Pulses ---
a("dry-lentils", 310, 24.0, 1.5, 49, alias=("lentils", "lentejas-secas", "lentejas-pardinas", "lentejas"), note="Dry weight (90 g per serving).")
a("canned-lentils", 90, 7.0, 0.5, 13, alias=("lentejas-bote",), note="Drained weight. Label: sugar.")
a("dry-chickpeas", 340, 19.5, 5.5, 50, alias=("garbanzos-secos",))
a("canned-chickpeas", 120, 7.0, 2.5, 16, alias=("cooked-chickpeas", "garbanzos-bote", "garbanzos-cocidos"), note="Drained weight (check the jar: it varies a lot). Label: sugar.")
a("canned-beans", 100, 7.0, 0.5, 15, alias=("canned-white-beans", "alubias-bote", "alubias-blancas-bote"), note="Drained weight. Label: sugar.")
# --- Grains, flours, starches ---
a("potato", 77, 2.0, 0.1, 17, alias=("potatoes", "patata", "patatas"))
a("rice", 360, 7.0, 0.6, 79, alias=("white-rice", "arroz", "arroz-blanco"), note="Raw weight.")
a("brown-rice", 365, 7.6, 2.8, 74, alias=("arroz-integral",), note="Raw weight.")
a("precooked-brown-rice", 145, 3.4, 1.6, 29, alias=("rice-cup", "arroz-integral-precocido", "arroz-vasito"), note="Ready-cooked rice cup or pouch.")
a("pasta", 355, 12.5, 1.5, 71, alias=("macaroni", "spaghetti", "noodles", "macarrones", "espaguetis", "fideos"), note="Raw weight.")
a("wholewheat-pasta", 345, 13.0, 2.5, 64, alias=("pasta-integral",), note="Raw weight.")
a("quinoa", 368, 14.1, 6.1, 57, note="Raw weight.")
a("burger-bun", 270, 9.0, 4.5, 48, pc=60, alias=("pan-hamburguesa",), note="60 g bun by default: weigh it or check the label.")
a("bread", 260, 9.0, 1.5, 51, alias=("baguette", "pan", "pan-barra"))
a("pizza-base", 275, 8.5, 4.0, 52, pc=140, alias=("pizza-dough", "base-pizza", "masa-pizza"), note="140 g base; average value, check the label if you have it.")
a("wheat-tortilla", 310, 8.5, 7.0, 51, alias=("tortilla-trigo",), note="Label: sugar.")
a("breadcrumbs", 360, 12.0, 3.0, 72, tbsp=8, alias=("pan-rallado",))
a("wheat-flour", 340, 10.0, 1.2, 72, tbsp=8, alias=("flour", "harina-trigo", "harina"))
a("cornflour", 380, 0.3, 0.1, 91, tbsp=8, alias=("cornstarch", "maicena"))
a("almond-flour", 590, 21.0, 52.0, 7, tbsp=7, dense=True, alias=("harina-almendra",))
a("oat-flour", 380, 13.0, 7.0, 60, tbsp=7, alias=("oats", "rolled-oats", "harina-avena", "copos-avena", "avena"))
a("chickpea-flour", 380, 22.0, 6.5, 50, tbsp=8, alias=("harina-garbanzo",))
# --- Vegetables and fruit (raw) ---
a("courgette", 17, 1.2, 0.3, 2.5, alias=("zucchini", "calabacin"))
a("red-pepper", 31, 1.0, 0.3, 4.5, pc=180, alias=("pimiento-rojo",))
a("green-pepper", 20, 0.9, 0.2, 2.9, pc=120, alias=("italian-pepper", "pimiento-verde", "pimiento-italiano"))
a("frozen-pepper", 25, 1.0, 0.2, 4.0, alias=("pepper-strips", "pimiento-congelado", "pimiento-troceado", "pimiento-tiras"))
a("green-beans", 31, 1.8, 0.2, 4.0, alias=("frozen-green-beans", "judias-verdes", "judias-verdes-congeladas"))
a("carrot", 41, 0.9, 0.2, 7.0, pc=70, alias=("grated-carrot", "zanahoria", "zanahoria-rallada"))
a("tomato", 18, 0.9, 0.2, 2.7, pc=120, alias=("tomatoes", "tomate", "tomates"))
a("crushed-tomato", 32, 1.6, 0.3, 5.0, alias=("tomate-triturado",), note="Label: sugar.")
a("tomato-paste", 82, 4.3, 0.5, 15, tbsp=15, alias=("tomate-concentrado",), note="No added sugar.")
a("tomato-sauce", 75, 1.5, 3.5, 9, alias=("tomate-frito",), note="Almost all have sugar: check the label.")
a("mushroom", 22, 3.1, 0.3, 2.3, alias=("mushrooms", "champinon", "champinones"))
a("canned-mushroom", 25, 1.9, 0.3, 2.5, alias=("sliced-mushrooms", "champinon-bote", "champinones-laminados", "champinones-bote"), note="Drained weight.")
a("spinach", 25, 3.0, 0.4, 1.5, alias=("frozen-spinach", "espinacas", "espinacas-congeladas"))
a("aubergine", 25, 1.0, 0.2, 3.0, alias=("eggplant", "berenjena"))
a("pumpkin", 26, 1.0, 0.1, 6.5, alias=("squash", "calabaza"))
a("lettuce", 15, 1.4, 0.2, 1.8, alias=("salad-leaves", "salad-bag", "lechuga", "cogollo", "hojas-ensalada", "bolsa-ensalada"))
a("garlic", 149, 6.4, 0.5, 30, pc=4, alias=("chopped-garlic", "garlic-clove", "ajo", "ajo-troceado", "diente-ajo"))
a("peas", 77, 5.2, 0.4, 9.5, alias=("frozen-peas", "guisantes", "guisantes-congelados"))
a("olives", 145, 1.0, 15.0, 0.5, pc=4, dense=True, alias=("aceitunas",))
a("lemon-juice", 22, 0.4, 0.2, 7, per="ml", alias=("lime-juice", "limon-zumo", "zumo-limon", "lima-zumo"))
a("strawberry", 32, 0.7, 0.3, 5.7, alias=("strawberries", "fresa", "fresas"))
a("raspberry", 52, 1.2, 0.7, 5.4, alias=("raspberries", "frambuesa", "frambuesas"))
a("blueberry", 57, 0.7, 0.3, 12, alias=("blueberries", "arandano", "arandanos"))
a("banana", 89, 1.1, 0.3, 20, pc=120, alias=("platano",))
# --- Fats and calorie-dense ---
a("olive-oil", 813, 0, 92, 0, per="ml", dense=True, alias=("oil", "evoo", "sunflower-oil", "aceite-oliva", "aceite", "aove", "aceite-girasol"))
a("cashews", 553, 18.2, 43.8, 27, dense=True, alias=("anacardos",), note="Raw weight, before boiling.")
a("almonds", 579, 21.0, 50.0, 10, dense=True, alias=("almond", "almendra", "almendras"))
a("coconut-milk", 190, 1.8, 19.5, 2.5, per="ml", dense=True, alias=("leche-coco",), note="Regular can (not light). If it says light, use custom.")
a("desiccated-coconut", 660, 6.9, 64.5, 6, dense=True, alias=("coco-rallado",))
a("tahini", 595, 17.0, 54.0, 10, tbsp=15, dense=True)
a("avocado", 160, 2.0, 14.7, 1.8, dense=True, alias=("aguacate",))
a("plant-cream", 150, 1.0, 13.0, 7, per="ml", dense=True, alias=("oat-cream", "almond-cream", "nata-vegetal", "nata-avena", "nata-almendra"), note="Average value; label: sugar, inulin, soy.")
a("almond-drink", 13, 0.4, 1.1, 0.1, per="ml", alias=("almond-milk", "bebida-almendra", "leche-almendras"), note="No added sugar.")
a("oat-drink", 42, 0.8, 1.5, 6.5, per="ml", alias=("oat-milk", "bebida-avena", "leche-avena"), note="No added sugar.")
a("nutritional-yeast", 360, 48.0, 4.5, 15, tbsp=5, alias=("levadura-nutricional",), note="Average for flakes; check the label.")
a("mustard", 66, 4.4, 4.0, 2.0, tbsp=15, alias=("mostaza",), note="Label: honey, sugar, glucose-fructose syrup.")
a("cocoa-powder", 230, 20.0, 14.0, 21, tbsp=6, alias=("cacao-puro",))
a("dextrose", 370, 0, 0, 92, tbsp=12, alias=("dextrosa",))
a("rice-syrup", 316, 0.6, 0.2, 76, per="ml", alias=("sirope-arroz",))
a("stock", 6, 0.6, 0.2, 0.4, per="ml", alias=("broth", "chicken-stock", "vegetable-stock", "caldo", "caldo-pollo", "caldo-verduras"), note="Label: soy, FOS.")
# --- Animal dairy ---
a("lactose-free-milk", 62, 3.2, 3.5, 4.7, per="ml", alias=("leche-sin-lactosa", "leche-entera-sin-lactosa"))
a("feta", 264, 14.2, 21.3, 4.1, dense=True)
a("dairy-cream", 345, 2.0, 36.0, 3.0, per="ml", dense=True, alias=("cream", "nata-animal"))

TRIVIAL = {"salt", "pepper", "paprika", "sweet-paprika", "smoked-paprika", "bay-leaf", "oregano", "cumin", "turmeric",
           "parsley", "thyme", "rosemary", "chilli", "cayenne", "water", "vinegar", "wine-vinegar", "spices", "erythritol",
           "stevia", "cinnamon", "vanilla", "nutmeg", "baking-powder", "baking-soda", "ice", "garlic-powder", "chives",
           "basil", "dill", "ginger"}
TRIVIAL_ES = {"sal", "pimienta", "pimenton", "pimenton-dulce", "pimenton-ahumado", "laurel", "comino", "curcuma", "perejil",
           "tomillo", "romero", "guindilla", "cayena", "agua", "vinagre", "vinagre-vino", "especias", "eritritol", "estevia",
           "canela", "vainilla", "nuez-moscada", "levadura-quimica", "bicarbonato", "hielo", "ajo-en-polvo", "cebollino",
           "albahaca", "eneldo", "jengibre"}
TRIVIAL_ALL = TRIVIAL | TRIVIAL_ES

STARCHES = {"potato": "potato", "rice": "rice", "brown-rice": "rice", "precooked-brown-rice": "rice",
            "pasta": "pasta", "wholewheat-pasta": "pasta", "quinoa": "quinoa", "burger-bun": "bread", "bread": "bread",
            "pizza-base": "bread", "wheat-tortilla": "bread", "dry-lentils": "pulses", "canned-lentils": "pulses",
            "dry-chickpeas": "pulses", "canned-chickpeas": "pulses", "canned-beans": "pulses"}

# --- Profile: forbidden ingredients, targets and lunch-only starches (see profile.example.json) ---
PROFILE = {
    "forbidden": {"everyone": []},
    "lunch_only": [],
    "targets": {"normal": {"dinner": [500, 550, 45], "lunch": [500, 550, 45]}},
}

def canon(i):
    return ALIAS.get(i, i)

def load_profile(path):
    global PROFILE
    if path is None:
        here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profile.json")
        path = here if os.path.exists(here) else None
    if path:
        PROFILE = json.load(open(path, encoding="utf-8"))

def forbidden(i, who):
    """Returns the reason if the ingredient is forbidden for whoever eats the dish.
    profile["forbidden"] = {"everyone": [...], "<diner>": [...]}. With for="everyone" every list is checked;
    with a diner's name, the shared list and theirs. Ids may be written as aliases."""
    lists = PROFILE.get("forbidden", {})
    pick = lists.items() if who == "everyone" else [(k, v) for k, v in lists.items() if k in ("everyone", who)]
    for owner, items in pick:
        if i in {canon(x) for x in items} | set(items):
            return "nobody eats it" if owner == "everyone" else f"{owner} does not eat it"
    return None

def target(week, meal):
    v = PROFILE.get("targets", {}).get(week, {}).get(meal)
    return tuple(v) if v else None

def die(msg):
    print("ERROR: " + msg)
    sys.exit(1)

def fail(msg):
    raise ValueError(msg)

def resolve(i, custom):
    if i in custom:
        c = custom[i]
        for k in ("kcal", "protein"):
            if k not in c:
                die(f"custom '{i}' has no '{k}'.")
        return dict(kcal=c["kcal"], protein=c["protein"], fat=c.get("fat", 0), carbs=c.get("carbs", 0), per=c.get("per", "g"),
                    pc=c.get("pc"), tbsp=c.get("tbsp"), dense=c.get("dense", False), note="Value from " + c.get("source", "custom"))
    return D.get(canon(i))

def amount(ing, d):
    i = ing["id"]
    if "g" in ing:
        if d["per"] == "ml":
            density = 0.92 if d["fat"] >= 90 else 1.0
            return ing["g"] / density, f'{ing["g"]} g'
        return ing["g"], f'{ing["g"]} g'
    if "ml" in ing:
        if d["per"] != "ml":
            fail(f"'{i}' is measured in g, not ml.")
        return ing["ml"], f'{ing["ml"]} ml'
    for u, ml in (("tbsp", 15), ("tsp", 5)):
        if u in ing:
            n = ing[u]
            if d["per"] == "ml":
                return n * ml, f"{n} {u} ({n*ml:g} ml)"
            if d.get("tbsp"):
                g = n * d["tbsp"] * (ml / 15)
                return g, f"{n} {u} (~{g:.0f} g)"
            fail(f"'{i}' has no spoon equivalent: give the amount in g.")
    if "pc" in ing:
        if not d.get("pc"):
            fail(f"'{i}' has no weight per piece: give the amount in g.")
        g = ing["pc"] * d["pc"]
        return g, f'{ing["pc"]} pc (~{g:g} g)'
    fail(f"'{i}' has no amount (g, ml, pc, tbsp or tsp).")

def list_ingredients(text=""):
    for i in sorted(set(D) | set(ALIAS)):
        if text in i:
            d = D[canon(i)]
            extra = f" (= {ALIAS[i]})" if i in ALIAS else ""
            print(f"{i}{extra}: {d['kcal']} kcal, {d['protein']} g protein / 100 {d['per']}" + (f" · 1 pc = {d['pc']} g" if d['pc'] else ""))
    print("Trivial (no amount, 0 kcal): " + ", ".join(sorted(TRIVIAL)))

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        return list_ingredients(sys.argv[2] if len(sys.argv) > 2 else "")
    args = sys.argv[1:]
    profile_path = None
    if "--profile" in args:
        k = args.index("--profile")
        profile_path = args[k + 1]
        del args[k:k + 2]
    if not args:
        die("give the recipe JSON file (or --list).")
    load_profile(profile_path)
    r = json.load(open(args[0], encoding="utf-8"))
    servings = r.get("servings")
    if not servings or servings <= 0:
        die("'servings' is missing.")
    custom = r.get("custom", {})
    who = r.get("for", "everyone")
    problems = []
    tot = dict(kcal=0, protein=0, fat=0, carbs=0)
    rows, dense, notes, unknown, oil_ml, n_oil = [], {}, [], [], 0.0, 0
    for ing in r["ingredients"]:
        i = ing["id"]
        if i in TRIVIAL_ALL:
            continue
        reason = forbidden(canon(i), who)
        if reason:
            problems.append(f"'{i}' is FORBIDDEN for this dish ({reason}; for={who})")
            continue
        d = resolve(i, custom)
        if d is None:
            sug = difflib.get_close_matches(i, list(D) + list(ALIAS), n=3, cutoff=0.5)
            unknown.append(i + (f" (maybe {', '.join(sug)}?)" if sug else ""))
            continue
        try:
            q, txt = amount(ing, d)
        except ValueError as e:
            problems.append(str(e))
            continue
        f = q / 100
        k, p = d["kcal"] * f, d["protein"] * f
        tot["kcal"] += k; tot["protein"] += p; tot["fat"] += d["fat"] * f; tot["carbs"] += d["carbs"] * f
        rows.append((i, txt + (f" · {ing['note']}" if ing.get("note") else ""), k / servings, p / servings))
        if d["dense"]:
            prev = dense.get(i, [0, 0, d["per"]])
            dense[i] = [prev[0] + q / servings, prev[1] + k / servings, d["per"]]
        if canon(i) == "olive-oil":
            oil_ml += q; n_oil += 1
        if d.get("note") and d["note"] not in notes:
            notes.append(f"{i}: {d['note']}")
    if unknown:
        problems.append("unknown ingredients (never counted as 0): " + "; ".join(unknown) +
                        ". Use an id from --list, an alias, or add it under 'custom' with the label's values")
    if problems:
        print("ERROR — nothing is calculated until this is fixed:")
        for x in problems:
            print("  - " + x)
        sys.exit(1)

    print(f"== {r.get('name', 'Recipe')} · {servings} {'serving' if servings == 1 else 'servings'} ==")
    print(f"{'Ingredient':28} {'Amount (total)':42} {'kcal/srv':>9} {'prot/srv':>9}")
    for i, txt, k, p in rows:
        print(f"{i:28} {txt[:42]:42} {k:9.0f} {p:9.1f}")
    kr, pr = tot["kcal"] / servings, tot["protein"] / servings
    print(f"\nPER SERVING: ~{5*round(kr/5)} kcal · ~{round(pr)} g protein · {tot['fat']/servings:.0f} g fat · {tot['carbs']/servings:.0f} g carbs")
    print(f"(exact: {kr:.0f} kcal, {pr:.1f} g)")
    meal = r.get("meal", "dinner")
    if n_oil:
        print(f"Oil: {n_oil} entr{'y' if n_oil == 1 else 'ies'}, {oil_ml:.0f} ml in total = {oil_ml/servings:.1f} ml per serving "
              f"(~{oil_ml*0.92*8.84/servings:.0f} kcal per serving). Check that EVERY spoonful is there (sofrito, browning, eggs, setting, dressing).")
    elif meal != "dessert":
        print("Oil: NO entries. If the recipe uses oil in any step (sofrito, browning, frying, dressing, greasing), add it.")
    if dense:
        print("Calorie-dense per serving (tell the user):")
        for i, (q, k, per) in dense.items():
            print(f"  - {i}: {q:.0f} {'ml' if per == 'ml' else 'g'} → ~{k:.0f} kcal")
    week = r.get("week", "normal")
    t = target(week, meal)
    if t:
        lo, hi, pmin = t
        msg = []
        if kr > hi * 1.03: msg.append(f"ABOVE {hi} kcal")
        if lo and kr < lo * 0.9: msg.append(f"below {lo} kcal")
        if pr < pmin - 1: msg.append(f"protein BELOW {pmin} g → boost it or say so")
        print(f"Target ({week}, {meal}: {('%d–' % lo) if lo else '≤'}{hi} kcal, ≥{pmin} g): " + ("; ".join(msg) if msg else "within"))
    starches = sorted({STARCHES[canon(x['id'])] for x in r["ingredients"] if canon(x['id']) in STARCHES})
    if len(starches) > 1:
        print(f"CHECK: more than one starch ({', '.join(starches)}). The rule is one per dish, unless it is a fixed recipe or the user asked for it.")
    lunch_only = set(PROFILE.get("lunch_only", []))
    if meal == "dinner" and lunch_only & set(starches):
        print(f"CHECK: {', '.join(sorted(lunch_only & set(starches)))} at DINNER, and the profile says they are lunch only.")
    prev = r.get("previous")
    if prev:
        dk, dp = kr - prev.get("kcal", kr), pr - prev.get("protein", pr)
        if abs(dk) > max(30, 0.07 * kr) or abs(dp) >= 3:
            print(f"CORRECTION: before it was ~{prev.get('kcal')} kcal / {prev.get('protein')} g; now it is ~{5*round(kr/5)} kcal / {round(pr)} g. "
                  "Tell the user explicitly, with the corrected number.")
        else:
            print(f"Matches what was said before (~{prev.get('kcal')} kcal / {prev.get('protein')} g).")
    if notes:
        print("Notes:")
        for x in notes:
            print("  - " + x)

if __name__ == "__main__":
    main()
