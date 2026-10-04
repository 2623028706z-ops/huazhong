// 产品示意图（线描，代替真实产品照片）
const FLOWERS={
// 粉玫瑰日常花束：粉色玫瑰 + 尤加利，牛皮纸包
rose:`<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#f1d9cf"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M42 70 L60 112 L78 70" fill="#e4cba8" stroke="#a9825a" stroke-width="1.4"/>
<path d="M48 74 L60 104 L72 74" stroke="#c4a27a" stroke-width="1"/>
<g stroke="#7c8c6a" stroke-width="1.4"><path d="M36 60 q-10 -8 -12 -20"/><ellipse cx="27" cy="44" rx="4" ry="3" fill="#b9c4a3"/><ellipse cx="31" cy="53" rx="4" ry="3" fill="#b9c4a3"/><path d="M84 58 q10 -8 14 -18"/><ellipse cx="95" cy="44" rx="4" ry="3" fill="#b9c4a3"/><ellipse cx="90" cy="53" rx="4" ry="3" fill="#b9c4a3"/></g>
<g stroke="#a8504a" stroke-width="1.3" fill="#e9a99c">
<circle cx="48" cy="52" r="11"/><circle cx="72" cy="52" r="11"/><circle cx="60" cy="40" r="12"/><circle cx="60" cy="64" r="10"/></g>
<g stroke="#a8504a" stroke-width="1.1"><path d="M44 52 q4 -6 8 0 q-4 5 -6 1"/><path d="M68 52 q4 -6 8 0 q-4 5 -6 1"/><path d="M55 40 q5 -7 10 0 q-5 6 -7 1"/><path d="M57 64 q3 -5 6 0"/></g>
</g></svg>`,
// 白绿清新花束：白玫瑰 + 绿叶
white:`<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#e3e6d6"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M44 72 L60 112 L76 72" fill="#f6f1e6" stroke="#9b9a86" stroke-width="1.4"/>
<g stroke="#5f7350" stroke-width="1.4" fill="#a9b98f"><path d="M38 66 q-14 -4 -16 -18 q12 2 16 18z"/><path d="M82 66 q14 -4 16 -18 q-12 2 -16 18z"/><path d="M60 30 q-4 -12 4 -20 q4 10 -4 20z"/></g>
<g stroke="#8d8a78" stroke-width="1.3" fill="#fbf8f0"><circle cx="49" cy="56" r="11"/><circle cx="71" cy="56" r="11"/><circle cx="60" cy="44" r="11"/></g>
<g stroke="#8d8a78" stroke-width="1.1"><path d="M45 56 q4 -6 8 0 q-4 5 -6 1"/><path d="M67 56 q4 -6 8 0 q-4 5 -6 1"/><path d="M56 44 q4 -6 8 0 q-4 5 -6 1"/></g>
</g></svg>`,
// 白绿桌花：洋桔梗，陶盆
table:`<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#eadfce"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M40 78 h40 l-5 30 h-30 z" fill="#c98d6f" stroke="#8f5a43" stroke-width="1.4"/>
<path d="M38 78 h44" stroke="#8f5a43" stroke-width="1.4"/>
<g stroke="#5f7350" stroke-width="1.3"><path d="M60 78 v-22"/><path d="M50 78 q-4 -14 -10 -20"/><path d="M70 78 q4 -14 10 -20"/><path d="M60 64 q-12 -4 -14 -12 q10 0 14 12z" fill="#a9b98f"/><path d="M62 70 q12 -4 16 -10 q-10 -2 -16 10z" fill="#a9b98f"/></g>
<g stroke="#8a7f8c" stroke-width="1.2" fill="#f4eef2"><path d="M60 56 q-9 -6 -5 -16 q5 4 5 6 q0 -2 5 -6 q4 10 -5 16z"/><path d="M40 58 q-9 -4 -7 -14 q5 3 6 5 q1 -2 6 -4 q2 10 -5 13z"/><path d="M80 58 q9 -4 7 -14 q-5 3 -6 5 q-1 -2 -6 -4 q-2 10 5 13z"/></g>
</g></svg>`};
