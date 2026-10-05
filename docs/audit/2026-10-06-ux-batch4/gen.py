# 第 4 批（页面模板和一致性）对照稿：7 种模板、列表卡按岗位排主次、按钮禁用态、批量勾选、表单对齐、间距档位、叫法、规格矛盾
import pathlib
b3 = pathlib.Path('/tmp/hz-b3/gen.py').read_text()
exec(b3.split('def lines(')[0])
CSS += """
.tpls { display:grid; grid-template-columns: repeat(7, 1fr); gap:12px; }
.tpl { background:var(--bg); border-radius:14px; padding:10px 8px; height:330px; display:flex; flex-direction:column; gap:5px; font-size:11px; }
.tpl h4 { font:600 13px var(--serif); text-align:center; margin-bottom:4px; }
.tpl .b { border-radius:5px; padding:5px 6px; background:var(--paper); border:1px solid var(--hair); color:var(--soft); }
.tpl .b.w { background:#fffbf640; border:1px dashed var(--rule); }
.tpl .b.k { background:var(--brand); color:#fff; border:0; text-align:center; margin-top:auto; }
.tpl .b.g { flex:1; }
.tpl .b.t { background:transparent; border:0; text-align:center; color:var(--muted); }
.rc { background:var(--paper); border:1px solid var(--hair); border-radius:10px; padding:12px 14px; display:flex; gap:10px; align-items:flex-start; }
.rc .m { flex:1; min-width:0; }
.rc .m b { display:block; font:400 18px var(--serif); color:var(--ink); line-height:24px; }
.rc .m b.s { font:600 16px var(--sans); }
.rc .m i { display:block; font-style:normal; font-size:12.5px; color:var(--muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rc .r { text-align:right; flex:none; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.rc .r .money { font-size:18px; } .rc .r small { font-size:11px; color:var(--muted); }
.rc .late { color:var(--alert); }
.rc .box { width:18px; height:18px; border:1.5px solid var(--hair); border-radius:4px; flex:none; margin-top:3px; }
.rc .box.on { background:var(--brand); border-color:var(--brand); }
.grp { font-size:12px; color:var(--muted); margin:4px 0 -4px; }
.strip { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
.strip .it { width:280px; } .strip .it .cap { margin-bottom:10px; }
.bx { display:flex; gap:10px; background:var(--paper); padding:12px; border-radius:10px; }
.btn.dis-old { color:#6f665f; } .btn.dis-new { background:var(--brand); color:#fff; opacity:.4; border:0; font-weight:600; }
table.ct { border-collapse: collapse; width:100%; font-size:13.5px; margin-top:4px; }
.ct th, .ct td { padding:8px 12px; border-bottom:1px solid #eee; text-align:left; vertical-align:top; line-height:1.6; }
.ct th { background:#faf6f2; font-weight:600; }
.fm { background:var(--paper); border:1px solid var(--hair); border-radius:10px; padding:2px 16px; }
.fm .r { display:flex; align-items:center; min-height:48px; border-top:1px solid var(--line); font-size:15px; gap:10px; }
.fm .r:first-child { border-top:0; }
.fm .r .k { width:84px; color:var(--muted); font-size:14px; flex:none; }
.fm .r .v { flex:1; text-align:right; color:var(--ink); }
.fm .r .v.ph { color:#b9a79c; }
.fm .r .num { width:120px; height:34px; border:1px solid var(--hair); border-radius:6px; margin-left:auto; text-align:right; padding:0 10px; line-height:32px; }
.fb { display:flex; flex-direction:column; gap:12px; }
.fb .f2 label { display:block; font-size:12px; color:var(--muted); margin-bottom:5px; }
.fb .f2 div { height:42px; border:1px solid var(--hair); border-radius:8px; background:var(--paper); padding:0 12px; line-height:40px; font-size:15px; }
.fb .f2 div.ph { color:#b9a79c; } .fb .f2 div.ta { height:64px; }
"""

# ---------- A 7 种模板 ----------
def tpl(name, blocks):
    out = ''
    for kind, text in blocks:
        out += f'<div class="b {kind}">{text}</div>'
    return f'<div class="tpl"><h4>{name}</h4>{out}</div>'

TPL = ('<div class="tpls">'
    + tpl('模块首页', [('t', '页名（一级无返回）'), ('w', '待办小卡（只算该我动手）'), ('w', '常用 · 入口格'), ('w', '资料 · 入口格')])
    + tpl('列表', [('t', '页名'), ('', '搜索框'), ('', '页签（带数字）＋筛选'), ('g', '卡片：认单依据大字<br>次要信息一行<br>金额靠右'), ('k', '底栏：新建 / 批量')])
    + tpl('详情', [('t', '页名'), ('', '进度条'), ('', '提示条（改价、拒绝原因）'), ('', '信息卡'), ('g', '明细卡'), ('', '记录（改价、退货）'), ('k', '底栏：最多 2 个＋更多')])
    + tpl('整页表单', [('t', '新建 / 修改 xx'), ('', '基本信息卡'), ('g', '明细卡（底部＋添加）'), ('', '备注'), ('k', '底栏：保存')])
    + tpl('作业页', [('t', '订货 / 盘点 / 收货 / 发货'), ('', '对象抬头（门店、分类、采购单）'), ('g', '逐行录入（行内数量）'), ('k', '底栏：合计＋提交')])
    + tpl('往来汇总', [('t', '往来方名'), ('', '金额格：未收 / 未对账 / 多收'), ('', '页签：对账单 / 收款 / 单据'), ('g', '记录卡'), ('k', '底栏：开对账单 / 登记收款')])
    + tpl('我的', [('w', '头像、名字、岗位'), ('w', '对账卡（门店、供应商）'), ('w', '设置行'), ('t', '退出登录')])
    + '</div>')
A = ('<div class="pair"><h2>① 7 种固定页面模板<small>每页套一种，区块顺序、页名、操作位置照模板，不再各写各的</small></h2>' + TPL
    + '<ul class="notes below">'
    + '<li>现在同类页写法不一：详情页有的提示条在进度条前、有的在后；操作按钮放在 6 种位置（底栏、页底灰字、卡片里、列表头、浮动条、弹层）。</li>'
    + '<li>统一后：<b>操作只放底栏</b>（最多 2 个，其余收进「更多」）；卡片里不放按钮（你 10-03 定的）。列表头的「新建客户 / 修改客户」、花材抬头的「修改花材」、往来卡右上「修改」都挪到底栏或「更多」。</li>'
    + '<li>列表页一律有搜索框（门店订单段现在没有，规格本来就要求有）；页名一律写（门店订单、供应商采购单现在用大页签代替页名，保留大页签，不另加页名）。</li>'
    + '<li>对账单详情、门店售后表单这两页是自己手写的，改成套公共模板。</li>'
    + '</ul></div>')


def rc(main, sub, right='', box=None, sans=False):
    b = '' if box is None else f'<span class="box{" on" if box else ""}"></span>'
    return f'<div class="rc">{b}<div class="m"><b class="{"s" if sans else ""}">{main}</b><i>{sub}</i></div><div class="r">{right}</div></div>'


def tg(t, c=''):
    return f'<span class="tag {c}">{t}</span>'


# ---------- B 门店订单卡 ----------
store_orders = phone(status() + '<div class="body" style="padding-top:44px">'
    + '<div class="seg"><span class="on">订单</span><span>售后</span><span>对账</span></div>'
    + '<div class="search mark">' + icon('search', 18, 'var(--muted)') + '搜索单号、产品</div>'
    + '<div class="tabs"><span class="on">全部</span><span>待确认<span class="cnt">1</span></span><span>待发货</span><span>已发货</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + '<div class="mark" style="display:flex;flex-direction:column;gap:10px;border-radius:10px">'
    + rc('出货日期待定', '粉玫瑰日常花束 等 2 项 · SO-260929-018', tg('待确认') + '<span class="money">¥2,140.00</span>')
    + rc('出货 09-28 周日', '粉玫瑰日常花束 等 2 项 · SO-260927-021', tg('已发货', 'done') + '<span class="money">¥1,488.00</span>')
    + '</div></div>' + tabbar(['订货', '订单', '我的'], '订单'))
B = pair('② 列表卡按岗位排主次 · 门店订单', '每种卡只突出 1 个「认单依据」', 's1-s3-orders.png', 's1-s3', store_orders, [
    '门店认单看<b>出货日期</b>：放大字，抬头那行「粉玫瑰日常花束 等 2 项」每张都一样，降成小字。',
    '单号降到小字末尾；金额靠右。卡片从约 190 高降到约 80 高，一屏能看 7~8 张。',
    '加上规格要求的搜索框（搜单号、产品）。',
    '排序：待确认、待发货按出货日期从近到远在前，已发货按出货日期倒序在后。',
])

# ---------- C 发货单 + 销售订单 ----------
ship2 = phone(status() + nav('发货单') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索客户、门店</div>'
    + '<div class="tabs"><span>全部</span><span class="on">待发货<span class="cnt">2</span></span><span>已发货</span><span class="sp"></span><span class="fl">筛选' + icon('sliders-horizontal', 14, 'var(--muted)') + '</span></div>'
    + rc('一间花房 · 湖滨店', '向日葵混合花束 15 束', '<span class="late" style="font-size:13px">出货 09-29 已过</span><small>未配 0/1 种</small>', False, True)
    + rc('拾光花店 · 文新店', '粉玫瑰日常花束 20 束（产品名示意）', '<span class="late" style="font-size:13px">出货 09-29 已过</span><small>未配 0/1 种</small>', False, True)
    + '</div>' + bar(('全选', 0), ('确认发货（0）', 1)))
sales2 = phone(status() + nav('销售订单') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索单号、客户、门店</div>'
    + '<div class="tabs"><span class="on">全部</span><span>待确认<span class="cnt">1</span></span><span>待发货<span class="cnt">2</span></span><span>已发货</span></div>'
    + rc('晨曦花艺 · 滨江店', '出货日期待定 · SO-260929-018', tg('待确认') + '<span class="money">¥2,140.00</span>', False, True)
    + rc('拾光花店 · 文新店', '出货 09-29 · SO-260929-016', tg('待发货') + '<span class="money">¥1,560.00</span>', None, True)
    + rc('拾光花店 · 文新店', '出货 09-29 · SO-260928-030', tg('已发货', 'done') + '<span class="money">¥936.00</span>', None, True)
    + '</div>' + bar(('新建订单', 1)))
C = pair3('③ 发货单、销售订单', '发货看「门店 + 花了什么」，销售看「客户门店 + 金额」',
    'u1-h2-ship-list.png', 'u1-h2', ship2, '发货单', sales2, '销售订单（勾选框见第 ⑤ 组）', [
    '发货卡：大字是客户门店，小字直接写产品和数量（不再是「产品 20 束」这种字段名写错的），右边出货日期，过了标红「已过」；规格要求的「配货 n/m 种」补上。',
    '销售订单卡：大字客户门店，小字出货日期 + 单号，右边状态和金额。',
    ASK('要你看：发货、销售的认单依据这样定可以吗？（发货 = 门店 + 产品数量 + 出货日期；销售 = 客户门店 + 金额）'),
])

# ---------- D 财务客户往来 ----------
fin = phone(status() + nav('客户对账') + '<div class="body">'
    + '<div class="search">' + icon('search', 18, 'var(--muted)') + '搜索客户</div>'
    + '<div class="tabs"><span class="on">全部</span><span>有未收</span><span>有逾期</span><span>可开对账单</span></div>'
    + rc('晨曦花艺', '未结清 1 张 · 对账截止 2026-09-29', '<span class="money">¥3,588.00</span><small>未收</small>', None, True)
    + rc('拾光花店', '对账截止 2026-09-29 · 最近收款 2026-09-29', '<span class="money">¥64.00</span><small>多收</small>', None, True)
    + rc('一间花房', '还没有往来', '', None, True)
    + '</div>')
D = pair('④ 财务客户往来：金额是认单依据，欠得多的排前面', '现在欠 3,588 元的排在最后，¥0.00、「没有」「未对过账」照样占位', 'u1-f2-customers.png', 'u1-f2', fin, [
    '右边大字只放一个最要紧的数：有未收放未收，没有未收但有多收放多收，都没有就不放。',
    '零值、「没有」「未对过账」不显示；没有往来的客户只写一行「还没有往来」。',
    '排序：有逾期的在前，其次按未收金额从大到小，最后是没欠款的。供应商往来同样处理，并补上「有逾期」页签（现在比客户少这一个）。',
    '「可开对账单」页签：第 1 批首页加了这个待办，点进来直接停在这个页签。',
    ASK('要你看：排序「逾期在前 → 未收多的在前」可以吗？'),
])

# ---------- E 按钮禁用 + 批量勾选 ----------
E = ('<div class="pair"><h2>⑤ 公共组件状态统一<small>按钮禁用、批量勾选、页签数字</small></h2><div class="strip">'
    + '<div class="it"><div class="cap"><b>现在</b> · 禁用的主按钮和次按钮只差字色</div><div class="bx"><div class="btn">全选</div><div class="btn dis-old">确认发货（0）</div></div></div>'
    + '<div class="it"><div class="cap"><b>改后</b> · 禁用的主按钮保留主色、调淡</div><div class="bx"><div class="btn">全选</div><div class="btn dis-new">确认发货（0）</div></div></div>'
    + '<div class="it" style="width:560px"><div class="cap"><b>批量勾选</b> · 现在 4 套规则 → 统一成 1 套</div>'
    + '<table class="ct"><tr><th>页面</th><th>现在</th><th>改后</th></tr>'
    + '<tr><td>发货单</td><td>已发货以外都有勾选框</td><td rowspan="3">「全部」和能批量的那个页签都显示勾选框；<b>只有能操作的单子能勾</b>，其余不显示框；没勾时底栏是新建，勾了换成「全选 / 批量 xx（n）」</td></tr>'
    + '<tr><td>销售订单</td><td>只有切到「待确认」才有</td></tr>'
    + '<tr><td>采购需求</td><td>顶部一行全选</td></tr>'
    + '<tr><td>新建对账单</td><td>预先勾好、行内勾</td><td>不变（是选单据，不是批量操作）</td></tr></table></div>'
    + '</div><ul class="notes below">'
    + '<li>页签数字统一成红底白字小圆，0 不显示；财务往来页签补上数字。</li>'
    + '<li>规格 06 H2 写了「出货日期没到的不能勾」，代码没做。' + ASK('要你定：照规格做（只能批量发今天及以前的），还是去掉这条（提前发也允许批量）？') + '</li>'
    + '</ul></div>')

# ---------- F 表单对齐 ----------
form_a = phone(status() + nav('供应商详情') + '<div class="body">'
    + '<div class="fm"><div class="r"><span class="k">名称</span><span class="v">云岭花卉</span></div>'
    + '<div class="r"><span class="k">联系人</span><span class="v">杨女士</span></div>'
    + '<div class="r"><span class="k">联系电话</span><span class="v">13900139002</span></div>'
    + '<div class="r"><span class="k">地址</span><span class="v">昆明市呈贡区斗南街道 86 号</span></div>'
    + '<div class="r"><span class="k">启用</span><span style="width:44px;height:26px;border-radius:13px;background:var(--brand);margin-left:auto;position:relative;display:inline-block"><i style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:10px;background:#fff"></i></span></div></div>'
    + '<div class="fm"><div class="r"><span class="k">开通账号</span><span style="width:44px;height:26px;border-radius:13px;background:var(--brand);margin-left:auto;position:relative;display:inline-block"><i style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:10px;background:#fff"></i></span></div>'
    + '<div class="r"><span class="k">登录手机号</span><span class="v">13900139002</span></div></div>'
    + '<div class="fm"><div class="r"><span class="k" style="color:var(--ink)">采购单</span><span class="v">›</span></div><div class="r"><span class="k" style="color:var(--ink)">填报邀请</span><span class="v">›</span></div></div>'
    + '</div>' + bar(('保存供应商', 1)))
form_b = phone(status() + nav('供应商详情') + '<div class="body"><div class="card fb" style="padding:14px 16px">'
    + '<div class="f2"><label>名称</label><div>云岭花卉</div></div>'
    + '<div class="f2"><label>联系人</label><div>杨女士</div></div>'
    + '<div class="f2"><label>联系电话</label><div>13900139002</div></div>'
    + '<div class="f2"><label>地址</label><div>昆明市呈贡区斗南街道 86 号</div></div>'
    + '<div class="fm" style="border:0;padding:0"><div class="r"><span class="k">启用</span><span style="width:44px;height:26px;border-radius:13px;background:var(--brand);margin-left:auto;position:relative;display:inline-block"><i style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:10px;background:#fff"></i></span></div></div>'
    + '</div><div class="card fb" style="padding:14px 16px"><div class="fm" style="border:0;padding:0"><div class="r"><span class="k">开通账号</span><span style="width:44px;height:26px;border-radius:13px;background:var(--brand);margin-left:auto;position:relative;display:inline-block"><i style="position:absolute;right:3px;top:3px;width:20px;height:20px;border-radius:10px;background:#fff"></i></span></div></div>'
    + '<div class="f2"><label>登录手机号</label><div>13900139002</div></div></div>'
    + '</div>' + bar(('保存供应商', 1)))
F = pair3('⑥ 表单字段只留一种对齐', '现在一张表单里「文字靠右无框 + 金额小框 + 备注靠左」混着，同样字段进弹层又变全框靠左',
    'u1-c10-supplier.png', 'u1-c10 供应商详情', form_a, 'A 页面统一「字段名靠左、值靠右」，联系电话不再单独带框', form_b, 'B 页面也和弹层一样「字段名在上、整条带框」', [
    'A：行高一致、一屏放得多，像设置页；可填但空着的一律显示浅色占位字（「请填写」「选填」）；现在「联系电话」单独带框、其余无框，统一成都不带框。备注这类多行的也照这个对齐。弹层保持现在全框。',
    'B：页面和弹层完全一样，一眼看出哪里能填（审计里「供应商详情看着像只读」就是这个问题），但同样内容要多占约一半高度。',
    ASK('要你定：A 还是 B？我建议 A（规格 02 章已写「输入框亮格底 + 细描边」，选 A 要把这句改成「页面行内靠右、弹层整条带框」）。'),
])

# ---------- G 间距 + 叫法 + 规格矛盾 ----------
G = ('<div class="pair"><h2>⑦ 间距、叫法、规格矛盾<small>不用看图，看表</small></h2>'
    + '<div class="cap"><b>间距</b> · 写死的 162 处、30 种取值 → 收成 5 档：4 / 8 / 12 / 16 / 24（02 章已有的用途变量照用，值从这 5 档里取）</div>'
    + '<table class="ct"><tr><th>档</th><th>值</th><th>用在</th><th>现在写死的散值并进来</th></tr>'
    + '<tr><td>极小</td><td>4px</td><td>字段名和值、图标和字</td><td>2、3、4、5</td></tr>'
    + '<tr><td>小</td><td>8px</td><td>卡片内行间、按钮之间</td><td>6、7、8、9、10</td></tr>'
    + '<tr><td>中</td><td>12px</td><td>列表卡之间、行内上下</td><td>11、12、13、14</td></tr>'
    + '<tr><td>大</td><td>16px</td><td>页面左右、卡片内边、控件区和内容</td><td>15、16、18</td></tr>'
    + '<tr><td>特大</td><td>24px</td><td>分组之间、空状态上下</td><td>20、22、24、28</td></tr></table>'
    + '<div class="cap" style="margin-top:20px"><b>叫法统一</b></div>'
    + '<table class="ct"><tr><th>现在</th><th>统一成</th></tr>'
    + '<tr><td>「生成采购单」（需求页）/「新建采购单」（采购单页）</td><td>都叫「新建采购单」</td></tr>'
    + '<tr><td>填报邀请 7 种叫法：填报邀请、邀请供应商、填报详情、供应商填报、我的填报、填报……</td><td>员工这边一律「填报邀请」（按钮「邀请供应商」保留，是动作）；供应商那边一律「填报」' + ASK('要你看') + '</td></tr>'
    + '<tr><td>仓库收货页标题「采购单详情」（和采购员看的同名）</td><td>「收货」</td></tr>'
    + '<tr><td>发货卡「产品 20 束」</td><td>「数量 20 束」（第 3 批已改）</td></tr>'
    + '<tr><td>「待收」/「待收货」</td><td>都叫「待收货」</td></tr></table>'
    + '<div class="cap" style="margin-top:20px"><b>规格书里互相打架的地方</b></div>'
    + '<table class="ct"><tr><th>哪里</th><th>怎么打架</th><th>怎么定</th></tr>'
    + '<tr><td>仓库首页有没有「收货」格</td><td>03 章说有，06 章和代码没有</td><td>你第 1 批定了「入口格不变」→ 按没有，改 03 章</td></tr>'
    + '<tr><td>发出填报邀请后跳哪</td><td>03、06、07 三处和代码都是回采购单页「填报邀请」段，06 一处表格还写进填报详情</td><td>按多数改那一处表格</td></tr>'
    + '<tr><td>库存页「管理分类 / 新建花材」谁能用</td><td>06 同一段前后矛盾；代码对所有能进库存页的人都显示</td><td>' + ASK('要你定：只给仓库岗位，还是所有能看库存的人？') + '</td></tr>'
    + '<tr><td>实发和订单数量不同时，发货备注</td><td>06 章写必填，03 章和代码是选填</td><td>' + ASK('要你定：必填还是选填？') + '</td></tr>'
    + '<tr><td>输入框要不要边框</td><td>02 章写带框，页面里实际无框</td><td>跟第 ⑥ 组 A/B 一起定</td></tr></table>'
    + '</div>')

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<h1>第 4 批 · 页面模板和一致性 · 对照稿</h1>
<div class="lead">左边是现在的截图（10-05 版），右边是改后草稿；黄色底的要你定或要你看，虚线框是改动的地方。配色不换。<br>
这批不加新功能，只把「像但不一样」的地方统一：页面模板、卡片主次、组件状态、间距、叫法、规格书矛盾。数据用种子数据。</div>
{A}{B}{C}{D}{E}{F}{G}
</body></html>"""
pathlib.Path('/tmp/hz-b4/index.html').write_text(html)
print('ok', len(html))
