import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyBot, verifyBindings, verifyConfig } from './hosted-room-target.mjs';
const config={repo:'swyxio/TeslaRoadster6',pullRequest:109,sha:'a'.repeat(40),preview:'https://1234abcd-bay-drive.swyxio.workers.dev',protocol:47};
const body=`### Preview URL: https://codex-driving-continuity-throughput-bay-drive.swyxio.workers.dev (commit aaaaaaa)
<tr><td><b>Build:</b> Success <b>Deployment:</b> Success</td><td><a href="${config.preview}">preview</a></td><td>aaaaaaa</td></tr>`;
test('only a successful immutable preview tied to the current head is accepted',()=>{
  verifyConfig(config);verifyBot(body,config);
  assert.throws(()=>verifyBot(body.replace('commit aaaaaaa','commit bbbbbbb'),config));
  assert.throws(()=>verifyBot(body.replace('<td>aaaaaaa</td>','<td>bbbbbbb</td>'),config));
  assert.throws(()=>verifyBot(body.replace('Deployment:</b> Success','Deployment:</b> In progress'),config));
  assert.throws(()=>verifyConfig({...config,preview:'https://bay-drive.swyxio.workers.dev'}));
});
test('preview resource bindings fail closed on cross-Worker or unreviewed resources',()=>{
  const classes={ROOMS:'GameRoom',CHAT:'GlobalChat',DRIVERS:'DriverProfile',ECONOMIES:'RoomEconomy',INCOME:'GlobalIncome',GLOBAL_EVENTS:'GlobalEarningsEvent',MARKET:'MarketService'};
  const cfg={name:'bay-drive',main:'worker/index.ts',previews:{vars:{MAX_PLAYERS:'64'},durable_objects:{bindings:Object.entries(classes).map(([name,class_name])=>({name,class_name}))}}};
  verifyBindings(cfg);
  assert.throws(()=>verifyBindings({...cfg,previews:{...cfg.previews,d1_databases:[]}}));
  assert.throws(()=>verifyBindings({...cfg,previews:{...cfg.previews,durable_objects:{bindings:cfg.previews.durable_objects.bindings.map((item,i)=>i?item:{...item,script_name:'production'})}}}));
});
