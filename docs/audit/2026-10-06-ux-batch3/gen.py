# 第 3 批（流程接续）对照稿：发货后接送货单、批量发货结果、到货差异告诉采购、门店订单角标、门店直接申请售后、盘点直接选分类、发货列表默认待发货
import pathlib
b2 = pathlib.Path('/tmp/hz-b2/gen.py').read_text()
exec(b2.split('def pkrow')[0])
X = icon('x', 20, 'var(--ink)')
CSS += """
.trio3 { display:flex; gap:22px; } .trio3 .col { width:375px; }
.notes.below { padding-top:14px; min-width:0; }
.steps { display:flex; padding:4px 6px 0; font-size:12px; color:var(--muted); flex:none; }
.steps div { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; text-align:center; }
.steps .dot { width:12px; height:12px; border-radius:6px; border:2px solid var(--brand); background:var(--paper); }
.steps .done .dot { background:var(--brand); } .steps .done, .steps .cur { color:var(--ink); }
.steps small { font-size:11px; color:var(--muted); }
.ln { display:flex; padding:10px 0; border-top:1px solid var(--line); font-size:14px; align-items:center; }
.ln .t { flex:1; } .ln .t b { font-weight:600; font-size:15px; } .ln .t i { display:block; font-style:normal; font-size:12px; color:var(--muted); }
.ln .q { width:56px; text-align:right; color:var(--soft); }
.ln .w { color:var(--alert); }
.lh { display:flex; font-size:12px; color:var(--muted); padding-bottom:6px; } .lh span { width:56px; text-align:right; } .lh span:first-child { flex:1; width:auto; text-align:left; font:400 15px var(--serif); color:var(--ink); }
.toast2 { position:absolute; left:50%; top:40%; transform:translateX(-50%); background:#3b2a24e6; color:#fff; font-size:14px; padding:14px 22px; border-radius:10px; text-align:center; }
.res .r { display:flex; align-items:center; gap:10px; padding:12px 16px; border-top:1px solid var(--line); font-size:14px; }
.res .r .t { flex:1; } .res .r .t b { display:block; font-size:15px; } .res .r .t i { font-style:normal; font-size:12px; color:var(--muted); }
.res .r .lk { color:var(--brand); font-size:14px; display:flex; align-items:center; }
.res .fail .t i { color:var(--danger, #a3313d); }
.res .hd { padding:4px 16px 8px; font-size:13px; color:var(--muted); }
.notice { background:var(--amber-bg); color:var(--amber); border-radius:10px; padding:10px 12px; font-size:13px; line-height:20px; display:flex; gap:10px; align-items:flex-start; }
.notice .t { flex:1; } .notice b { display:block; font-size:14px; color:var(--ink); font-weight:600; }
.notice .ok { border:1px solid var(--amber); border-radius:14px; padding:2px 10px; white-space:nowrap; margin-top:2px; }
.dotnew { display:inline-block; width:8px; height:8px; border-radius:4px; background:var(--brand); margin-right:6px; vertical-align:2px; }
.tabbar .bd { position:relative; } .tabbar .bd::after { content:'1'; position:absolute; left:58%; top:-4px; min-width:16px; height:16px; border-radius:8px; background:var(--brand); color:#fff; font-size:11px; line-height:16px; }
.catrow { display:flex; align-items:center; gap:10px; padding:13px 16px; border-top:1px solid var(--line); font-size:15px; }
.catrow .t { flex:1; } .catrow i { font-style:normal; font-size:12px; color:var(--muted); }
.sheet .st .rt { position:absolute; right:16px; top:2px; font:400 13px var(--sans); color:var(--muted); display:flex; align-items:center; }
"""


def pair3(title, sub, now_file, now_cap, d1, c1, d2, c2, notes):
    now = (f'<div class="now" style="background-image:url(now/{now_file})"></div>' if now_file
           else '<div class="now" style="display:flex;align-items:center;justify-content:center;background:#f6ebdf;color:#6f5141">现在没有这一步</div>')
    lis = ''.join(f'<li>{n}</li>' for n in notes)
    return (f'<div class="pair"><h2>{title}<small>{sub}</small></h2><div class="trio3">'
            f'<div class="col"><div class="cap"><b>现在</b> · {now_cap}</div>{now}</div>'
            f'<div class="col"><div class="cap"><b>改后</b> · {c1}</div>{d1}</div>'
            f'<div class="col"><div class="cap"><b>改后</b> · {c2}</div>{d2}</div></div>'
            f'<ul class="notes below">{lis}</ul></div>')


def lines(rows, heads=('数量', '实发'), title='产品明细'):
    h = f'<div class="lh"><span>{title}</span><span>{heads[0]}</span><span>{heads[1]}</span></div>'
    return '<div class="card">' + h + ''.join(f'<div class="ln"><span class="t"><b>{a}</b><i>{b}</i></span><span class="q">{c}</span><span class="q {"w" if w else ""}">{d}</span></div>' for a, b, c, d, w in rows) + '</div>'


# ---------- 1 发货成功后 ----------
ship_done = phone(status() + nav('发货单详情') + '<div class="body">'
    + '<div class="steps"><div class="done"><span class="dot"></span>已下单<small>2026-09-28</small></div><div class="done"><span class="dot"></span>已确认</div><div class="done cur"><span class="dot"></span>已发货<small>2026-10-06 07:12</small></div></div>'
    + card('一间花房 · 湖滨店', '已发货', [('单号', 'SO-260928-012', 0), ('出货日期', '2026-09-29', 0), ('联系人', '何先生 13800138005', 1), ('发货人', '赵磊', 0)], 'done')
    + lines([('向日葵混合花束', '客户产品编码 Y-01', '15 束', '15 束', 0)])
    + '</div><div class="toast2">已发货</div>' + '<div class="mark" style="border-radius:0">' + bar(('返回列表', 0), ('送货单', 1)) + '</div>')
delivery = phone(status() + nav('送货单') + '<div class="body">'
    + '<div class="card" style="padding:18px 18px"><div style="font:400 20px var(--serif);text-align:center;margin-bottom:10px">花众 · 送货单</div>'
    + '<div class="f"><div class="w"><span class="k">客户门店</span><span class="v">一间花房 · 湖滨店</span></div><div><span class="k">单号</span><span class="v">SO-260928-012</span></div><div><span class="k">出货日期</span><span class="v">2026-09-29</span></div></div>'
    + '<div class="ln" style="margin-top:10px"><span class="t"><b>向日葵混合花束</b></span><span class="q">15 束</span></div></div>'
    + '</div>' + bar(('保存图片', 0), ('发给门店', 1)))
P1 = pair3('① 单张发货：发完留在本页，底栏换「送货单」', '现在发完自动退回列表，要发送货单得重新找这张单（多 4 步）',
    'u1-h3-ship-toship.png', 'u1-h3 发货前', ship_done, '点「确认发货」后', delivery, '点「送货单」（页面不变）', [
    '发货成功弹「已发货」，<b>不再退回列表</b>；页面原地刷新成已发货的样子，底栏换成「返回列表 / 送货单」。',
    '送货单页就是现在的 H4，不改；这里只是顺手接上。单张发货 + 发送货单从约 14 步降到约 9 步。',
])

# ---------- 2 批量发货结果 ----------
ship_list_res = phone(status() + nav('发货单') + '<div class="body">'
    + '<div class="tabs"><span>全部</span><span class="on">待发货<span class="cnt">1</span></span><span>已发货</span></div>'
    + card('晨曦花艺 · 城西店', '待发货', [('出货日期', '2026-10-06', 0), ('数量', '30 束', 0)])
    + '</div><div class="mask"><div class="sheet"><div class="st">发货结果<span class="x">' + X + '</span></div>'
    + '<div class="res"><div class="hd">已发货 2 单，1 单没发出</div>'
    + '<div class="r"><span class="t"><b>一间花房 · 湖滨店</b><i>SO-260928-012 · 已发货</i></span><span class="lk">送货单' + icon('chevron-right', 16) + '</span></div>'
    + '<div class="r"><span class="t"><b>拾光花店 · 文新店</b><i>SO-260929-016 · 已发货</i></span><span class="lk">送货单' + icon('chevron-right', 16) + '</span></div>'
    + '<div class="r fail"><span class="t"><b>晨曦花艺 · 城西店</b><i>没发出：门店已申请取消</i></span><span class="lk" style="color:var(--muted)">查看' + icon('chevron-right', 16, 'var(--muted)') + '</span></div>'
    + '</div>' + bar(('知道了', 1)) + '</div></div>')
P2 = pair3('② 批量发货：结果里直接给送货单入口', '现在只弹一行字，部分失败时连成功几单都不说',
    'u1-h2-ship-list.png', 'u1-h2', ship_list_res, '勾 3 单点「确认发货」后（示意）',
    '<div class="now" style="display:flex;align-items:center;justify-content:center;background:#fff;color:#6f5141;font-size:13px;padding:30px;line-height:1.8">点任一行「送货单」→ 进这一单的送货单（同上图 H4），返回回到这个结果弹层，可以接着发下一张</div>', '', [
    '弹层头一行写清「已发货 n 单，m 单没发出」（规格 06 H2 本来就这么写，代码只报了失败那句，顺手改对）。',
    '成功的每单一行，右边「送货单 ›」；没发出的写原因，点「查看」进这张单。',
    ASK('要你定：从送货单返回时，回到结果弹层（可以一张张发完），还是直接回列表？我建议回弹层。'),
])

# ---------- 3 到货差异告诉采购员 ----------
buy_home = phone(status() + nav('采购', False) + '<div class="body">'
    + '<div class="sec">待办</div><div class="todos">' + todo(2, '缺货花材') + '<div class="mark" style="border-radius:10px">' + todo(1, '到货有差异') + '</div></div>'
    + '<div class="sec">常用</div>' + grid([('big', 'clipboard-list', '采购需求'), ('big', 'file-text', '采购单')])
    + '<div class="sec">资料</div>' + grid([('sm', 'truck', '供应商')])
    + '</div>', wall=True)
po_diff = phone(status() + nav('采购单详情') + '<div class="body">'
    + '<div class="notice mark"><span class="t"><b>到货和下单不一样</b>尤加利 实收 110 枝（下单 120）· 单价 ¥8.00 → ¥7.50<br>收货人 陈青 · 2026-09-29 06:50</span><span class="ok">知道了</span></div>'
    + card('云岭花卉', '已收货', [('单号', 'PO-260928-004', 0), ('下单日期', '2026-09-28', 0), ('采购员', '周宁', 0), ('收货人', '陈青', 0)], 'done')
    + lines([('尤加利', 'HC-0005', '120 枝', '110 枝', 1)], ('采购', '实收'), '花材明细')
    + '</div>')
P3 = pair3('③ 收货少收、改价、退货，告诉采购员', '现在采购员完全不知道到货有差异',
    'u1-c4-po-004.png', 'u1-c4 采购单详情', buy_home, '采购首页（示意数字）', po_diff, '点进那张采购单（示意：实收 110、改价 7.50）', [
    '仓库收货时实收少于下单、改了价、或收货后退货，这张采购单就算「到货有差异」，记到采购员待办里。',
    '采购员点进去，顶上黄条写清差在哪；点「知道了」后这张单从待办里消掉（要在后台给采购单加一个「采购已看过」的记录）。',
    ASK('要你定（1）：差异要不要进采购员待办？还是只在采购单列表上打个「有差异」标记，不进待办、不用点「知道了」？'),
    ASK('要你定（2）：收货后改价、退货还是只归仓库（规格 03 章现在这么写），还是改价也开给采购员？'),
])

# ---------- 4 门店订单角标 ----------
store_after = phone(status() + '<div class="body" style="padding-top:44px">'
    + '<div class="seg"><span>订单</span><span class="on">售后<sup>1</sup></span><span>对账</span></div>'
    + '<div class="tabs"><span class="on">全部</span><span>待处理</span><span>已处理</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + '<div class="mark" style="border-radius:10px">' + card('<span class="dotnew"></span>售后 AS-260929-003', '已处理', [('原订单', 'SO-260927-026', 0), ('提交日期', '2026-09-29', 0), ('售后金额', '<span class="money">¥120.00</span>', 1)], 'done') + '</div>'
    + '</div>' + '<div class="tabbar"><div>' + icon('flower-2', 24, 'var(--muted)') + '订货</div><div class="on bd mark" style="border-radius:8px">' + icon('file-text', 24, 'var(--brand)') + '订单</div><div>' + icon('user-round', 24, 'var(--muted)') + '我的</div></div>')
P4 = pair('④ 门店：售后有结果、取消申请被处理，底栏「订单」加角标', '现在门店角标写死为 0，结果出来了门店不知道', 's1-s7-afters.png', 's1-s7', store_after, [
    '底栏「订单」上的数字 = 有结果还没看过的售后 + 取消申请被同意或拒绝还没看过的订单。',
    '「售后」「订单」段名上也带数字；没看过的那张卡标题前有一个小红点，<b>门店点开那张就消掉</b>。',
    '这要在后台记「门店看过没有」，是个新东西（现在系统没有「已读」）。种子里售后单示意。',
    ASK('要你定：用「点开就消」这种已读方式行不行？另一种不用已读：只算最近 3 天内有结果的，过了自动消失。'),
])

# ---------- 5 门店直接申请售后 ----------
store_after2 = phone(status() + '<div class="body" style="padding-top:44px">'
    + '<div class="seg"><span>订单</span><span class="on">售后</span><span>对账</span></div>'
    + '<div class="tabs"><span class="on">全部</span><span>待处理</span><span>已处理</span></div>'
    + '<div class="empty" style="padding-top:120px">暂无售后</div></div>'
    + '<div class="mark" style="border-radius:0">' + bar(('申请售后', 1)) + '</div>')
pick = phone(status() + nav('选择订单') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号</div>'
    + '<div class="cap" style="margin:0">只列能申请售后的已发货订单（发货后 n 天内）</div>'
    + card('出货 2026-09-29', '已发货', [('单号', 'SO-260929-021', 0), ('发货金额', '<span class="money">¥1,280.00</span>', 0), ('产品', '粉玫瑰日常花束 等 2 项', 1)], 'done')
    + card('出货 2026-09-27', '已发货', [('单号', 'SO-260927-026', 0), ('发货金额', '<span class="money">¥960.00</span>', 0), ('产品', '白玫瑰花束', 1)], 'done')
    + '</div>')
P5 = pair3('⑤ 门店售后段底栏放「申请售后」', '现在只有一行字教你绕回订单详情', 's1-s7-afters.png', 's1-s7', store_after2, '售后段', pick, '点「申请售后」→ 先选订单（订单示意）', [
    '选好订单后进现在的门店售后表单（不变）。门店申请售后从约 11 步降到约 7 步。',
    '选订单页复用销售那一页，只列本店、还在售后期限内的已发货订单；去掉原来那行教学文字。',
    '订单详情里的「申请售后」按钮保留，两个入口都能用。',
])

# ---------- 6 盘点直接选分类 ----------
wh_sheet = phone(status() + nav('仓库', False) + '<div class="body">'
    + '<div class="sec">常用</div>' + grid([('big', 'arrow-up-from-line', '出库'), ('big', 'trash-2', '报损'), ('big', 'clipboard-list', '盘点'), ('big', 'arrow-down-to-line', '手工入库')])
    + '</div><div class="mask"><div class="sheet"><div class="st">新建盘点<span class="x">' + X + '</span><span class="rt mark" style="border-radius:6px">盘点记录' + icon('chevron-right', 14, 'var(--muted)') + '</span></div>'
    + '<div class="catrow"><span class="chk"></span><span class="t">全部分类</span></div>'
    + ''.join(f'<div class="catrow"><span class="chk"></span><span class="t">{n}</span><i>{c} 种花材</i></div>' for n, c in (('玫瑰', 2), ('主花', 2), ('配花', 1), ('叶材', 1)))
    + bar(('开始盘点（4 类）', 1)) + '</div></div>', wall=True)
P6 = pair('⑥ 盘点：从仓库首页直接弹分类', '现在要先进盘点记录页，再点新建', 'u1-w8-stocktakes.png', 'u1-w8 盘点记录', wh_sheet, [
    '仓库首页点「盘点」直接弹出分类层（默认全选），点「开始盘点」进盘点表单，和现在新建后一样。',
    '以前的盘点记录从弹层右上角「盘点记录 ›」进。',
    '仓库首页 4 个入口格不变，只是点「盘点」的反应变了。',
])

# ---------- 7 发货列表默认待发货 ----------
ship_list = phone(status() + nav('发货单') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索客户、门店</div>'
    + '<div class="tabs mark" style="border-radius:6px"><span>全部</span><span class="on">待发货<span class="cnt">2</span></span><span>已发货</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + card('<span style="display:inline-block;width:18px;height:18px;border:1.5px solid var(--hair);border-radius:4px;margin-right:10px;vertical-align:-3px"></span>拾光花店 · 文新店', '待发货', [('单号', 'SO-260929-016', 0), ('出货日期', '2026-09-29', 0), ('数量', '20 束', 0), ('配货', '未配 0/1 种', 0)])
    + card('<span style="display:inline-block;width:18px;height:18px;border:1.5px solid var(--hair);border-radius:4px;margin-right:10px;vertical-align:-3px"></span>一间花房 · 湖滨店', '待发货', [('单号', 'SO-260928-012', 0), ('出货日期', '2026-09-29', 0), ('数量', '15 束', 0), ('配货', '未配 0/1 种', 0)])
    + '</div>' + bar(('全选', 0), ('确认发货（0）', 0)))
P7 = pair('⑦ 发货单列表默认停在「待发货」', '现在默认「全部」，已发和待发混在一起', 'u1-h2-ship-list.png', 'u1-h2', ship_list, [
    '从发货首页进来默认在「待发货」，其余（搜索、勾选、底栏）不变。',
    '卡片里「产品 20 束」改叫「数量 20 束」（是数量不是产品），卡片主次第 4 批统一改。',
])

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>第 3 批 · 流程接续 · 对照稿</h1>
<div class="lead">左边是现在的截图（10-05 版），右边是改后草稿；黄色底的句子要你定，虚线框是改动的地方。配色不换。<br>
数据用种子数据；标「示意」的是种子里没有、为了说明画的。</div>
{P1}{P2}{P3}{P4}{P5}{P6}{P7}
</body></html>"""
pathlib.Path('/tmp/hz-b3/index.html').write_text(html)
print('ok', len(html))
