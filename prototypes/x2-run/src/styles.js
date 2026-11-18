// Стили интерфейса игры. Все классы с приставкой x2r-: игра живёт на странице сайта и не должна пересекаться с его стилями.
export const CSS = `
.x2r{--ink:#f6f1e7;--dim:#cbc3b3;--glass:rgba(17,19,24,.72);--line:rgba(255,255,255,.14);--x2:#f6a21a;--cyan:#6fe9ff;
  position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;background:#d9c9a8;color:var(--ink);
  font-family:"Bahnschrift","DIN Alternate","Roboto Condensed","Arial Narrow",system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none}
.x2r *{box-sizing:border-box}
.x2r canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
.x2r [hidden]{display:none!important}
.x2r button{font:inherit;color:inherit;cursor:pointer}
.x2r-hud{position:absolute;inset:0;pointer-events:none}
.x2r-pill{background:var(--glass);border:1px solid var(--line);border-radius:14px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:8px 14px;line-height:1.1}
.x2r-top{position:absolute;left:14px;right:14px;top:12px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.x2r-brand{font-size:21px;font-weight:800;letter-spacing:.02em}
.x2r-brand b{color:var(--x2)}
.x2r-brand small{display:block;margin-top:3px;font-size:12px;font-weight:600;letter-spacing:.14em;color:var(--dim)}
.x2r-score{font-size:15px;letter-spacing:.1em;text-align:center;color:var(--dim)}
.x2r-score b{display:inline-block;margin:0 4px;font-size:30px;color:var(--ink);letter-spacing:0;font-variant-numeric:tabular-nums}
.x2r-right{display:flex;gap:8px;align-items:stretch;pointer-events:auto}
.x2r-hearts{display:flex;align-items:center;gap:4px;font-size:22px;color:#ff5d7a;min-width:60px}
.x2r-hearts i{font-style:normal;filter:drop-shadow(0 0 6px rgba(255,93,122,.6))}
.x2r-hearts i.off{color:rgba(255,255,255,.2);filter:none}
.x2r-weapon{display:flex;align-items:center;font-size:13px;letter-spacing:.08em;color:var(--dim);min-width:100px;justify-content:center}
.x2r-weapon b{color:var(--x2);margin-left:6px}
.x2r-btnicon{width:44px;padding:0;display:grid;place-items:center;font-size:18px}
.x2r-btnicon:hover{border-color:rgba(255,255,255,.4)}
.x2r-boss{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:min(520px,60%);text-align:center}
.x2r-boss span{display:block;font-size:13px;letter-spacing:.2em;margin-bottom:6px;font-weight:700}
.x2r-boss i{display:block;height:12px;border-radius:7px;background:rgba(0,0,0,.45);border:1px solid var(--line);overflow:hidden}
.x2r-boss b{display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff4d3a,#ffb347);border-radius:7px;transition:width .15s}
.x2r-toast{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%) scale(.96);opacity:0;padding:14px 32px;font-size:clamp(22px,3.2vw,38px);font-weight:800;letter-spacing:.06em;text-align:center;transition:opacity .25s,transform .25s}
.x2r-toast.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.x2r-toast small{display:block;font-size:.4em;letter-spacing:.2em;color:var(--dim);margin-top:6px;font-weight:600}
.x2r-toast b{color:var(--x2)}
.x2r-rail{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(560px,56%);padding:9px 18px 8px;display:flex;flex-direction:column;gap:6px}
.x2r-rail .bar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.16)}
.x2r-rail .fill{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:linear-gradient(90deg,#f6a21a,#ffd27a);width:0}
.x2r-rail .dot{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;transform:translate(-50%,-50%);background:#3a3f48;border:2px solid #6a707c}
.x2r-rail .dot.on{background:var(--x2);border-color:#ffe2a0}
.x2r-rail ol{list-style:none;margin:0;padding:0;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.12em;color:var(--dim)}
.x2r-rail li.on{color:var(--x2);font-weight:700}
.x2r-touch{position:absolute;left:0;right:0;bottom:0;height:46%;pointer-events:none;z-index:4}
.x2r-touch button{pointer-events:auto;position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,.28);background:rgba(17,19,24,.45);backdrop-filter:blur(6px);color:var(--ink);font-size:26px;font-weight:800;display:grid;place-items:center;touch-action:none;-webkit-touch-callout:none}
.x2r-touch button.on{background:rgba(246,162,26,.6);border-color:#ffe2a0}
.x2r-touch .l{left:3%;bottom:16%;width:82px;height:82px}.x2r-touch .r{left:calc(3% + 98px);bottom:16%;width:82px;height:82px}
.x2r-touch .u{left:calc(3% + 49px);bottom:calc(16% + 92px);width:62px;height:62px;font-size:20px}.x2r-touch .d{left:calc(3% + 49px);bottom:calc(16% - 70px);width:0;height:0;border:0;opacity:0}
.x2r-touch .j{right:calc(3% + 100px);bottom:16%;width:90px;height:90px;font-size:15px;letter-spacing:.1em}.x2r-touch .f{right:3%;bottom:calc(16% + 24px);width:104px;height:104px;font-size:15px;letter-spacing:.1em;background:rgba(242,138,38,.4)}
.x2r-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,12,16,.4);z-index:6}
.x2r-overlay.menu{justify-content:flex-start;background:linear-gradient(90deg,rgba(10,12,16,.8) 0%,rgba(10,12,16,.4) 55%,rgba(10,12,16,0) 100%)}
.x2r-card{width:min(540px,100%);max-height:100%;overflow:auto;padding:26px 28px 22px;border-radius:22px;background:var(--glass);border:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 24px 70px rgba(0,0,0,.45)}
.x2r-overlay.menu .x2r-card{margin-left:max(0px,3vw)}
.x2r-card h1,.x2r-card h2{margin:0 0 8px;font-size:clamp(30px,4.4vw,50px);line-height:1;letter-spacing:.02em;font-weight:800}
.x2r-card h1 b{color:var(--x2)}
.x2r-card p{margin:0 0 14px;color:#e4dccb;font-size:15px;line-height:1.45}
.x2r-keys{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0 0 16px;font-size:13.5px;line-height:1.35}
.x2r-keys dt{font-weight:700;color:var(--ink)}.x2r-keys dd{margin:0;color:var(--dim)}
.x2r-keys kbd{display:inline-block;min-width:22px;padding:1px 6px;margin:0 2px;border-radius:5px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);font:inherit;font-size:12px;text-align:center;color:var(--ink)}
.x2r-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.x2r-btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 30px;border:0;border-radius:14px;background:var(--x2);color:#1a1307;font-size:16px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.x2r-btn:hover{filter:brightness(1.08)}
.x2r-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.x2r-btn:focus-visible,.x2r button:focus-visible,.x2r select:focus-visible{outline:3px solid var(--cyan);outline-offset:2px}
.x2r-opts{display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-top:14px;font-size:12.5px;color:var(--dim)}
.x2r-opts label{display:flex;align-items:center;gap:6px;cursor:pointer}
.x2r-stats{display:grid;grid-template-columns:1fr auto;gap:6px 18px;margin:12px 0 18px;font-size:14px;color:var(--dim)}
.x2r-stats b{color:var(--ink);text-align:right;font-variant-numeric:tabular-nums}
.x2r-big{font-size:clamp(26px,3.6vw,40px);font-weight:800;color:var(--x2);margin:2px 0 4px}
.x2r-rot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:7;padding:14px 20px;text-align:center;font-size:15px;letter-spacing:.06em}
@media (max-width:760px){
  .x2r-top{left:8px;right:8px;top:8px}.x2r-brand{font-size:16px}.x2r-brand small{font-size:10px}
  .x2r-score{font-size:11px;padding:6px 10px}.x2r-score b{font-size:20px}
  .x2r-weapon{display:none}.x2r-btnicon{width:38px}
  .x2r-boss{top:58px}.x2r-rail{display:none}
  .x2r-overlay.menu{align-items:flex-end;background:linear-gradient(0deg,rgba(10,12,16,.85) 0%,rgba(10,12,16,.45) 70%,rgba(10,12,16,0) 100%)}
  .x2r-overlay.menu .x2r-card{margin:0;padding:16px 16px 14px;max-height:70%}
  .x2r-card h1{font-size:30px}.x2r-card p{font-size:13px;margin-bottom:10px}.x2r-keys{font-size:12px}
}
@media (max-width:520px){
  .x2r-brand{display:none}.x2r-top{justify-content:space-between}.x2r-right [data-act="sound"]{display:none}.x2r-hearts{font-size:18px;min-width:0;padding:6px 10px}
  .x2r-touch{height:34%}.x2r-touch .l{left:3%;bottom:8%;width:68px;height:68px}.x2r-touch .r{left:calc(3% + 78px);bottom:8%;width:68px;height:68px}
  .x2r-touch .u{left:calc(3% + 39px);bottom:calc(8% + 74px);width:54px;height:54px}
  .x2r-touch .j{right:calc(3% + 98px);bottom:8%;width:74px;height:74px;font-size:12px}.x2r-touch .f{right:3%;bottom:calc(8% + 16px);width:86px;height:86px;font-size:13px}
  .x2r-toast{top:30%;font-size:22px;padding:10px 18px}.x2r-toast small{font-size:.5em}
}
@media (max-height:520px){.x2r-card{padding:14px 18px}.x2r-card p{display:none}.x2r-card h1,.x2r-card h2{font-size:28px}.x2r-keys{margin-bottom:10px}.x2r-btn{min-height:44px}.x2r-touch{height:60%}}
`;
