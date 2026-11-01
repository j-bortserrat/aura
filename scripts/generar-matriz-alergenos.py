#!/usr/bin/env python3
"""Genera matriz-alergenos-es.html y matriz-alergenos-en.html (en la carpeta de salida) desde la Sheet de la carta.
Luego se convierten a PDF con Chromium (ver instrucciones al final del chat / README): images/alergenos-es.pdf e images/alergenos-en.pdf.
Uso: python3 scripts/generar-matriz-alergenos.py <carpeta_salida>"""
import csv, re, html, sys, os, urllib.request, datetime

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://docs.google.com/spreadsheets/d/1PHh0xQYdxf3YcuI2_vE2Y6lAO_Az22scKLOVm3EwilY/export?format=csv&gid=148567757'
import subprocess
rows = list(csv.reader(subprocess.run(['curl', '-sL', URL], capture_output=True, text=True, check=True).stdout.splitlines(True)))
H = rows[0]
data = [dict(zip(H, r)) for r in rows[1:] if r[14].strip().lower() != 'no']
AL = [('1','Huevo','Egg'),('2','Sulfitos','Sulphites'),('3','Soja','Soy'),('4','Pescado','Fish'),('5','Sésamo','Sesame'),('6','Mostaza','Mustard'),('7','Moluscos','Molluscs'),('8','Lácteos','Dairy'),('9','Gluten','Gluten'),('10','Frutos secos','Tree nuts'),('11','Crustáceos','Crustaceans'),('12','Cacahuetes','Peanuts'),('13','Apio','Celery'),('14','Altramuz','Lupin')]
MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
hoy = datetime.date.today()

def alerg(s):
    s = s.strip()
    m = re.match(r'^(\d{1,2}),(\d{1,2}),20(\d{2})$', s)   # Sheets a veces convierte "1,8,9" en fecha
    if m: s = f'{m.group(1)},{m.group(2)},{int(m.group(3))}'
    return {x.strip() for x in s.split(',') if x.strip()}

T = {
 'es': dict(titulo='Matriz de alérgenos', sub='Allergen matrix', plato='Plato', pie='contiene', gluten='Productos libres de gluten no son aptos para celíacos',
            nota='Menús y bebidas sin marcas: sin alérgenos declarados o según el plato elegido', act=f'Carta actualizada · {MESES[hoy.month-1]} {hoy.year}', name='nombre', cat='categoria', sc='subcategoria', al=1),
 'en': dict(titulo='Allergen matrix', sub='Matriz de alérgenos', plato='Dish', pie='contains', gluten='Gluten-free products are not suitable for celiacs',
            nota='Menus and drinks without marks: no declared allergens or depends on the chosen dish', act=f'Menu updated · {MONTHS[hoy.month-1]} {hoy.year}', name='nombre_en', cat='categoria_en', sc='subcategoria_en', al=2),
}

for lang, t in T.items():
    cats, seen = [], {}
    for d in sorted(data, key=lambda d: int(d['orden_categoria'])):
        c = d[t['cat']] or d['categoria']
        if c not in seen: seen[c] = []; cats.append(c)
        seen[c].append(d)
    body = ''
    for c in cats:
        ci = seen[c]; subs = []
        for d in ci:
            k = d[t['sc']] or d['subcategoria']
            if k not in subs: subs.append(k)
        body += f'<tr class="cat"><td colspan="15">{html.escape(c)}</td></tr>'
        for sname in subs:
            items = sorted([d for d in ci if (d[t['sc']] or d['subcategoria']) == sname], key=lambda d: int(d['orden'] or 0))
            if sname: body += f'<tr class="sub"><td colspan="15">{html.escape(sname)}</td></tr>'
            for d in items:
                a = alerg(d['alergenos'])
                cells = ''.join(f'<td class="m">{"<span class=dot></span>" if n in a else ""}</td>' for n, _, _ in AL)
                body += f'<tr><td class="n">{html.escape(d[t["name"]] or d["nombre"])}</td>{cells}</tr>'
    head = ''.join(f'<th class="a"><div><b>{a[0]}</b> {a[t["al"]]}</div></th>' for a in AL)
    doc = f'''<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page {{ size: A4 landscape; margin: 11mm 10mm 12mm; }}
body {{ font-family: 'Archivo', sans-serif; color:#3e1d17; margin:0; font-size:8.4pt; }}
.top {{ display:flex; justify-content:space-between; align-items:center; background:#3e1d17; color:#f5ede6; padding:7px 12px; margin-bottom:6px; border-radius:6px; }}
.brand {{ display:flex; align-items:center; gap:16px; }} .brand img {{ height:34px; }} .brand .en {{ font:italic 400 9pt 'Fraunces',serif; color:#d5a0c5; }}
h1 {{ font:500 17pt 'Fraunces',serif; margin:0; line-height:1.1; }} .top small {{ color:#e4cec3; font-size:7.3pt; text-align:right; line-height:1.45; }}
table {{ width:100%; border-collapse:collapse; table-layout:fixed; }} col.nc {{ width:66mm; }} thead {{ display:table-header-group; }}
th.a {{ height:30mm; vertical-align:bottom; padding:0; background:#3e1d17; color:#f5ede6; }}
th.a div {{ writing-mode:vertical-rl; transform:rotate(180deg); text-align:left; white-space:nowrap; padding:2px 0; margin:0 auto; font-size:8pt; line-height:1.25; }}
th.nm {{ background:#3e1d17; color:#f5ede6; text-align:left; padding:4px 6px; font:500 9pt 'Fraunces',serif; vertical-align:bottom; }}
td {{ border-bottom:.4pt solid #d9c6c0; padding:2.1px 3px; }} td.n {{ padding-left:6px; font-weight:500; }} td.m {{ text-align:center; border-left:.4pt solid #eadcd7; }}
tr:nth-child(even) td {{ background:#faf4f1; }}
tr.cat td {{ background:#d5a0c5 !important; color:#3e1d17; font:500 10.5pt 'Fraunces',serif; padding:3px 6px; border:0; }}
tr.sub td {{ background:#efe0e8 !important; font-style:italic; padding:1.5px 6px; font-size:7.8pt; color:#6b3f5c; }}
tr {{ break-inside: avoid; }} .dot {{ display:inline-block; width:8px; height:8px; border-radius:50%; background:#e3754b; }}
.foot {{ margin-top:6px; font-size:7.3pt; color:#7a5a52; }}
</style>
<div class="top"><div class="brand"><img src="logo.png" alt="AURA"><div><h1>{t['titulo']}</h1><span class="en">{t['sub']}</span></div></div>
<small>Brunch &amp; Specialty Coffee<br>Carrer de la Reina Na Germana, 9 · Ruzafa, Valencia<br>{t['act']}</small></div>
<table><colgroup><col class="nc">{''.join('<col>' for _ in AL)}</colgroup>
<thead><tr><th class="nm">{t['plato']}</th>{head}</tr></thead><tbody>{body}</tbody></table>
<div class="foot"><span class="dot"></span> {t['pie']} · {t['gluten']} · {t['nota']}</div>'''
    open(os.path.join(OUT, f'matriz-alergenos-{lang}.html'), 'w', encoding='utf-8').write(doc)
    print(lang, len(data), 'platos')
