# 配色对照稿：同一组页面（首页、销售订单列表、订单详情）三版并排 —— 现状 / 建议微调 / 整套暮山灰×雾粉杏
import pathlib
src = pathlib.Path('/tmp/hz-ux1/gen.py').read_text()
exec(src.split('# ---------- A')[0])

PAL = {
    'p1': dict(brand='#b75d45', ink='#3b2a24', muted='#6f5141', soft='#4a342b', paper='#fffbf6', bg='#f6ebdf',
               hair='#ecd4c6', line='#f8ebe4', badge='#b75d45', badgefg='#fff', accent='#b75d45', tint='#f8ebe4'),
    'p2': dict(brand='#b75d45', ink='#3b2a24', muted='#6F625A', soft='#4f4540', paper='#fffdfb', bg='#F3EEE8',
               hair='#E6D3CC', line='#F2E8E4', badge='#b75d45', badgefg='#fff', accent='#b75d45', tint='#F4E9E5'),
    'p3': dict(brand='#6F625A', ink='#6F625A', muted='#8D8A87', soft='#6F625A', paper='#FBF9F6', bg='#F3EEE8',
               hair='#D9B8AD', line='#ECE3DF', badge='#D9B8AD', badgefg='#fff', accent='#D9B8AD', tint='#F3E7E2'),
}
for k, p in PAL.items():
    CSS += f'.{k} {{ ' + ' '.join(f'--{n}:{v};' for n, v in p.items()) + ' }\n'
CSS += """
body { width: 1330px; }
.trio { display: flex; gap: 22px; }
.trio .col { width: 375px; }
.trio .cap { font-size: 14px; }
.badge, .tabs .cnt, .seg sup { background: var(--badge); color: var(--badgefg); }
.tabs .on::after, .seg .on::after { background: var(--accent); }
.phone.wall.p2, .phone.wall.p3 { background: var(--bg); }
.wallimg { position:absolute !important; inset:0; background: url(backdrop.jpg) center/cover; }
.p2 .wallimg { filter: saturate(.35) brightness(1.02); opacity:.9; }
.p3 .wallimg { filter: saturate(.1) brightness(1.02); opacity:.85; }
.grid .c.wide .badge { top: 22px; }
.phone.wall > * { position: relative; }
.p3 .logo img { filter: grayscale(1) brightness(.9); }
.cr { position:absolute; right:10px; font:600 11px var(--sans); background:#fff; border:1px solid #0002; border-radius:4px; padding:1px 5px; z-index:5; }
.cr.bad { background:#fde2e1; color:#a3313d; border-color:#a3313d55; }
.cr.ok { color:#4c6a48; }
.sw { display:flex; gap:24px; margin-bottom:26px; }
.sw .box { background:#fff; border-radius:14px; padding:16px 18px; flex:1; }
.sw h3 { font:600 16px var(--serif); margin-bottom:10px; }
.chip { display:flex; align-items:center; gap:10px; font-size:13px; line-height:30px; color:#4a342b; }
.chip i { width:44px; height:22px; border-radius:5px; border:1px solid #0002; flex:none; }
.chip code { font-size:12px; color:#8a7a70; margin-left:auto; }
table.ct { border-collapse: collapse; width:100%; font-size:13.5px; background:#fff; border-radius:14px; overflow:hidden; margin-bottom:30px; }
.ct th, .ct td { padding:9px 14px; border-bottom:1px solid #eee; text-align:left; }
.ct th { background:#faf6f2; font-weight:600; }
.ct .bad { color:#a3313d; font-weight:600; } .ct .ok { color:#4c6a48; }
.steps { display:flex; justify-content:space-between; padding:6px 10px 2px; font-size:12px; color:var(--muted); }
.steps div { display:flex; flex-direction:column; align-items:center; gap:4px; flex:1; position:relative; }
.steps .dot { width:12px; height:12px; border-radius:6px; border:2px solid var(--hair); background:var(--paper); }
.steps .done .dot { background:var(--brand); border-color:var(--brand); } .steps .done { color:var(--ink); }
.ln { display:flex; padding:10px 0; border-top:1px solid var(--line); font-size:14px; align-items:center; }
.ln:first-of-type { border-top:0; }
.ln .t { flex:1; } .ln .t i { display:block; font-style:normal; font-size:12px; color:var(--muted); }
.ln .q { width:70px; text-align:right; color:var(--soft); } .ln .a { width:86px; text-align:right; font:400 15px var(--serif); }
.sumrow { display:flex; justify-content:space-between; background:var(--tint); border-radius:8px; padding:10px 12px; margin-top:8px; font-size:13px; color:var(--muted); }
.sumrow b { font:400 18px var(--serif); color:var(--ink); }
"""


def home(k):
    img = '<div class="wallimg"></div>' if k != 'p1' else ''
    return (f'<div class="phone wall {k}">' + img + status() + '<div class="body" style="padding-top:0">'
        + '<div class="logo"><img src="logo.png"></div>'
        + '<div class="idrow"><span><b>管理员</b> · 瑞瑞</span><span>2026-10-06 周二</span></div>'
        + grid([('big', 'receipt', '销售', 2), ('big', 'truck', '发货', 2), ('big', 'flower-2', '采购', 1), ('big', 'boxes', '仓库', 0), ('wide', 'wallet', '财务', 1)])
        + '</div>' + tabbar(['首页', '我的'], '首页') + '</div>')


def orders(k):
    return (f'<div class="phone {k}">' + status() + nav('销售订单') + '<div class="body">'
        + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号、客户、门店</div>'
        + '<div class="tabs"><span class="on">全部</span><span>待确认<span class="cnt">1</span></span><span>待发货<span class="cnt">2</span></span><span>已发货</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
        + card('拾光花店 · 文新店', '待发货', [('单号', 'SO-260929-016', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '2026-09-29', 0), ('订单金额', '<span class="money">¥1,560.00</span>', 0)])
        + card('晨曦花艺 · 滨江店', '待确认', [('单号', 'SO-260929-018', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '待定', 0), ('订单金额', '<span class="money">¥2,140.00</span>', 0)])
        + card('拾光花店 · 文新店', '已发货', [('单号', 'SO-260928-030', 0), ('下单日期', '2026-09-28', 0), ('出货日期', '2026-09-29', 0), ('发货金额', '<span class="money">¥936.00</span>', 0)], 'done')
        + '</div>' + bar(('新建订单', 1)) + '</div>')


def detail(k):
    lines = [('粉雪山玫瑰花束', '配方 3 种花材', '20 束', '¥640.00'), ('尤加利搭配束', '配方 2 种花材', '30 束', '¥540.00'), ('桔梗小束', '配方 2 种花材', '19 束', '¥380.00')]
    ln = ''.join(f'<div class="ln"><span class="t">{a}<i>{b}</i></span><span class="q">{c}</span><span class="a">{d}</span></div>' for a, b, c, d in lines)
    return (f'<div class="phone {k}">' + status() + nav('订单详情') + '<div class="body">'
        + '<div class="steps"><div class="done"><span class="dot"></span>已下单</div><div class="done"><span class="dot"></span>已确认</div><div><span class="dot"></span>已发货</div></div>'
        + card('拾光花店 · 文新店', '待发货', [('单号', 'SO-260929-016', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '2026-09-29', 1), ('下单人', '林店长', 0)])
        + '<div class="sec">产品明细<small>3 种</small></div>'
        + f'<div class="card" style="padding-top:4px">{ln}<div class="sumrow"><span>订单金额</span><b>¥1,560.00</b></div></div>'
        + '</div>' + bar(('取消订单', 0), ('发货', 1)) + '</div>')


def cr(v, top, ok=None):
    ok = float(v.split()[0]) >= 4.5 if ok is None else ok
    return f'<span class="cr {"ok" if ok else "bad"}" style="top:{top}px">{v}</span>'


CAPS = {'p1': '① 现在', 'p2': '② 建议微调（主色不动，换墙和线）', 'p3': '③ 整套暮山灰 × 雾粉杏'}
# 每版在关键位置贴对比度标签：字对底 ≥4.5 才算看得清（大字 ≥3）
MARK = {
    'home': {'p1': [('11.6', 120)], 'p2': [('11.8', 120)], 'p3': [('5.1', 120)]},
    'orders': {'p1': [('6.1 次要字', 180), ('4.5 按钮', 735)], 'p2': [('5.1 次要字', 180), ('4.5 按钮', 735)],
               'p3': [('3.0 次要字', 180), ('1.8 角标', 140), ('5.9 按钮', 735)]},
    'detail': {'p1': [('3.8 进度点', 100, True)], 'p2': [('3.9 进度点', 100, True)], 'p3': [('5.1 正文', 200), ('3.0 字段名', 240)]},
}


def trio(name, fn, title, notes):
    cols = ''
    for k in ('p1', 'p2', 'p3'):
        tags = ''.join(cr(*m) for m in MARK[name][k])
        cols += f'<div class="col"><div class="cap"><b>{CAPS[k]}</b></div><div style="position:relative">{tags}{fn(k)}</div></div>'
    lis = ''.join(f'<li>{n}</li>' for n in notes)
    return f'<div class="pair"><h2>{title}</h2><div class="trio">{cols}</div><ul class="notes" style="padding-top:16px">{lis}</ul></div>'


def chips(k, rows):
    return ''.join(f'<div class="chip"><i style="background:{c}"></i>{t}<code>{c}</code></div>' for t, c in rows)


SW = ('<div class="sw">'
    + '<div class="box"><h3>① 现在</h3>' + chips('p1', [('主按钮 · 陶土红', '#b75d45'), ('正文 · 深棕', '#3b2a24'), ('次要字', '#6f5141'), ('墙 · 浅杏', '#f6ebdf'), ('描边', '#ecd4c6')]) + '</div>'
    + '<div class="box"><h3>② 建议微调</h3>' + chips('p2', [('主按钮 · 陶土红（不动）', '#b75d45'), ('正文 · 深棕（不动）', '#3b2a24'), ('次要字 · 灰茶棕', '#6F625A'), ('墙 · 米雾白', '#F3EEE8'), ('描边 · 雾粉杏调浅', '#E6D3CC')]) + '</div>'
    + '<div class="box"><h3>③ 整套四色</h3>' + chips('p3', [('主按钮、正文 · 灰茶棕', '#6F625A'), ('次要字 · 暮山灰', '#8D8A87'), ('墙 · 米雾白', '#F3EEE8'), ('描边、角标 · 雾粉杏', '#D9B8AD'), ('（没有深色，标题只能用灰茶棕）', '#6F625A')]) + '</div>'
    + '</div>')

CT = """<table class="ct"><tr><th>看得清吗（字和底色的对比，≥4.5 才算清楚，大字 ≥3）</th><th>① 现在</th><th>② 建议微调</th><th>③ 整套四色</th></tr>
<tr><td>正文、标题、金额</td><td class="ok">11.6</td><td class="ok">11.8</td><td class="ok">5.1（够，但标题和正文同一个颜色，分不出主次）</td></tr>
<tr><td>次要字（字段名、单号、日期）</td><td class="ok">6.1</td><td class="ok">5.1</td><td class="bad">3.0 不够</td></tr>
<tr><td>主按钮上的白字</td><td class="ok">4.5</td><td class="ok">4.5</td><td class="ok">5.9（主按钮改成灰茶棕）</td></tr>
<tr><td>角标白字（待办数字）</td><td class="ok">4.5</td><td class="ok">4.5</td><td class="bad">1.8 看不清（雾粉杏底）</td></tr>
<tr><td>描边和墙的区分</td><td>1.2（淡）</td><td>1.3（淡）</td><td>1.6（最明显）</td></tr>
</table>"""

A = trio('home', home, '首页（管理员）', [
    '② 墙面照片上盖一层米雾白，整体从「暖杏」变成「米白偏灰」，陶土红入口图标更跳。',
    '③ 墙面、图标、角标全部变灰粉；品牌红没了，logo 只能跟着去色，<b>和「往品牌红做」的方向不一致</b>。',
    ASK('要你看：② 墙色从浅杏换成米雾白，算不算动了「原墙色」？不想动墙可以只换描边和次要字。'),
])
B = trio('orders', orders, '销售订单列表', [
    '② 卡片描边带一点粉，次要字（单号、日期）从红棕变成灰棕，卡片里的字更安静，金额和状态更突出。',
    '③ 次要字 3.0 不够清楚，要加深到 #75716D 也只到 4.2；待办角标用雾粉杏底白字只有 1.8，得改成灰茶棕底。',
])
C = trio('detail', detail, '订单详情', [
    '状态颜色（待发货琥珀、已发货绿、异常红）三版都不变，只换中性色。',
    '③ 进度点、金额、标题、按钮都是同一个灰茶棕，主次只能靠字号分。',
])

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>配色对照稿 · 现在 / 建议微调 / 整套暮山灰 × 雾粉杏</h1>
<div class="lead">三版用同一份页面、同一份种子数据画，只换颜色，方便比较。图上白色小标签是对比度，红色的是看不清。<br>
你发的四色：暮山灰 #8D8A87、雾粉杏 #D9B8AD、米雾白 #F3EEE8、灰茶棕 #6F625A。只画稿，你选定后再改规格书 02 章的颜色变量和代码。</div>
{SW}{CT}{A}{B}{C}
</body></html>"""
pathlib.Path('/tmp/hz-color/index.html').write_text(html)
print('ok', len(html))
