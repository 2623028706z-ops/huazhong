# 订货目录改造对照稿：产品归客户、拆「客户门店 / 订货目录」两个入口、发货时存配方
import pathlib, re
src = pathlib.Path('/tmp/hz-ux1/gen.py').read_text()
exec(src.split('# ---------- A')[0])

CSS2 = """
.split { flex:1; display:flex; overflow:hidden; }
.side { width:100px; background:#fffbf680; padding-top:14px; font:400 15px var(--serif); color:var(--muted); flex:none; }
.side div { padding:12px 0 12px 18px; } .side .on { background:var(--paper); color:var(--ink); padding-left:14px; }
.main { flex:1; padding:14px; display:flex; flex-direction:column; gap:10px; overflow:hidden; }
.mh { display:flex; justify-content:space-between; align-items:baseline; font:600 17px var(--sans); }
.mh a { font:400 14px var(--sans); color:var(--ink); text-decoration:underline; text-decoration-color:var(--rule); text-underline-offset:4px; }
.rows { background:var(--paper); border:1px solid var(--hair); border-radius:10px; }
.rows .r { display:flex; align-items:center; gap:8px; padding:0 10px 0 14px; min-height:48px; font-size:15px; }
.rows .r + .r { border-top:1px solid var(--line); }
.rows .r span.t { flex:1; }
.gh { font:400 14px var(--serif); color:var(--muted); margin:2px 0 -4px 2px; }
.pr { padding:10px 10px 10px 14px !important; align-items:flex-start !important; }
.pr .t b { font-weight:600; font-size:15px; display:block; }
.pr .t i { white-space:nowrap; font-style:normal; font-size:12px; color:var(--muted); display:block; margin-top:3px; line-height:18px; }
.pr .p { font:400 15px var(--serif); white-space:nowrap; padding-top:1px; }
.pr .p small { font:12px var(--sans); color:var(--muted); }
.off { font-size:11px; padding:1px 5px; border-radius:4px; background:#eeeae5; color:#6f665f; margin-left:6px; font-weight:400; }
.blk { background:var(--paper); border:1px solid var(--hair); border-radius:10px; padding:4px 16px; }
.blk .bt { font:400 15px var(--serif); padding:10px 0 6px; display:flex; justify-content:space-between; }
.blk .bt small { font:12px var(--sans); color:var(--muted); }
.fr { display:flex; align-items:center; min-height:40px; border-top:1px solid var(--line); font-size:15px; }
.fr .k { width:92px; color:var(--muted); font-size:14px; flex:none; } .fr .v { flex:1; } .fr .v.ph { color:#b9a598; }
.sw { width:44px; height:26px; border-radius:13px; background:var(--green); position:relative; }
.sw::after { content:''; position:absolute; right:3px; top:3px; width:20px; height:20px; border-radius:10px; background:#fff; }
.img { width:44px; height:44px; border-radius:8px; border:1px dashed var(--hair); display:flex; align-items:center; justify-content:center; margin:6px 0; }
.bom { width:100%; font-size:14px; border-collapse:collapse; } .bom th { font-weight:400; color:var(--muted); font-size:12px; text-align:left; padding:8px 0 6px; }
.bom td { padding:9px 0; border-top:1px solid var(--line); } .bom .n { text-align:right; }
.addm { text-align:center; color:var(--brand); font-size:15px; padding:12px 0 10px; border-top:1px solid var(--line); }
.mask { position:absolute; inset:0; background:#0006; display:flex; flex-direction:column; justify-content:flex-end; }
.sheet { background:var(--paper); border-radius:14px 14px 0 0; padding:16px 18px 30px; }
.sheet .st { font:400 18px var(--serif); text-align:center; margin-bottom:12px; }
.sheet .sub { font-size:12px; color:var(--muted); text-align:center; margin:-6px 0 12px; }
.opt { border:1px solid var(--hair); border-radius:10px; padding:14px 16px; margin-bottom:10px; display:flex; gap:12px; align-items:center; }
.opt b { display:block; font-size:16px; } .opt i { font-style:normal; font-size:12px; color:var(--muted); line-height:18px; }
.ck { width:20px; height:20px; border-radius:10px; border:1.5px solid var(--rule); flex:none; }
.ck.on { background:var(--brand); border-color:var(--brand); position:relative; }
.ck.on::after { content:''; position:absolute; left:6px; top:2.5px; width:5px; height:10px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
.ck.dis { background:#eeeae5; border-color:#e2d9d1; }
.hint { font-size:12px; color:var(--amber); background:var(--amber-bg); border-radius:6px; padding:8px 10px; line-height:18px; }
.ltbl { width:100%; font-size:14px; border-collapse:collapse; } .ltbl th { font-weight:400; color:var(--muted); font-size:12px; text-align:right; padding:6px 0; }
.ltbl th:first-child { text-align:left; } .ltbl td { padding:10px 0 10px 10px; text-align:right; border-top:1px solid var(--line); vertical-align:top; }
.ltbl td:first-child { text-align:left; padding-left:0; } .ltbl th { padding-left:10px; white-space:nowrap; } .ltbl td { white-space:nowrap; } .ltbl td b { font-weight:600; } .ltbl td i { display:block; font-style:normal; font-size:12px; color:var(--muted); }
.ltbl tr.tap td { background:#f3e2d680; }
"""
CSS2 += """
.hero2 { display:flex; gap:14px; align-items:center; padding:12px 16px; }
.img2 { width:64px; height:64px; border-radius:8px; background:var(--tint,#f8ebe4); display:flex; align-items:center; justify-content:center; flex:none; }
.hf { flex:1; } .hf .fr2:first-child { border-top:0; }
.fr2 { display:flex; align-items:center; min-height:44px; font-size:15px; border-top:1px solid var(--line); }
.card > .fr2:first-child { border-top:0; }
.fr2 .k { width:96px; flex:none; color:var(--muted); font-size:13px; }
.fr2 .v { flex:1; color:var(--ink); } .fr2 .strong { font-weight:600; font-size:16px; }
.fr2 .q { font:400 16px var(--serif); }
.fr2.big { min-height:56px; } .fr2 .pz { font:400 24px var(--serif); color:var(--ink); } .fr2 small { color:var(--muted); font-size:13px; }
.fr2.add { justify-content:center; color:var(--brand); }
.hf .fr2 { min-height:36px; }
"""
CSS += CSS2

SIDE = lambda on: '<div class="side">' + ''.join(f'<div class="{"on" if c == on else ""}">{"• " if c == on else ""}{c}</div>' for c in ['晨曦花艺', '拾光花店', '一间花房']) + '</div>'

def prow(name, price, unit, code, n, off=False):
    o = '<span class="off">已停用</span>' if off else ''
    sub = '<br>'.join(x for x in [f'客户产品编码 {code}' if code else '', f'配方 {n} 种花材'] if x)
    return (f'<div class="r pr"><span class="t"><b>{name}{o}</b><i>{sub}</i></span>'
            f'<span class="p">¥{price}<small>/{unit}</small></span>{CHEV()}</div>')

# ---------- 1 销售首页 ----------
home = phone(status() + nav('销售') + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(1, '待确认订单') + todo(0, '取消申请', True) + todo(1, '待处理售后') + '</div>'
    + '<div class="sec">常用</div>' + grid([('big', 'file-text', '销售订单'), ('big', 'rotate-ccw', '客户售后')])
    + '<div class="sec">资料</div><div class="mark">' + grid([('sm', 'store', '客户门店'), ('sm', 'book-open', '订货目录')]) + '</div>'
    + '</div>', wall=True)
P1 = pair('销售首页', '「资料」两格：客户门店、订货目录', 'u1-x1-sales-home.png', 'u1-x1（第 1 批前截图，入口没变）', home, [
    '「资料」组从「客户 / 产品」改成「客户门店 / 订货目录」。',
    '「产品」整页删掉：产品都放进订货目录，按客户各管各的。',
    '待办、常用两组不动。',
])

# ---------- 2 客户门店 ----------
st = phone(status() + nav('客户门店') + '<div class="split">' + SIDE('晨曦花艺')
    + '<div class="main"><div class="mh">晨曦花艺<a>修改客户</a></div>'
    + '<div class="rows"><div class="r"><span class="ck"></span><span class="t">滨江店</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="ck"></span><span class="t">城西店</span>' + CHEV() + '</div>'
    + '<div class="r"><span class="ck"></span><span class="t">城东店<span class="off">已停用</span></span>' + CHEV() + '</div></div>'
    + '</div></div>' + bar(('邀请订货', 0), ('新建门店', 1)))
P2 = pair('客户门店', '只管客户和门店', 'u1-x8-customers.png', 'u1-x8（第 1 批前截图）', st, [
    '页面标题改成「客户门店」。去掉「门店 / 订货目录」两个页签，右边只列门店。',
    '门店一行一家（第 1 批已定）：联系人、电话进门店资料看。',
    '底栏「邀请订货 / 新建门店」不变。先点行首圆圈选一家门店，再点邀请订货，就直接邀请这家。',
])

# ---------- 3 订货目录 ----------
cat = phone(status() + nav('订货目录') + '<div class="split">' + SIDE('晨曦花艺')
    + '<div class="main"><div class="mh">晨曦花艺<small style="font:400 12px var(--sans);color:var(--muted)">4 个产品</small></div>'
    + '<div class="gh">日常花束</div><div class="rows">'
    + prow('粉玫瑰日常花束', '68.00', '束', 'CX-101', 2) + prow('白绿清新花束', '78.00', '束', 'CX-102', 1) + '</div>'
    + '<div class="gh">礼赠花束</div><div class="rows">' + prow('向日葵混合花束', '88.00', '束', '', 1, True) + '</div>'
    + '<div class="gh">桌面花艺</div><div class="rows">' + prow('白绿桌花', '128.00', '盆', 'CX-301', 1) + '</div>'
    + '</div></div>' + bar(('管理分类', 0), ('添加产品', 1)))
P3 = pair('订货目录', '新的独立入口：左边选客户，右边是这个客户自己的产品', 'u1-x9-products.png', 'u1-x9 现在的「产品」页（要删掉）', cat, [
    '左边选客户，右边按这个客户的<b>订货分类</b>分组。每个产品一行：产品名、订货价/单位；小字是客户产品编码和「配方 n 种花材」。',
    '这里的产品<b>只属于晨曦花艺</b>。拾光花店也有一个「粉玫瑰日常花束」，那是它自己的一份，名称、配方、价格都单独改。',
    '「产品内部分类（单品、花束）」不要了，只留订货分类（门店订货页也是按它分组）。',
    '点一行进「目录产品」表单；底栏「管理分类 / 添加产品」。',
    ASK('要你看：每行小字显示「配方 n 种花材」够不够，还是要直接列出花材名（例如「粉雪山玫瑰 10 · 尤加利 3」）？'),
])

# ---------- 4 目录产品表单 ----------
form = phone(status() + nav('目录产品') + '<div class="body" style="gap:8px">'
    + '<div class="gh" style="margin:0 0 0 2px">晨曦花艺的产品</div>'
    + '<div class="card hero2"><span class="img2">' + icon('image-plus', 22, 'var(--muted)') + '</span>'
    + '<div class="hf"><div class="fr2"><span class="k">产品名称</span><span class="v strong">粉玫瑰日常花束</span></div>'
    + '<div class="fr2"><span class="k">单位</span><span class="v">束</span></div></div></div>'
    + '<div class="gh">订货信息</div>'
    + '<div class="card" style="padding:0 16px">'
    + '<div class="fr2 big"><span class="k">订货价</span><span class="v"><span class="pz">¥68.00</span><small> /束</small></span></div>'
    + '<div class="fr2"><span class="k">订货分类</span><span class="v">日常花束</span>' + CHEV() + '</div>'
    + '<div class="fr2"><span class="k">客户产品编码</span><span class="v">CX-101</span></div>'
    + '<div class="fr2"><span class="k">可订</span><span class="v"></span><span class="sw"></span></div></div>'
    + '<div class="gh" style="display:flex;justify-content:space-between">配方明细<small style="font:12px var(--sans)">每束用量 · 2 种花材</small></div>'
    + '<div class="card" style="padding:0 16px">'
    + '<div class="fr2"><span class="v">粉雪山玫瑰</span><span class="q">10 枝</span></div>'
    + '<div class="fr2"><span class="v">尤加利</span><span class="q">3 枝</span></div>'
    + '<div class="fr2 add">+ 添加花材</div></div>'
    + '</div>' + bar(('保存', 1)))
P4 = pair('目录产品（表单）', '原「产品表单」和「目录产品」合成一页；按信息密度和层级重排', 'u1-x9-products.png', '没有截到现在的目录产品页；左边是要删的「产品」页', form, [
    '<b>第一眼看产品</b>：顶上一张卡，左边产品图（1:1 小图），右边产品名称（加粗）和单位，不再单独占「基本信息」整块。',
    '<b>第二眼看订货价</b>：订货信息第一行是订货价，用大号衬线字；订货分类、客户产品编码、可订跟在下面，字段名统一左对齐、同宽。',
    '组标题（订货信息、配方明细）放到卡片外面，贴着下面的卡片；卡片里只放字段，去掉卡内重复的小标题。',
    '配方明细一行一种花材，花材名在左、用量在右（衬线数字），右上角写「每束用量 · 2 种花材」；最后一行「+ 添加花材」。点一行改用量或删除。',
    '行高统一 44px（订货价那行 56px），一屏就能看完全部信息和配方，不用往下滑。',
    '抬头小字「晨曦花艺的产品」提醒改的只是这个客户的。原来「配方所有客户共用」的提示和确认框去掉。',
    '同一个客户下产品名不能重复；可订关掉 = 停用，门店看不到、新订单不能选，已有待发货订单照常发。',
])

# ---------- 5 添加产品 ----------
add = phone(status() + nav('订货目录') + '<div class="split">' + SIDE('一间花房') + '<div class="main"></div></div>'
    + '<div class="mask"><div class="sheet"><div class="st">添加产品</div><div class="sub">加到「一间花房」的订货目录</div>'
    + '<div class="opt">' + icon('square-plus', 26) + '<div><b>新建产品</b><i>从空白开始填名称、配方、订货价</i></div></div>'
    + '<div class="opt">' + icon('copy', 26) + '<div><b>从其他客户复制</b><i>带名称、单位、产品图、配方；订货价和编码要重新填</i></div></div>'
    + '</div></div>')
cp = phone(status() + nav('从其他客户复制') + '<div class="body">'
    + '<div class="seg" style="font-size:17px;gap:20px"><span class="on">晨曦花艺</span><span>拾光花店</span></div>'
    + '<div class="rows">'
    + '<div class="r pr"><span class="ck on"></span><span class="t"><b>粉玫瑰日常花束</b><i>束 · 粉雪山玫瑰 10、尤加利 3</i></span></div>'
    + '<div class="r pr"><span class="ck on"></span><span class="t"><b>白绿清新花束</b><i>束 · 白玫瑰 8</i></span></div>'
    + '<div class="r pr" style="opacity:.55"><span class="ck dis"></span><span class="t"><b>向日葵混合花束</b><i>一间花房已有同名产品，跳过</i></span></div>'
    + '<div class="r pr" style="opacity:.55"><span class="ck dis"></span><span class="t"><b>白绿桌花</b><i>一间花房已有同名产品，跳过</i></span></div>'
    + '</div>'
    + '<div class="hint">复制过来的产品放进哪个订货分类、订货价多少，复制后在目录里逐个补；补好订货价之前门店看不到。</div>'
    + '</div>' + bar(('复制（2）', 1)))
P5 = pair('添加产品', '两种方式：新建，或从别的客户勾几个复制', None, '', add,
    ['点「添加产品」先弹这个选择层。', '「新建产品」直接进上面那张表单（空白）。', '「从其他客户复制」进右边这页 →'])
P5 = re.sub(r'<div class="col"><div class="cap"><b>现在</b>.*?</div></div>', '', P5, count=1, flags=re.S)
P5 = P5.replace('<ul class="notes">', '<div class="col"><div class="cap"><b>改后</b> · 从其他客户复制</div>' + cp + '</div><ul class="notes">')
P5 = P5.replace('</ul></div></div>', '<li>顶上切换来源客户（不列当前客户自己）；勾选要复制的产品，小字显示单位和配方。</li>'
    '<li>和当前客户重名的产品不能勾，写明「已有同名产品，跳过」。</li>'
    '<li>复制后每个产品是这个客户独立的一份，以后各改各的。</li>'
    f'<li>{ASK("要你定：复制过来时订货价怎么办？A 先空着，补好前门店看不到（稿子画的是这个）；B 先照抄来源客户的价，再按需改。")}</li>'
    '<li>目录完全是空的客户，分类弹层里原来的「整份复制」保留。</li></ul></div></div>')

# ---------- 6 订单详情 配方 ----------
od = phone(status() + nav('订单详情') + '<div class="body" style="padding-top:10px">'
    + card('晨曦花艺 · 滨江店', '已发货', [('单号', 'SO-260927-021', 0), ('来源', '门店下单', 0), ('发货时间', '2026-09-28 07:30', 1)], 'done')
    + '<div class="card"><table class="ltbl"><tr><th>产品明细</th><th>实发</th><th>单价</th><th>小计</th></tr>'
    + '<tr class="tap"><td><b>粉玫瑰日常花束</b><i>客户产品编码 CX-101 · 配方 ›</i></td><td>15 束</td><td>¥68.00</td><td>¥1,020.00</td></tr>'
    + '<tr><td><b>白绿清新花束</b><i>客户产品编码 CX-102 · 配方 ›</i></td><td>6 束</td><td>¥78.00</td><td>¥468.00</td></tr></table></div>'
    + '</div>'
    + '<div class="mask"><div class="sheet"><div class="st">粉玫瑰日常花束</div><div class="sub">发货时配方 · 2026-09-28 07:30 存下，之后改配方不影响</div>'
    + '<table class="bom"><tr><th>花材</th><th class="n">每束用量</th><th class="n">实发 15 束合计</th></tr>'
    + '<tr><td>粉雪山玫瑰</td><td class="n">10 枝</td><td class="n">150 枝</td></tr>'
    + '<tr><td>尤加利</td><td class="n">3 枝</td><td class="n">45 枝</td></tr></table></div></div>')
P6 = pair('订单详情（已发货）', '发货时存下的配方', 'u1-x3-order-shipped.png', 'u1-x3（产品行现在点不了）', od, [
    '点「发货」那一刻，把每个产品当时的配方存进这张订单。',
    '已发货订单的产品行多一个「配方 ›」，点开看当时每束用了哪些花材、用量，以及按实发数算的合计。',
    '以后在订货目录改配方，这里不变。',
    '待确认、待发货的订单不显示这个（它们跟最新配方走）。',
    '实发 0 的产品不存配方。',
    ASK('要你看：合计列（按实发数乘出来的花材总量）要不要？'),
])

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>订货目录改造 · 对照稿</h1>
<div class="lead">产品改成按客户各自维护，「客户门店」和「订货目录」分成两个入口，发货时存下配方。左边是现在的截图，右边是改后草稿；黄色底的句子要你定或要你看，虚线框是新加的东西。<br>
数据用种子数据。改好后种子里会让拾光花店的「粉玫瑰日常花束」配方和晨曦花艺略有不同，方便演示「各管各的」。</div>
{P1}{P2}{P3}{P4}{P5}{P6}
</body></html>"""
pathlib.Path('/tmp/hz-cat/index.html').write_text(html)
print('ok', len(html))
