# 第 1 批（结构和待办）对照稿：左边现状截图（右半），右边改后草稿
import pathlib, re

ICON_DIR = pathlib.Path.home() / 'Developer/huazhong/node_modules/.pnpm/lucide-static@1.48.0/node_modules/lucide-static/icons'


def icon(name, size=24, color='var(--brand)', sw=1.6):
    svg = (ICON_DIR / f'{name}.svg').read_text()
    body = re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{body}</svg>')


CHEV = lambda: icon('chevron-right', 16, 'var(--muted)', 1.8)

CSS = """
@font-face { font-family: HZ; src: url(serif.ttf); }
:root { --brand:#b75d45; --ink:#3b2a24; --muted:#6f5141; --soft:#4a342b; --paper:#fffbf6; --bg:#f6ebdf;
  --hair:#ecd4c6; --line:#f8ebe4; --frame:#3b2a244d; --rule:#3b2a2433; --rsoft:#3b2a241f;
  --amber:#8a5a1e; --amber-bg:#f6e7d2; --alert:#9b4a2f; --alert-bg:#f7e2d8; --green:#4c6a48; --green-bg:#e7ecdf;
  --serif: HZ, 'Songti SC', serif; --sans: -apple-system, 'PingFang SC', sans-serif; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--sans); background: #e9e4de; color: var(--ink); padding: 32px 40px; width: 1300px; }
h1 { font: 600 26px var(--serif); margin-bottom: 6px; }
.lead { color: #6f5141; font-size: 14px; line-height: 1.8; margin-bottom: 28px; }
.pair { background: #fff; border-radius: 14px; padding: 22px 26px 24px; margin-bottom: 30px; }
.pair h2 { font: 600 19px var(--serif); margin-bottom: 14px; }
.pair h2 small { font: 400 13px var(--sans); color: var(--muted); margin-left: 8px; }
.row { display: flex; gap: 28px; align-items: flex-start; }
.col { width: 375px; }
.cap { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
.cap b { color: var(--ink); }
.notes { flex: 1; min-width: 360px; font-size: 13.5px; line-height: 1.75; color: var(--soft); padding-top: 26px; }
.notes li { margin: 0 0 8px 18px; }
.notes .ask { background: #fff4d6; border-radius: 4px; padding: 0 4px; }
.now { width: 375px; height: 811px; border-radius: 30px; background-size: 763px auto; background-position: right top;
  box-shadow: 0 0 0 1px #0001; }
.phone { width: 375px; height: 811px; border-radius: 30px; overflow: hidden; position: relative; background: var(--bg);
  box-shadow: 0 0 0 1px #0001; display: flex; flex-direction: column; }
.phone.wall { background: var(--bg) url(backdrop.jpg) center/cover; }
.status { height: 47px; flex: none; display: flex; align-items: flex-end; padding: 0 26px 6px; font: 600 14px var(--sans); }
.nav { height: 44px; flex: none; display: flex; align-items: center; justify-content: center; position: relative; font: 400 19px var(--serif); }
.nav .back { position: absolute; left: 10px; top: 10px; }
.capsule { position: absolute; right: 8px; top: 6px; width: 87px; height: 32px; border-radius: 16px; background: #ffffffcc; border: 1px solid #0000001a; }
.body > * { flex: none; }
.body { flex: 1; overflow: hidden; padding: 6px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.sec { font: 400 15px var(--serif); margin: 6px 0 -2px; display: flex; justify-content: space-between; align-items: baseline; }
.sec small { font: 400 12px var(--sans); color: var(--muted); }
.todos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.todo { background: var(--paper); border: 1px solid var(--hair); border-radius: 10px; padding: 12px 12px 12px 14px; position: relative; height: 80px; }
.todo .n { font: 400 28px var(--serif); color: var(--brand); line-height: 34px; }
.todo .l { font-size: 12px; color: var(--ink); }
.todo .a { position: absolute; right: 8px; top: 12px; }
.todo.zero .n, .todo.zero .l { color: var(--muted); opacity: .6; }
.wait { border: 1px solid var(--rsoft); border-radius: 10px; background: #fffbf659; }
.wait .r { display: flex; align-items: center; padding: 0 12px 0 14px; height: 40px; font-size: 13px; color: var(--muted); }
.wait .r + .r { border-top: 1px solid var(--rsoft); }
.wait .r .n { font: 400 17px var(--serif); color: var(--muted); width: 28px; }
.wait .r .t { flex: 1; } .wait .r .t i { font-style: normal; font-size: 12px; opacity: .8; margin-left: 6px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--frame); border-radius: 10px; overflow: hidden; background: #fffbf640; }
.grid .c { padding: 14px 16px; position: relative; border-right: 1px solid var(--rsoft); border-bottom: 1px solid var(--rsoft); }
.grid .c:nth-child(2n) { border-right: 0; }
.grid .c.wide { grid-column: 1 / -1; border-right: 0; display: flex; align-items: center; gap: 14px; height: 64px; }
.grid .c.big { height: 116px; display: flex; flex-direction: column; justify-content: space-between; }
.grid .c.big .t { font: 400 18px var(--serif); display: flex; justify-content: space-between; align-items: center; }
.grid .c.sm { height: 56px; display: flex; align-items: center; gap: 10px; font: 600 15px var(--sans); }
.grid .c.sm span { flex: 1; }
.grid .c.wide span { flex: 1; font: 400 18px var(--serif); }
.grid .last { border-bottom: 0 !important; }
.badge { position: absolute; right: 14px; top: 14px; min-width: 20px; height: 20px; border-radius: 10px; background: var(--brand);
  color: #fff; font-size: 12px; text-align: center; line-height: 20px; padding: 0 6px; }
.card { background: var(--paper); border: 1px solid var(--hair); border-radius: 10px; padding: 12px 16px; }
.card .h { display: flex; justify-content: space-between; align-items: center; padding-bottom: 9px; border-bottom: 1px solid var(--line); }
.card .h b { font-size: 16px; }
.tag { font-size: 12px; padding: 2px 7px; border-radius: 4px; background: var(--amber-bg); color: var(--amber); }
.tag.done { background: var(--green-bg); color: var(--green); }
.tag.grey { background: #eeeae5; color: #6f665f; }
.f { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; margin-top: 8px; font-size: 13px; line-height: 24px; }
.f div { display: flex; gap: 8px; white-space: nowrap; } .f .w { grid-column: 1 / -1; }
.f .k { width: 52px; flex: none; color: var(--muted); font-size: 12px; }
.f .v { color: var(--soft); } .money { font: 400 17px var(--serif); color: var(--ink); }
.tabbar { height: 96px; flex: none; background: var(--paper); border-top: 1px solid var(--line); display: flex; padding-top: 10px; }
.tabbar div { flex: 1; text-align: center; font-size: 12px; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 4px; }
.tabbar .on { color: var(--ink); font-weight: 600; }
.bar { height: 96px; flex: none; background: var(--paper); border-top: 1px solid var(--line); display: flex; gap: 12px; padding: 12px 16px; }
.btn { flex: 1; height: 44px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 1px solid var(--rule); color: var(--ink); }
.btn.p { background: var(--brand); color: #fff; border: 0; font-weight: 600; }
.todolist { background: var(--paper); border: 1px solid var(--hair); border-radius: 10px; }
.todolist .r { display: flex; align-items: center; gap: 12px; padding: 11px 14px 11px 16px; }
.todolist .r + .r { border-top: 1px solid var(--line); }
.todolist .n { font: 400 24px var(--serif); color: var(--brand); width: 30px; text-align: center; }
.todolist .t { flex: 1; font-size: 15px; } .todolist .t i { display: block; font-style: normal; font-size: 12px; color: var(--muted); margin-top: 2px; }
.todolist .t i.late { color: var(--alert); }
.todolist .m { font-size: 12px; color: var(--muted); }
.search { height: 40px; border-radius: 8px; background: var(--paper); border: 1px solid var(--hair); display: flex; align-items: center; gap: 8px; padding: 0 12px; color: var(--muted); font-size: 14px; flex: none; }
.tabs { display: flex; gap: 18px; white-space: nowrap; font-size: 15px; color: var(--muted); align-items: center; flex: none; padding: 2px 0 6px; }
.tabs .on { color: var(--ink); font-weight: 600; position: relative; }
.tabs .on::after { content: ''; position: absolute; left: 50%; margin-left: -10px; bottom: -8px; width: 20px; height: 2px; background: var(--brand); }
.tabs .cnt { display: inline-block; min-width: 18px; height: 18px; border-radius: 9px; background: var(--brand); color: #fff; font-size: 11px; text-align: center; line-height: 18px; margin-left: 4px; font-weight: 400; }
.tabs .sp { flex: 1; } .tabs .fl { font-size: 14px; display: flex; gap: 4px; align-items: center; }
.seg { display: flex; gap: 26px; font: 400 21px var(--serif); color: var(--muted); padding: 4px 0 6px; flex: none; }
.seg .on { color: var(--ink); position: relative; }
.seg .on::after { content: ''; position: absolute; left: 50%; margin-left: -12px; bottom: -6px; width: 24px; height: 2px; background: var(--brand); }
.seg sup { font: 400 11px var(--sans); background: var(--brand); color: #fff; border-radius: 9px; padding: 1px 6px; margin-left: 3px; vertical-align: 8px; }
.hero { padding: 26px 8px 4px; } .hero .name { font: 400 26px var(--serif); }
.info { font-size: 13px; color: var(--muted); line-height: 24px; margin-top: 6px; } .info b { font-weight: 400; color: var(--soft); margin-left: 6px; }
.quiet { text-align: center; color: var(--muted); font-size: 15px; padding: 10px; }
.empty { text-align: center; color: var(--muted); font-size: 13px; padding: 18px 0; }
.mark { outline: 2px dashed #c98b2b; outline-offset: 3px; border-radius: 10px; }
.logo { padding: 18px 8px 0; } .logo img { height: 52px; }
.idrow { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); padding: 10px 8px 6px; } .idrow b { color: var(--ink); }
"""


def status():
    return '<div class="status">20:00</div>'


def nav(title, back=True):
    b = f'<span class="back">{icon("chevron-left", 22, "var(--ink)", 1.8)}</span>' if back else ''
    return f'<div class="nav">{b}{title}<span class="capsule"></span></div>'


def todo(n, label, zero=False, amount=''):
    a = f'<div class="l" style="margin-top:2px;color:var(--muted)">{amount}</div>' if amount else ''
    return (f'<div class="todo{" zero" if zero else ""}"><div class="n">{n}</div><div class="l">{label}</div>{a}'
            f'<span class="a">{CHEV()}</span></div>')


def wait(rows):
    inner = ''.join(f'<div class="r"><span class="n">{n}</span><span class="t">{t}<i>{why}</i></span>{CHEV()}</div>' for n, t, why in rows)
    return f'<div class="sec">在等对方<small>灰色，不计入首页数字</small></div><div class="wait">{inner}</div>'


def grid(cells):
    out = []
    for i, (kind, ic, text, *rest) in enumerate(cells):
        badge = f'<span class="badge">{rest[0]}</span>' if rest and rest[0] else ''
        if kind == 'big':
            out.append(f'<div class="c big">{icon(ic, 26)}<div class="t">{text}{CHEV()}</div>{badge}</div>')
        elif kind == 'wide':
            out.append(f'<div class="c wide">{icon(ic, 26)}<span>{text}</span>{CHEV()}{badge}</div>')
        else:
            out.append(f'<div class="c sm">{icon(ic, 22)}<span>{text}</span>{CHEV()}</div>')
    html = ''.join(out)
    return f'<div class="grid">{html}</div>'


def card(title, tag, fields, tagcls=''):
    fs = ''.join(f'<div class="{"w" if w else ""}"><span class="k">{k}</span><span class="v">{v}</span></div>' for k, v, w in fields)
    t = f'<span class="tag {tagcls}">{tag}</span>' if tag else ''
    return f'<div class="card"><div class="h"><b>{title}</b>{t}</div><div class="f">{fs}</div></div>'


def tabbar(items, on):
    icons = {'首页': 'house', '我的': 'user-round', '库存': 'boxes', '订货': 'flower-2', '订单': 'file-text'}
    return '<div class="tabbar">' + ''.join(
        f'<div class="{"on" if t == on else ""}">{icon(icons[t], 24, "var(--brand)" if t == on else "var(--muted)")}{t}</div>' for t in items) + '</div>'


def bar(*btns):
    return '<div class="bar">' + ''.join(f'<div class="btn {"p" if p else ""}">{t}</div>' for t, p in btns) + '</div>'


def phone(inner, wall=False):
    return f'<div class="phone{" wall" if wall else ""}">{inner}</div>'


def pair(title, sub, now_file, now_cap, draft, notes):
    now = (f'<div class="now" style="background-image:url(now/{now_file})"></div>' if now_file
           else '<div class="now" style="display:flex;align-items:center;justify-content:center;background:#f6ebdf;color:#6f5141">现在没有这一页</div>')
    lis = ''.join(f'<li>{n}</li>' for n in notes)
    return (f'<div class="pair"><h2>{title}<small>{sub}</small></h2><div class="row">'
            f'<div class="col"><div class="cap"><b>现在</b> · {now_cap}</div>{now}</div>'
            f'<div class="col"><div class="cap"><b>改后</b></div>{draft}</div>'
            f'<ul class="notes">{lis}</ul></div></div>')


ASK = lambda s: f'<span class="ask">{s}</span>'

# ---------- A 首页（管理员） ----------
home = phone(status() + '<div class="body" style="padding-top:0">'
    + '<div class="logo"><img src="logo.png"></div>'
    + '<div class="idrow"><span><b>管理员</b> · 瑞瑞</span><span>2026-10-05 周一</span></div>'
    + grid([('big', 'receipt', '销售', 2), ('big', 'truck', '发货', 2), ('big', 'flower-2', '采购', 0), ('big', 'boxes', '仓库', 2), ('wide', 'wallet', '财务', 1)])
    + '<div class="sec mark" style="margin-top:8px">待我处理<small>只列该你动手的事</small></div>'
    + '<div class="todolist mark">'
    + '<div class="r"><span class="n">2</span><span class="t">今日应发<i class="late">出货日期 2026-09-29，已过</i></span><span class="m">发货</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="n">1</span><span class="t">待确认订单</span><span class="m">销售</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="n">1</span><span class="t">待处理售后</span><span class="m">销售</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="n">2</span><span class="t">待收货</span><span class="m">仓库</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="n">1</span><span class="t">可开对账单<i>云岭花卉</i></span><span class="m">财务</span>' + CHEV() + '</div>'
    + '</div></div>' + tabbar(['首页', '我的'], '首页'), wall=True)
A = pair('首页（管理员）', '你定的：入口格不动，下面加「待我处理」，按事项分行', 'u1-m3-home.png', 'u1-m3', home, [
    '入口格、墙面背景、底栏都不变。虚线框是新加的。',
    '格子右上角的红色数字<b>只算该你动手的事</b>。采购现在只有「待填报邀请」「待收货采购单」，这两件都在等别人，所以采购格子没有数字（原来显示 3）。',
    '「待我处理」一行是一类事，点一行直接进对应列表（已经筛好）。最多 6 行，数字为 0 的行不显示。',
    '排序：出货日期、付款截止已经过了或就是今天的排最前，其余按模块顺序（销售 → 发货 → 采购 → 仓库 → 财务）。',
    '「可开对账单」是新增的事项。现在真实数据里只有云岭花卉一家：采购单 PO-260928-004 已收货、还没进对账单。',
    ASK('要你看：小字说明（「已过」「云岭花卉」）要不要保留？'),
])

# ---------- B 销售模块首页 ----------
sales = phone(status() + nav('销售') + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(1, '待确认订单') + todo(0, '取消申请', True) + todo(1, '待处理售后') + '</div>'
    + '<div class="sec">常用</div>' + grid([('big', 'file-text', '销售订单'), ('big', 'rotate-ccw', '客户售后')])
    + '<div class="sec">资料</div>' + grid([('sm', 'store', '客户'), ('sm', 'flower-2', '产品')])
    + '<div class="sec mark">待处理单据<small>2 张</small></div>'
    + card('晨曦花艺 · 滨江店', '待确认', [('单号', 'SO-260929-018', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '待定', 0), ('订单金额', '<span class="money">¥2,140.00</span>', 0)])
    + card('晨曦花艺 · 城西店', '待处理', [('单号', 'AS-260929-003', 0), ('提交日期', '2026-09-29', 0), ('原订单', 'SO-260927-026', 1)])
    + '</div>', wall=True)
B = pair('销售模块首页', '你定的：模块首页保留，下半屏放本模块待处理的单子', 'u1-x1-sales-home.png', 'u1-x1', sales, [
    '上面的待办和入口格不变，下面空白处加「待处理单据」，点卡片直接进详情。往下滑能看到全部。',
    '清单里只放红色待办对应的单子：待确认订单、取消申请、待处理售后，按急的程度排。',
    '卡片沿用现在的列表卡片。第 4 批「卡片主次」定好后一起换。',
    '入口格大小不变。清单在资料格下面，第一张卡在首屏就能看到，往下滑看其余的。',
])

# ---------- C 发货模块首页 ----------
ship = phone(status() + nav('发货') + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(2, '今日应发') + '</div>'
    + '<div class="sec">常用</div>' + grid([('wide', 'truck', '发货单')])
    + '<div class="sec mark">待处理单据<small>2 张 · 出货日期已过</small></div>'
    + card('拾光花店 · 文新店', '待发货', [('单号', 'SO-260929-016', 0), ('出货日期', '2026-09-29', 0), ('数量', '20 束', 0), ('配货', '未配 0/1 种', 0)])
    + card('一间花房 · 湖滨店', '待发货', [('单号', 'SO-260928-012', 0), ('出货日期', '2026-09-29', 0), ('数量', '15 束', 0), ('配货', '未配 0/1 种', 0)])
    + '</div>' + bar(('全选', 0), ('确认发货（0）', 1)), wall=True)
C = pair('发货模块首页', '原来整页只有 1 个待办 + 1 个入口', 'u1-h1-ship-home.png', 'u1-h1', ship, [
    '下半屏直接列出今天该发的单子（出货日期不晚于今天的待发货），发货员进来就能干活。',
    '待处理单据能直接勾选，用底栏「全选 / 确认发货」批量发，和发货单列表同一种用法。整页要发 / 不要发都在这里，不必再进列表。',
    '卡片字段名「产品 20 束」改成「数量 20 束」（叫法统一，第 4 批再加产品摘要）。',
    ASK('要你定：模块首页里放底栏批量发货可以吗？不要的话，这页只列单子、点进去再发。'),
])

# ---------- D 采购（只做采购的员工） ----------
buy = phone(status() + nav('采购', back=False) + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(0, '缺货花材', True) + '</div>'
    + wait([(1, '待填报邀请', '等供应商填报'), (2, '待收货采购单', '等仓库收货')])
    + '<div class="sec">常用</div>' + grid([('big', 'clipboard-list', '采购需求'), ('big', 'file-text', '采购单')])
    + '<div class="sec">资料</div>' + grid([('sm', 'users', '供应商')]).replace('class="c sm"', 'class="c sm" style="grid-column:1/-1;border:0"')
    + '<div class="sec mark">待处理单据</div><div class="empty mark">未来 7 天没有缺货的花材</div>'
    + '</div>' + tabbar(['首页', '我的'], '首页'), wall=True)
D = pair('采购首页（只做采购的员工）', '待办分「该我动手」和「在等对方」；单岗位员工统一有底栏', 'u4-c1-landing-purchase.png', 'u4-c1', buy, [
    '红色待办只有<b>缺货花材</b>（新加，点了进采购需求）。现在真实数据是 0，所以整张卡变淡。',
    '「待填报邀请」「待收货采购单」挪到下面「在等对方」，灰色数字，不算进首页和底栏的红数字。',
    '只做一个岗位的员工统一用底栏「首页 / 我的」，「我的」不再塞进资料格。仓库员工另加「库存」，和现在一样。',
    '入口少的模块首页都这样处理：上面待办 → 在等对方 → 常用 → 资料 → 待处理单据。',
    ASK('要你看：「在等对方」这种灰色的样子行不行？'),
])

# ---------- E 仓库首页 ----------
wh = phone(status() + nav('仓库') + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(2, '待收货') + '</div>'
    + '<div class="wait"><div class="r"><span class="n">1</span><span class="t">放久了<i>提醒先用，不算待办</i></span>' + CHEV() + '</div></div>'
    + '<div class="sec">常用</div>' + grid([('big', 'package-check', '收货'), ('big', 'arrow-up-from-line', '出库'), ('big', 'trash-2', '报损'), ('big', 'clipboard-list', '盘点')]).replace('class="c big">' + icon('trash-2', 26), 'class="c big last">' + icon('trash-2', 26)).replace('class="c big">' + icon('clipboard-list', 26), 'class="c big last">' + icon('clipboard-list', 26))
    + grid([('sm', 'arrow-down-to-line', '手工入库'), ('sm', 'files', '单据'), ('sm', 'boxes', '库存')]).replace('<div class="c sm">' + icon('boxes', 22), '<div class="c sm" style="grid-column:1/-1;border-bottom:0">' + icon('boxes', 22))
    + '<div class="sec mark">待处理单据<small>2 张</small></div>'
    + card('春禾花材', '待收货', [('单号', 'PO-260929-006', 0), ('下单日期', '2026-09-29', 0), ('花材', '粉雪山玫瑰 200 枝', 1)])
    + '</div>', wall=True)
E = pair('仓库首页', '把「收货」放进常用，加「单据」入口', 'u1-w1-wh-home.png', 'u1-w1', wh, [
    '常用第一格放<b>收货</b>（进待收货列表），解决规格 03、06 章说法不一致的问题。',
    '新加<b>单据</b>入口：出库、报损、手工入库的单子合在一个列表里（下一张图）。作废录错的单子从 9~10 步减到 3 步。',
    '「放久了」是提醒，不算待办，放进灰色行。',
    '待处理单据列待收货的采购单。仓库这边的卡片不显示金额和采购员，改成显示花材和数量（第 4 批定的规则，这里先画出来）。',
    ASK('要你定：常用 4 个大格（收货、出库、报损、盘点）+ 3 个小格（手工入库、单据、库存），这样分可以吗？'),
])

# ---------- F 仓库「单据」 ----------
docs = phone(status() + nav('单据') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号、花材</div>'
    + '<div class="tabs"><span class="on">全部</span><span>出库</span><span>报损</span><span>手工入库</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + card('出库 · 门店用花', '', [('单号', 'CK-261005-001', 0), ('日期', '2026-10-05', 0), ('花材', '白玫瑰 20 枝、尤加利 10 枝', 1), ('经办人', '陈青', 0)])
    + card('报损', '', [('单号', 'BS-261004-001', 0), ('日期', '2026-10-04', 0), ('花材', '洋桔梗 5 枝', 1), ('经办人', '陈青', 0)])
    + card('手工入库', '已作废', [('单号', 'RK-261003-001', 0), ('日期', '2026-10-03', 0), ('花材', '尤加利 30 枝', 1), ('经办人', '陈青', 0)], 'grey')
    + '</div>' + bar(('新建出库', 0), ('新建报损', 1)))
F = pair('仓库「单据」（新页面）', '数据是示意（种子里没有手工单）', 'u1-w13-moves.png', 'u1-w13 现在只能从某种花材的出入库记录里找', docs, [
    '列出仓库自己开的单：出库、报损、手工入库，新的在前。点卡片进单据详情，作废在详情底栏。',
    '能按单号或花材搜，页签按类型分，筛选按日期和经办人。',
    '卡片抬头写单据类型（出库再带出库分类），一眼认得出；花材摘要直接写在卡片上。',
    ASK('要你定：底栏放「新建出库 / 新建报损」两个按钮可以吗？手工入库从首页小格进。或者底栏不放按钮。'),
])

# ---------- G 财务首页 ----------
fin = phone(status() + nav('财务') + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(0, '逾期未收', True) + todo(1, '可开对账单') + '</div>'
    + wait([(1, '待收款 ¥3,588.00', '等客户付款'), (0, '待付款', '对账单未付')])
    + '<div class="sec">常用</div>' + grid([('big', 'book-open', '客户对账'), ('big', 'scale', '供应商对账'), ('wide', 'arrow-left-right', '收付款记录')])
    + '<div class="sec">资料</div>' + grid([('sm', 'credit-card', '收付款方式')]).replace('class="c sm"', 'class="c sm" style="grid-column:1/-1;border:0"')
    + '<div class="sec mark">待处理<small>可开对账单 1 家</small></div>'
    + card('云岭花卉', '未对账', [('往来', '供应商', 0), ('采购单', '1 张', 0), ('最早收货', '2026-09-29', 0), ('收货金额', '<span class="money">¥960.00</span>', 0)])
    + '</div>', wall=True)
G = pair('财务首页', '你定的：加「可开对账单」；收付款方式挪到这里', 'u1-f1-fin-home.png', 'u1-f1', fin, [
    '红色待办：<b>逾期未收</b>和新加的<b>可开对账单 n 家</b>（客户和供应商合计）。点「可开对账单」进客户或供应商列表的「有未对账」页签（第 3 批加），按金额从大到小排。',
    '「待收款」「待付款」是在等对方付钱，挪进灰色行，金额照样显示。',
    '<b>收付款方式</b>从「我的」挪到财务首页的资料格，财务自己就能找到。',
    '需要改规格 F1 那句「未开对账单不计入首页待办」（你已经同意）。',
])

# ---------- H 管理员「我的」 ----------
myadmin = phone(status() + '<div class="body">'
    + '<div class="hero"><div class="name">瑞瑞</div><div class="info">岗位<b>管理员</b>　登录手机号<b>13700000001</b></div></div>'
    + grid([('big', 'boxes', '库存查询'), ('big', 'notebook-text', '操作日志'), ('wide', 'users', '员工与岗位')])
    + '<div class="quiet">退出登录</div>'
    + '</div>' + tabbar(['首页', '我的'], '我的'), wall=True)
H = pair('管理员「我的」', '收付款方式挪走，组件总览只在开发版出现', 'u1-m4-my-admin.png', 'u1-m4', myadmin, [
    '收付款方式挪到财务首页。管理员能进财务，所以入口没少。',
    '「组件总览」是开发用的页面，正式版不再显示（开发者工具里照样能看到）。',
    '身份行改成写字段名：「岗位 管理员　登录手机号 …」，和规格要求一致。',
    '「库存查询」是你 10-05 要求加的，这里保留。审查时说它和仓库模块重复。管理员也能进仓库，' + ASK('要不要去掉？'),
])

# ---------- I 门店「我的」 ----------
mystore = phone(status() + '<div class="body">'
    + '<div class="hero"><div class="name">陈女士</div><div class="info">门店<b>晨曦花艺 · 滨江店</b><br>登录手机号<b>13800138001</b></div></div>'
    + '<div class="card mark"><div class="h"><b>对账</b><span class="tag">未结清</span></div>'
    + '<div class="f"><div><span class="k">本店未付</span><span class="money">¥1,488.00</span></div><div><span class="k">付款截止</span><span class="v">2026-10-29</span></div>'
    + '<div class="w"><span class="k">对账单</span><span class="v">DZ-260929-001 · 晨曦花艺</span></div></div></div>'
    + grid([('wide', 'phone', '联系花众')])
    + '<div class="quiet">退出登录</div>'
    + '</div>' + tabbar(['订货', '订单', '我的'], '我的'), wall=True)
I = pair('门店「我的」', '最关心的「欠多少、什么时候付」放到这里', 's1-m4-my-store.png', 's1-m4', mystore, [
    '加<b>对账</b>卡：本店未付金额、付款截止日期、对账单号。点卡片进对账单详情；全部结清时写「没有未结清的对账单」。',
    '身份行写字段名（门店、登录手机号）。',
    '「组件总览」不再显示。',
    '供应商的「我的」按同样做法：显示「未收货款」、对账单。',
    ASK('要你定：门店账号看到的是「本店」金额，还是整个客户（晨曦花艺几家店合计）的金额？现在对账单是按客户开的。'),
])

# ---------- J 采购单页：两段 ----------
pos = phone(status() + nav('采购单') + '<div class="body">'
    + '<div class="seg mark"><span>采购单</span><span class="on">填报邀请<sup>1</sup></span></div>'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号、供应商、花材</div>'
    + '<div class="tabs"><span class="on">全部</span><span>待填报<span class="cnt">1</span></span><span>已提交</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + card('春禾花材', '待填报', [('邀请单号', 'YQ-260929-001', 0), ('邀请日期', '2026-09-29', 0), ('花材', '向日葵 需求 60 枝', 1)])
    + '</div>' + bar(('新建采购单', 1)))
J = pair('采购单页 · 填报邀请', '你定的：填报邀请并入采购单页，采购需求只看缺货', 'u1-c2-demand-invites.png', 'u1-c2 现在藏在采购需求的页签里', pos, [
    '采购单页顶部分<b>采购单 / 填报邀请</b>两段（宋体大字，和门店订单页同一种做法）。发出去的东西都在这里查进度。',
    '采购需求页去掉「全部 / 缺货 / 待填报」页签，只看缺货花材，底栏照旧「邀请供应商 / 生成采购单」。',
    '发出邀请后：跳到这里的「填报邀请」段（顺便解决规格 03、06 章说法不一致的问题）。',
    '底栏「新建采购单」两段都显示。',
    ASK('要你看：填报邀请的页签用「全部 / 待填报 / 已提交」可以吗？'),
])

# ---------- K 销售订单列表底栏 ----------
so = phone(status() + nav('销售订单') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号、客户、门店</div>'
    + '<div class="tabs"><span class="on">全部</span><span>待确认<span class="cnt">1</span></span><span>待发货<span class="cnt">2</span></span><span>已发货</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + card('拾光花店 · 文新店', '待发货', [('单号', 'SO-260929-016', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '2026-09-29', 0), ('订单金额', '<span class="money">¥1,560.00</span>', 0)])
    + card('晨曦花艺 · 滨江店', '待确认', [('单号', 'SO-260929-018', 0), ('下单日期', '2026-09-29', 0), ('出货日期', '待定', 0), ('订单金额', '<span class="money">¥2,140.00</span>', 0)])
    + card('拾光花店 · 文新店', '已发货', [('单号', 'SO-260928-030', 0), ('下单日期', '2026-09-28', 0), ('出货日期', '2026-09-29', 0), ('发货金额', '<span class="money">¥936.00</span>', 0)], 'done')
    + '</div>' + '<div class="mark" style="border-radius:0">' + bar(('新建订单', 1)) + '</div>')
K = pair('销售订单列表', '你定的：「邀请订货」移到客户页', 'u1-x2-orders.png', 'u1-x2', so, [
    '底栏只留「新建订单」。勾选待确认的单子时，底栏换成「全选 / 批量确认（n）」，和现在一样。',
    '第 4 批会把批量勾选统一成「在全部页签也能勾」。',
])

# ---------- L 客户页底栏 ----------
cu = phone(status() + nav('客户') + '<div class="body" style="padding:0;flex-direction:row;gap:0">'
    + '<div style="width:100px;background:#fffbf680;padding-top:14px;font:400 15px var(--serif);color:var(--muted)">'
    + '<div style="padding:12px 0 12px 14px;background:var(--paper);color:var(--ink)">• 晨曦花艺</div><div style="padding:12px 0 12px 18px">拾光花店</div><div style="padding:12px 0 12px 18px">一间花房</div></div>'
    + '<div style="flex:1;padding:14px 14px;display:flex;flex-direction:column;gap:10px">'
    + '<div style="display:flex;justify-content:space-between;font:600 17px var(--sans)">晨曦花艺<span style="font:400 15px var(--sans);text-decoration:underline;text-decoration-color:var(--rule);text-underline-offset:4px">修改客户</span></div>'
    + '<div class="tabs" style="font:400 17px var(--serif)"><span class="on">门店</span><span>订货目录</span></div>'
    + card('滨江店', '', [('联系人', '陈女士', 1), ('联系电话', '13800138001', 1)])
    + card('城西店', '', [('联系人', '王先生', 1), ('联系电话', '13800138002', 1)])
    + '</div></div>' + '<div class="mark" style="border-radius:0">' + bar(('邀请订货', 0), ('新建门店', 1)) + '</div>')
L = pair('客户页', '「邀请订货」放这里', 'u1-x8-customers.png', 'u1-x8', cu, [
    '底栏改成「邀请订货 / 新建门店」。邀请订货的弹层不变：按客户分组列门店，选好就转发。',
    '在「门店」页签里点了某家门店，就直接邀请这家，少选一次。',
    '门店卡片太松的问题（每张只有 2 个字段，却占五分之一屏），第 4 批再改。',
])

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>第 1 批 · 结构和待办 · 对照稿</h1>
<div class="lead">左边是现在的截图（10-05 版），右边是改后草稿，旁边写改了什么。黄色底的句子要你定或要你看。虚线框是新加或挪过来的东西。<br>
数据用的是种子数据（今天按 2026-10-05 算），只有「单据」那张是示意。卡片样式先沿用现在的写法，第 4 批「卡片主次」再统一换。</div>
{A}{B}{C}{D}{E}{F}{G}{H}{I}{J}{K}{L}
</body></html>"""
pathlib.Path('/tmp/hz-ux1/index.html').write_text(html)
print('ok', len(html))
