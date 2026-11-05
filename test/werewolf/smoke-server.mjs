// Kiểm server Ma Sói bằng 6 WebSocket thô (M-01 phần server, M-07). Chạy: npx wrangler dev --port 8787 --persist-to <thư mục ngoài dự án> rồi node test/werewolf/smoke-server.mjs
const names = ["An","Binh","Chi","Dung","Em","Phuc"];
const room = "T" + Date.now();
const mk = (name, token = "tok-" + name) => new Promise((res) => {
  const ws = new WebSocket(`ws://localhost:8787/werewolf/room/${room}`);
  const c = { name, ws, msgs: [], id: null, lobby: null, view: null };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.type==="joined") c.id=m.playerId; if (m.type==="lobby") c.lobby=m; if (m.type==="state") c.view=m.view; };
  ws.onopen = () => { ws.send(JSON.stringify({type:"join",name,token})); setTimeout(()=>res(c),300); };
});
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
const send = (c,m)=>c.ws.send(JSON.stringify(m));
const ok = (cond,msg)=>{ console.log((cond?"OK   ":"FAIL ")+msg); if(!cond) process.exitCode=1; };

const cs = []; for (const n of names) cs.push(await mk(n));
await sleep(300);
ok(cs.every(c=>c.id), "6 người đều nhận joined");
ok(cs[0].lobby.players.length===6 && cs[0].lobby.ownerId===cs[0].id, "lobby 6 người, An là chủ phòng");
const dup = await mk("an","other-token"); await sleep(200);
ok(dup.msgs.some(m=>m.type==="join_rejected"), "tên trùng đang kết nối bị từ chối");
send(cs[1],{type:"start_game"}); await sleep(200);
ok(cs[1].msgs.some(m=>m.type==="error"), "người không phải chủ không bắt đầu được");
send(cs[0],{type:"set_config",config:{roleCounts:{wolf:2,villager:1,seer:1,witch:1,guard:1},nightStepMs:5000}}); await sleep(200);
ok(cs[3].lobby.config.nightStepMs===5000, "mọi tab thấy config đổi");
send(cs[0],{type:"set_config",config:{roleCounts:{wolf:5,villager:0,seer:0,witch:1,guard:0},nightStepMs:5000}}); await sleep(200);
ok(cs[3].lobby.configError!==null, "config sai → configError");
send(cs[0],{type:"set_config",config:null}); await sleep(100);
send(cs[0],{type:"set_config",config:{roleCounts:{wolf:2,villager:1,seer:1,witch:1,guard:1},nightStepMs:5000}}); await sleep(200);
send(cs[0],{type:"start_game"}); await sleep(500);
ok(cs.every(c=>c.view), "ai cũng nhận state");
const by = (role)=>cs.find(c=>c.view.myRole===role);
const guard = by("guard"), seer = by("seer");
const roleCount = (c)=>c.view.players.filter(p=>p.role).length;
ok(cs.filter(c=>c.view.myRole==="villager"||c.view.myRole==="witch").every(c=>roleCount(c)===1), "Dân/Phù thủy chỉ thấy vai mình");
// M-07: Bảo vệ đổi 3 lần → người khác không nhận gói state
const others = cs.filter(c=>c!==guard); const before = others.map(c=>c.msgs.filter(m=>m.type==="state").length);
for (const t of [cs[0],cs[1],cs[2]]) { send(guard,{type:"action",action:{type:"GUARD_PICK",playerId:guard.id,targetId:t.id}}); await sleep(150); }
const after = others.map(c=>c.msgs.filter(m=>m.type==="state").length);
ok(JSON.stringify(before)===JSON.stringify(after), "người khác không nhận gói tin khi Bảo vệ đổi lựa chọn");
ok(guard.view.guard.target===cs[2].id, "Bảo vệ thấy lựa chọn cuối");
// giả mạo / TIME_UP
const e0 = cs[2].msgs.filter(m=>m.type==="error").length;
send(cs[2],{type:"action",action:{type:"TIME_UP",phaseSeq:1}}); send(cs[2],{type:"action",action:{type:"GUARD_PICK",playerId:guard.id,targetId:cs[2].id}}); await sleep(200);
ok(cs[2].msgs.filter(m=>m.type==="error").length===e0+2, "TIME_UP từ client và giả mạo playerId bị từ chối");
// chờ hết đêm (4 pha x 5s)
await sleep(20_500);
ok(cs.every(c=>c.view.phase.kind==="discussion"||c.view.phase.kind==="ended"), "server tự chuyển sang ngày bằng alarm: " + cs[0].view.phase.kind);
// mất kết nối + vào lại
const an = cs[0]; an.ws.close(); await sleep(300);
const again = await mk("An","tok-An"); await sleep(300);
ok(again.id===an.id && again.view && again.view.myRole===an.view.myRole, "vào lại đúng ghế/vai (view gửi lại)");
const lobbyAfterClose = cs[2].lobby; 
ok(lobbyAfterClose.inGame===true && lobbyAfterClose.players.length===6, "ván không huỷ khi mất kết nối");
const late = await mk("Late"); await sleep(300);
ok(late.lobby?.players.find(p=>p.name==="Late")?.waiting===true && !late.view, "người vào giữa ván chờ ván sau, không nhận view");
process.exit();
