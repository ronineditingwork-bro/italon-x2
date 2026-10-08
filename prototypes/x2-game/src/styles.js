// Стили интерфейса (внедряются один раз при монтировании).
export const CSS = `
.x2g{--ink:#f4efe6;--dim:#c9c2b3;--glass:rgba(17,19,23,.72);--line:rgba(255,255,255,.14);--x2:#f6a21a;--cyan:#6fe9ff;
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;background:#d8dfe6;color:var(--ink);
  font-family:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.x2g *{box-sizing:border-box}
.x2g canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.x2g [hidden]{display:none!important}
.x2g button{font:inherit;color:inherit;cursor:pointer}
.x2g .hud{position:absolute;inset:0;pointer-events:none;padding:max(12px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
.x2g .pill{position:absolute;display:flex;align-items:center;gap:10px;padding:8px 16px;border-radius:14px;background:var(--glass);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--line);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.x2g .brand{left:max(14px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));font-size:clamp(18px,2.6vw,30px);font-weight:700}
.x2g .brand b{color:var(--x2)}
.x2g .brand small{display:block;font-size:.5em;font-weight:500;color:var(--dim);letter-spacing:.14em;margin-top:2px}
.x2g .brand .col{display:flex;flex-direction:column}
.x2g .score{left:50%;transform:translateX(-50%);top:max(12px,env(safe-area-inset-top));font-size:clamp(16px,2.3vw,26px);font-weight:600;color:var(--dim)}
.x2g .score b{color:var(--ink);font-size:1.5em;font-weight:700;min-width:2.6em;text-align:right;display:inline-block}
.x2g .timer{right:max(14px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));font-size:clamp(18px,2.6vw,30px);font-weight:700;padding-right:8px;pointer-events:auto}
.x2g .timer button{pointer-events:auto;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.1);font-size:16px;letter-spacing:-2px}
.x2g .lives{position:absolute;left:max(14px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 78px);display:flex;gap:6px;align-items:center;font-size:12px;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;padding:6px 12px;border-radius:12px;background:var(--glass);border:1px solid var(--line)}
.x2g .lives i{width:16px;height:16px;border-radius:5px;background:var(--cyan);box-shadow:0 0 10px rgba(111,233,255,.7);transition:.2s}
.x2g .lives i.off{background:#3b4048;box-shadow:none}
.x2g .wide{position:absolute;left:50%;transform:translateX(-50%);top:calc(max(12px,env(safe-area-inset-top)) + 64px);padding:6px 16px;border-radius:12px;background:rgba(246,162,26,.92);color:#1a1405;font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:14px}
.x2g .zonebar{position:absolute;left:50%;transform:translateX(-50%);bottom:max(10px,env(safe-area-inset-bottom));width:min(760px,calc(100% - 28px));padding:8px 22px 6px;border-radius:20px;background:var(--glass);border:1px solid var(--line);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.x2g .rail{position:relative;height:6px;margin:6px 8% 8px;border-radius:3px;background:rgba(255,255,255,.18)}
.x2g .rail i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#f6a21a,#ffc766)}
.x2g .rail s{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #747a82;background:#262a30;transition:.25s}
.x2g .rail s.on{border-color:var(--x2);background:#fff4dc}
.x2g .zonelist{display:grid;grid-template-columns:repeat(4,1fr);margin:0;padding:0;list-style:none;text-align:center;font-size:clamp(11px,1.7vw,16px);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.x2g .zonelist li.on{color:var(--x2);font-weight:700}
.x2g .hint{margin:4px 0 0;text-align:center;font-size:11px;color:#a6a091;letter-spacing:.06em}
.x2g .touch{position:absolute;left:0;right:0;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 96px);display:flex;justify-content:space-between;padding:0 max(18px,env(safe-area-inset-left));pointer-events:none}
.x2g .touch button{pointer-events:auto;width:76px;height:76px;border-radius:50%;border:1px solid var(--line);background:rgba(17,19,23,.62);font-size:28px;touch-action:manipulation}
.x2g .touch .lr{display:flex;gap:14px}
.x2g .toast{position:absolute;left:50%;top:32%;transform:translate(-50%,-50%);padding:10px 26px;border-radius:16px;background:var(--glass);border:1px solid var(--line);font-size:clamp(22px,4vw,44px);font-weight:700;letter-spacing:.14em;text-transform:uppercase;pointer-events:none;opacity:0;transition:opacity .3s}
.x2g .toast.on{opacity:1}
.x2g .toast b{color:var(--x2)}
.x2g .overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,12,16,.32)}
.x2g .overlay.menu{justify-content:flex-start;background:linear-gradient(90deg,rgba(10,12,16,.72) 0%,rgba(10,12,16,.35) 55%,rgba(10,12,16,0) 100%)}
.x2g .card{width:min(520px,100%);max-height:100%;overflow:auto;padding:26px 28px 24px;border-radius:24px;background:var(--glass);border:1px solid var(--line);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.x2g .overlay.menu .card{margin-left:max(0px,3vw)}
.x2g .card h1,.x2g .card h2{margin:0 0 8px;font-size:clamp(34px,6vw,58px);line-height:1;letter-spacing:.04em;text-transform:uppercase}
.x2g .card h1 b{color:var(--x2)}
.x2g .card p{margin:0 0 12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.5;color:var(--dim)}
.x2g .card dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0 16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px}
.x2g .card dt{color:var(--ink);font-weight:600}
.x2g .card dd{margin:0;color:var(--dim)}
.x2g .btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 28px;border:0;border-radius:14px;background:var(--x2);color:#1a1405;font-weight:800;font-size:18px;letter-spacing:.1em;text-transform:uppercase}
.x2g .btn:hover{filter:brightness(1.08)}
.x2g .btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.x2g .btn:focus-visible,.x2g button:focus-visible,.x2g select:focus-visible{outline:3px solid var(--cyan);outline-offset:2px}
.x2g .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.x2g .opts{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;color:var(--dim);align-items:center}
.x2g select{background:#20242b;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font:inherit}
.x2g .stat{display:grid;grid-template-columns:1fr auto;gap:6px 18px;margin:10px 0 6px;font-size:18px;letter-spacing:.04em;text-transform:uppercase}
.x2g .stat span{color:var(--dim)} .x2g .stat b{text-align:right;font-size:1.25em}
.x2g .stat .big{grid-column:1/-1;font-size:44px;color:var(--x2);text-align:left;font-weight:800;margin:4px 0}
.x2g .ph{display:none}
.x2g .nogl{background:#1b1e24;text-align:center}
@media (max-width:640px){
  .x2g .ph{display:block}
  .x2g .pc{display:none}
  .x2g .card p{font-size:14px;margin-bottom:8px}
  .x2g .card dl{margin:8px 0 12px;font-size:13px}
  .x2g .card h1{font-size:34px}
  .x2g .pill{padding:6px 12px}
  .x2g .brand{font-size:19px}
  .x2g .timer{font-size:20px}
  .x2g .timer button{width:36px;height:36px}
  .x2g .score{left:max(14px,env(safe-area-inset-left));transform:none;top:calc(max(12px,env(safe-area-inset-top)) + 56px);font-size:15px;padding:5px 12px}
  .x2g .lives{left:auto;right:max(14px,env(safe-area-inset-right));top:calc(max(12px,env(safe-area-inset-top)) + 56px);font-size:0;padding:9px 12px;gap:7px}
  .x2g .wide{top:calc(max(12px,env(safe-area-inset-top)) + 100px);font-size:12px;padding:5px 12px;white-space:nowrap}
  .x2g .toast{top:30%;font-size:clamp(18px,5.4vw,30px);padding:8px 18px;text-align:center;max-width:92%}
  .x2g .overlay.menu{background:linear-gradient(0deg,rgba(10,12,16,.82) 0%,rgba(10,12,16,.4) 70%,rgba(10,12,16,0) 100%);align-items:flex-end}
  .x2g .overlay.menu .card{margin:0;padding:16px 16px 14px;max-height:64%}
  .x2g .touch button{width:68px;height:68px}
}
@media (prefers-reduced-motion:reduce){.x2g *{transition:none!important}}
`;
