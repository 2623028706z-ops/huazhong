# 第 2 批（录入方式）对照稿：选择弹层可搜索 + 行内填数量、客户门店一次选、出库分类默认上次、再来一单、门店改单
import pathlib, re
src = pathlib.Path('/tmp/hz-ux1/gen.py').read_text()
exec(src.split('# ---------- A')[0])
cat_src = pathlib.Path('/tmp/hz-cat/gen.py').read_text()
CSS += ''.join(re.findall(r'CSS2 \+?= """(.*?)"""', cat_src, re.S))
CSS += """
.mask { position:absolute; inset:0; background:#0006; display:flex; flex-direction:column; justify-content:flex-end; }
.sheet { background:var(--paper); border-radius:14px 14px 0 0; padding:14px 0 0; display:flex; flex-direction:column; max-height:75%; }
.sheet .st { font:400 16px var(--serif); text-align:center; margin-bottom:10px; position:relative; }
.sheet .st .x { position:absolute; left:16px; top:0; }
.sheet .search { margin:0 16px 8px; }
.pk { overflow:hidden; flex:1; }
.pk .r { display:flex; align-items:center; gap:10px; padding:10px 16px; border-top:1px solid var(--line); min-height:58px; }
.pk .r .t { flex:1; } .pk .r .t b { display:block; font-size:15px; font-weight:600; } .pk .r .t i { font-style:normal; font-size:12px; color:var(--muted); }
.pk .gh2 { font:400 13px var(--serif); color:var(--muted); padding:8px 16px 4px; border-top:1px solid var(--line); }
.plus { width:28px; height:28px; border-radius:14px; border:1.5px solid var(--brand); color:var(--brand); display:flex; align-items:center; justify-content:center; font-size:20px; line-height:1; }
.step { display:flex; align-items:center; gap:0; border:1px solid var(--hair); border-radius:8px; height:32px; }
.step span { width:30px; text-align:center; color:var(--brand); font-size:18px; } .step b { min-width:40px; text-align:center; font:400 16px var(--serif); border-left:1px solid var(--hair); border-right:1px solid var(--hair); line-height:30px; }
.sbar { display:flex; gap:12px; padding:10px 16px 28px; border-top:1px solid var(--line); align-items:center; }
.sbar .sum { flex:1; font-size:13px; color:var(--muted); } .sbar .sum b { color:var(--ink); font:400 17px var(--serif); }
.sbar .btn { flex:none; width:150px; }
.sel { display:flex; align-items:center; gap:8px; } .sel .on { color:var(--brand); }
.chk { width:20px; height:20px; border-radius:10px; background:var(--brand); position:relative; flex:none; }
.chk::after { content:''; position:absolute; left:6.5px; top:3px; width:5px; height:10px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(45deg); }
.again { display:flex; align-items:center; gap:10px; background:#fffbf6e6; border:1px solid var(--hair); border-radius:10px; padding:10px 12px; margin:0 16px; }
.again .t { flex:1; font-size:13px; } .again .t b { display:block; font-size:14px; } .again .t i { font-style:normal; font-size:12px; color:var(--muted); }
.again .go { border:1px solid var(--brand); color:var(--brand); border-radius:16px; padding:4px 12px; font-size:13px; white-space:nowrap; }
.shophead { padding:6px 16px 10px; } .shophead .n { font:600 17px var(--sans); } .shophead .d { font-size:13px; color:var(--muted); margin-top:4px; }
.shop { flex:1; display:flex; margin-top:10px; overflow:hidden; }
.shop .side { width:92px; font-size:14px; } .shop .side div { padding-left:10px; } .shop .side .on { padding-left:8px; } .shop .goods { flex:1; background:var(--paper); padding:10px; }
.good { display:flex; gap:10px; padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid var(--line); }
.good .pic { width:76px; height:76px; border-radius:8px; background:#f3e2d6; flex:none; }
.good .t { flex:1; font-size:12px; color:var(--muted); } .good .t b { display:block; font-size:15px; color:var(--ink); margin-bottom:2px; }
.good .p { font:400 14px var(--serif); color:var(--ink); margin-top:8px; display:flex; justify-content:space-between; align-items:center; }
.cart { margin:8px 12px; height:56px; border-radius:28px; background:#3b2a24; display:flex; align-items:center; padding:0 6px 0 22px; color:#fff; gap:14px; }
.cart .m { flex:1; font:400 18px var(--serif); } .cart .m small { display:block; font:11px var(--sans); opacity:.7; }
.cart .go { background:var(--brand); border-radius:22px; height:44px; padding:0 22px; display:flex; align-items:center; font-weight:600; }
.toast { position:absolute; left:50%; top:46%; transform:translateX(-50%); background:#3b2a24e6; color:#fff; font-size:13px; padding:10px 14px; border-radius:8px; width:250px; line-height:19px; text-align:center; }
"""

def pkrow(name, sub, qty=0):
    right = f'<span class="step"><span>−</span><b>{qty}</b><span>+</span></span>' if qty else '<span class="plus">+</span>'
    return f'<div class="r"><span class="t"><b>{name}</b><i>{sub}</i></span>{right}</div>'

X = icon('x', 20, 'var(--ink)')
SEARCH = lambda t: '<div class="search">' + icon('search', 18, 'var(--muted)') + t + '</div>'

# ---------- 1 选择弹层（出入库 / 采购单 / 邀请：选花材） ----------
pick_m = phone(status() + nav('新建出库单') + '<div class="body"></div>'
    + '<div class="mask"><div class="sheet"><div class="st"><span class="x">' + X + '</span>添加花材</div>'
    + SEARCH('搜索花材名称、编码') + '<div class="pk">'
    + pkrow('粉雪山玫瑰', '库存 228 枝', 20) + pkrow('白玫瑰', '库存 146 枝') + pkrow('向日葵', '库存 60 枝')
    + pkrow('洋桔梗', '库存 95 枝', 10) + pkrow('尤加利', '库存 86 枝')
    + '</div><div class="sbar"><span class="sum">已选 <b>2</b> 种</span><div class="btn p">添加（2）</div></div></div></div>')
P1 = pair('选择弹层：选花材', '出库单、入库单、采购单、采购邀请共用', 'u1-w5-out-new.png', 'u1-w5 新建出库单（弹层现在没截图）', pick_m, [
    '顶上加<b>搜索框</b>：按名称、编码筛（花材多了不用往下翻）。',
    '每行右边：没选时是一个「+」，<b>点一下就选上、数量 1</b>；选上后变成「− 数量 +」，数字可以直接点开打字。',
    '<b>选的时候数量就填好了</b>，点「添加（n）」后直接进表格，不再自动弹出最后一行的小窗口。以后要改，还是点那一行打开小窗口（逐行弹窗保留）。',
    '出库、报损的行显示库存；入库、采购单、邀请的行只显示单位（不带上次价格、上次数量，你定的）。',
    '采购单单价仍然要在表格里逐行点开填。',
    '从采购需求页带过来的花材，数量仍然是缺口量。',
])

# ---------- 2 选择弹层：选产品（代客下单） ----------
pick_p = phone(status() + nav('新建订单') + '<div class="body"></div>'
    + '<div class="mask"><div class="sheet"><div class="st"><span class="x">' + X + '</span>添加产品</div>'
    + SEARCH('搜索产品名称、客户产品编码') + '<div class="pk">'
    + '<div class="gh2">日常花束</div>' + pkrow('粉玫瑰日常花束', '客户产品编码 CX-101 · 订货价 ¥68.00/束', 20) + pkrow('白绿清新花束', '客户产品编码 CX-102 · 订货价 ¥78.00/束')
    + '<div class="gh2">桌面花艺</div>' + pkrow('白绿桌花', '客户产品编码 CX-301 · 订货价 ¥128.00/盆')
    + '</div><div class="sbar"><span class="sum">已选 1 种 · <b>¥1,360.00</b></span><div class="btn p">添加（1）</div></div></div></div>')
P2 = pair('选择弹层：选产品', '代客下单', 'u1-x4-order-new.png', 'u1-x4 新建订单（弹层现在没截图）', pick_p, [
    '和选花材一样：搜索 + 每行「+」/「− 数量 +」。',
    '按这个客户的订货分类分组，小字写客户产品编码和订货价；底部显示已选金额。',
    '只列这个客户可订的产品（订货目录改造后，产品本来就是这个客户自己的）。',
    '售后表单的「添加产品」也换成这个弹层；但售后每行还要选问题原因，所以添加后仍打开小窗口选原因。',
])

# ---------- 3 代客下单：客户门店一次选 ----------
cs = phone(status() + nav('新建订单') + '<div class="body"></div>'
    + '<div class="mask"><div class="sheet"><div class="st"><span class="x">' + X + '</span>选择门店</div>'
    + SEARCH('搜索客户、门店') + '<div class="pk">'
    + '<div class="gh2">晨曦花艺</div>'
    + '<div class="r"><span class="t"><b>滨江店</b></span><span class="chk"></span></div>'
    + '<div class="r"><span class="t"><b>城西店</b></span></div>'
    + '<div class="gh2">拾光花店</div><div class="r"><span class="t"><b>文新店</b></span></div>'
    + '<div class="gh2">一间花房</div><div class="r"><span class="t"><b>湖滨店</b></span></div>'
    + '</div><div style="height:28px"></div></div></div>')
form = phone(status() + nav('新建订单') + '<div class="body">'
    + '<div class="card" style="padding:0 16px"><div class="fr2 mark" style="border-radius:6px"><span class="k">客户门店</span><span class="v">晨曦花艺 · 滨江店</span>' + CHEV() + '</div>'
    + '<div class="fr2"><span class="k">出货日期</span><span class="v">2026-10-06</span>' + CHEV() + '</div></div>'
    + '<div class="card"><div class="h"><b>产品明细</b></div><div class="empty">还没有明细，点下面添加</div><div class="addm">+ 添加产品</div></div>'
    + '</div>' + bar(('提交订单', 1)))
P3 = pair('代客下单：客户和门店一次选', '原来先选客户、再选门店，两次', 'u1-x4-order-new.png', 'u1-x4', form, [
    '「客户」「门店」两行合成一行「客户门店」，显示「晨曦花艺 · 滨江店」。',
    '点开是右边这个弹层 →'])
P3 = P3.replace('</ul></div></div>', '<li>按客户分组列门店，可搜索客户名或门店名；点一家就选好、弹层关闭。</li><li>只列启用的客户和门店（城东店已停用，不列）。</li><li>换了门店属于另一个客户时，清空已加的产品并提示（和现在换客户一样）。</li></ul></div></div>')
P3 = P3.replace('<ul class="notes">', '<div class="col"><div class="cap"><b>改后</b> · 选择门店弹层</div>' + cs + '</div><ul class="notes">')

# ---------- 4 出库分类默认上次 ----------
out = phone(status() + nav('新建出库单') + '<div class="body">'
    + '<div class="card" style="padding:0 16px"><div class="fr2 mark" style="border-radius:6px"><span class="k">出库分类</span><span class="v">生产领用</span>' + CHEV() + '</div></div>'
    + '<div class="card"><div class="h"><b>花材明细</b></div><div class="empty">还没有明细，点下面添加</div><div class="addm">+ 添加花材</div></div>'
    + '<div class="card" style="padding:0 16px"><div class="fr2"><span class="k">备注</span><span class="v ph" style="color:#b9a598">选填</span></div></div>'
    + '</div>' + bar(('确认出库', 1)))
P4 = pair('出库分类默认上次', '新建出库单', 'u1-w5-out-new.png', 'u1-w5', out, [
    '打开新建出库单，出库分类<b>直接填好你上次选的</b>（例如「生产领用」），要换再点。',
    '记在这台手机、这个账号上（和收付款方式「默认上次用的」一样的做法）。第一次用、或上次那个分类被删了，就还是「请选择」。',
    '「+ 添加花材」从卡片外的虚线框挪进明细卡底部，和其他表单一致。',
])

# ---------- 5 门店：再来一单 ----------
good = lambda n, c, p, q=0: (f'<div class="good"><span class="pic"></span><div class="t"><b>{n}</b>客户产品编码 {c}<div class="p">订货价 ¥{p}/束'
    + (f'<span class="step"><span>−</span><b>{q}</b><span>+</span></span>' if q else '<span class="plus">+</span>') + '</div></div></div>')
shop = phone('<div style="background:url(backdrop.jpg) center/cover;display:flex;flex-direction:column;flex:1">' + status() + '<div class="nav"><span class="capsule"></span></div>'
    + '<div style="padding:0 16px"><img src="logo.png" style="height:40px"></div><div class="shophead"><div class="n">晨曦花艺 · 滨江店</div><div class="d">今日可订 3 款　|　2026-10-06</div></div>'
    + '<div style="padding:0 16px 10px">' + SEARCH('搜索产品') + '</div>'
    + '<div class="again mark">' + icon('rotate-ccw', 20) + '<div class="t"><b>上一单 SO-260929-018</b><i>下单日期 2026-09-29 · 粉玫瑰日常花束 20 束、白绿清新花束 10 束</i></div><span class="go">再来一单</span></div>'
    + '<div class="shop"><div class="side"><div class="on">• 日常花束</div><div>桌面花艺</div></div><div class="goods">'
    + good('粉玫瑰日常花束', 'CX-101', '68.00', 20) + good('白绿清新花束', 'CX-102', '78.00', 10) + '</div></div>'
    + '<div class="cart">' + icon('shopping-cart', 24, '#fff') + '<div class="m">¥2,140.00<small>已选 2 款</small></div><div class="go">去下单</div></div>'
    + '</div>' + tabbar(['订货', '订单', '我的'], '订货'))
P5 = pair('门店订货页：再来一单', '门店端 S1', 's1-s1-shop.png', 's1-s1', shop, [
    '搜索框下面加一条「上一单」：单号、下单日期、产品和数量；右边「再来一单」。',
    '点「再来一单」：把上一单的产品和数量<b>加进购物车</b>（购物车里原来有的会被替换成上一单的数量），不直接下单，门店还能改。',
    '上一单里已经停用、不在目录里的产品<b>跳过</b>，弹提示「白绿清新花束已停用，没加进购物车」。价格按现在的订货价。',
    '门店从来没下过单就不显示这一条。',
    ASK('要你定：「上一单」取最近一张什么状态的单？A 最近一张没取消、没作废的（含待确认，稿子画的是这个）；B 只取已发货的。'),
    '这条推翻了 10-03 改版文档里「不加再来一单」的说法，规格书会一起改。',
])

# ---------- 6 门店改单底栏 ----------
edit = phone('<div style="background:url(backdrop.jpg) center/cover;display:flex;flex-direction:column;flex:1">' + status() + nav('修改订单')
    + '<div class="shophead"><div class="n">修改订单 SO-260929-018</div><div class="d">改好后点「核对修改」，确认无误再保存</div></div>'
    + '<div class="shop"><div class="side"><div class="on">• 日常花束</div><div>桌面花艺</div></div><div class="goods">'
    + good('粉玫瑰日常花束', 'CX-101', '68.00', 25) + good('白绿清新花束', 'CX-102', '78.00', 10) + '</div></div>'
    + '<div class="cart mark">' + icon('shopping-cart', 24, '#fff') + '<div class="m">¥2,480.00<small>已选 2 款 · 比原单多 ¥340.00</small></div><div class="go">核对修改</div></div>'
    + '</div>')
P6 = pair('门店改单', '原来底栏和弹层两个按钮都叫「保存修改」，要点两次', 's1-s1-shop.png', 's1-s1（改单模式没截图，样子同订货页）', edit, [
    '底栏按钮改叫<b>「核对修改」</b>：点了打开购物车弹层，列出改了哪几行（原数量 → 新数量）。',
    '弹层里的按钮才叫「保存修改」，点了真正提交。两个按钮名字不同，就不会以为点一次已经保存了。',
    '底栏小字加「比原单多 / 少 ¥xx」，改了多少一眼能看到。',
])

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>第 2 批 · 录入方式 · 对照稿</h1>
<div class="lead">左边是现在的截图（10-05 版），右边是改后草稿；黄色底的句子要你定，虚线框是改动的地方。<br>
你已定：逐行弹窗保留；不带上次价格、上次数量；采购单按供应商拆单先不做。数据用种子数据。</div>
{P1}{P2}{P3}{P4}{P5}{P6}
</body></html>"""
pathlib.Path('/tmp/hz-b2/index.html').write_text(html)
print('ok', len(html))
