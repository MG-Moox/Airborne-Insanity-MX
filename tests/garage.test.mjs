// garage upgrades must change the physics numbers and the stat bars
import { applySetup, statBars, DEFAULT_SETUP, UPGRADES } from '../src/garage.js';
import { P } from '../src/physics.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const stock = { ...DEFAULT_SETUP, up: { ...DEFAULT_SETUP.up } }; applySetup(P, stock);
const s0 = { POWER: P.POWER, M: P.M, K: P.K, B: P.BRAKE_K, V: P.VTOP }, b0 = statBars(stock);
const maxed = { ...DEFAULT_SETUP, up: { engine: 3, susp: 3, brakes: 3, weight: 3 } }; applySetup(P, maxed);
const b1 = statBars(maxed);
ok(P.POWER > s0.POWER * 1.15, `engine stage 3 raises power ${s0.POWER} -> ${P.POWER.toFixed(0)}`);
ok(P.VTOP > s0.V, `top speed ${s0.V} -> ${P.VTOP}`);
ok(P.K > s0.K, `springs ${s0.K} -> ${P.K.toFixed(0)}`);
ok(P.BRAKE_K > s0.B, `brakes ${s0.B} -> ${P.BRAKE_K}`);
ok(P.M < s0.M + 2 && P.M > s0.M - 8, `mass ${s0.M} -> ${P.M.toFixed(1)} (engine adds, weight diet removes)`);
ok(b1.every((v, i) => v[1] >= b0[i][1]) && b1.some((v, i) => v[1] > b0[i][1]), 'stat bars rise with upgrades');
console.log(fail ? 'FAILED' : 'ALL OK'); process.exit(fail ? 1 : 0);
