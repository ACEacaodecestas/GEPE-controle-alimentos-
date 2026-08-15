const KEY="controle_alimentos_v1";
const DEFAULT={
  origins:["Piedade","Água Fria"],
  reasons:["Gorbulho","Vencimento","Avaria","Outro"],
  foods:["Açúcar 1 kg","Arroz 1 kg","Café 250g","Café Almofada 250g","Charque","Farinha Mandioca 1kg","Feijão 1kg","Flocão 400G/500g","Leite 200g","Macarrão","Macarrão NINHO/LASANHA","Óleo 900ml","Proteína de Soja 400g","Sal 1kg"],
  people:[
    ["Alexandre Gonçalves Tavares","43571"],["Angelo Potrichi","43986"],["Mariella Pompeu","43983"],
    ["Stefania Márcia Câmara Monteiro","44134"],["José Airton Martins Filho","44051"],["André Settinieri","42705"]
  ].map(([name,registration])=>({id:uid(),name,registration}))
};
let db=load();
let deferredPrompt=null;

function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2)}
function isoToday(){return new Date().toISOString().slice(0,10)}
function load(){
  try{
    const raw=localStorage.getItem(KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {origins:DEFAULT.origins.map(x=>({id:uid(),name:x})),reasons:DEFAULT.reasons.map(x=>({id:uid(),name:x})),
    foods:DEFAULT.foods.map(x=>({id:uid(),name:x})),people:DEFAULT.people,entries:[],movements:[],attendance:{}};
}
function save(){localStorage.setItem(KEY,JSON.stringify(db))}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function fmt(n){return Number(n||0).toLocaleString("pt-BR",{maximumFractionDigits:2})}
function fmtDate(d){return d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):""}
function getName(arr,id){return arr.find(x=>x.id===id)?.name||"—"}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.classList.add("show");clearTimeout(window._toast);window._toast=setTimeout(()=>el.classList.remove("show"),2400)}

function populateSelect(id,arr,placeholder="Selecione..."){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=`<option value="">${placeholder}</option>`+arr.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
}
function setDates(){
  ["entryDate","movementDate","dashboardDate","attendanceDate"].forEach(id=>{const e=document.getElementById(id);if(e)e.value=isoToday()});
  document.getElementById("reportStart").value=isoToday();
  document.getElementById("reportEnd").value=isoToday();
}
function refreshSelects(){
  populateSelect("entryOrigin",db.origins);populateSelect("movementOrigin",db.origins);
  populateSelect("entryFood",db.foods);populateSelect("movementFood",db.foods);
  populateSelect("movementReason",db.reasons);
  document.getElementById("reportOrigin").innerHTML='<option value="">Todas</option>'+db.origins.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
}
function calcStock(){
  const stock={};db.origins.forEach(o=>stock[o.id]={});
  db.foods.forEach(f=>db.origins.forEach(o=>stock[o.id][f.id]=0));
  db.entries.forEach(e=>{if(stock[e.originId]&&stock[e.originId][e.foodId]!=null)stock[e.originId][e.foodId]+=Number(e.qty)});
  db.movements.forEach(m=>{if(stock[m.originId]&&stock[m.originId][m.foodId]!=null)stock[m.originId][m.foodId]-=Number(m.qty)});
  return stock;
}
function renderDashboard(){
  const date=document.getElementById("dashboardDate").value||isoToday();
  document.getElementById("todayLabel").textContent=fmtDate(date);
  const ent=db.entries.filter(x=>x.date===date).reduce((s,x)=>s+Number(x.qty),0);
  const sai=db.movements.filter(x=>x.date===date&&x.type==="saida").reduce((s,x)=>s+Number(x.qty),0);
  const per=db.movements.filter(x=>x.date===date&&x.type==="perda").reduce((s,x)=>s+Number(x.qty),0);
  const st=calcStock();const estoque=Object.values(st).reduce((a,o)=>a+Object.values(o).reduce((x,v)=>x+Number(v),0),0);
  const pres=(db.attendance[date]||[]).filter(Boolean).length;
  document.getElementById("kpiEntrada").textContent=fmt(ent);document.getElementById("kpiSaida").textContent=fmt(sai);
  document.getElementById("kpiPerda").textContent=fmt(per);document.getElementById("kpiEstoque").textContent=fmt(estoque);document.getElementById("kpiPresentes").textContent=fmt(pres);
  document.getElementById("originSummary").innerHTML=db.origins.map(o=>{
    const total=Object.values(st[o.id]||{}).reduce((a,v)=>a+Number(v),0);
    return `<div class="origin-box"><div class="origin-title"><span>📍 ${esc(o.name)}</span><span class="badge">${fmt(total)}</span></div><div class="origin-value">${fmt(total)} itens</div></div>`
  }).join("");
  const all=[...db.entries.map(x=>({...x,kind:"Entrada",sign:"+",color:"green"})),...db.movements.map(x=>({...x,kind:x.type==="perda"?"Perda":"Saída",sign:"-",color:x.type==="perda"?"red":"blue"}))].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,8);
  document.getElementById("recentMovements").innerHTML=all.length?all.map(x=>`<div class="recent-item"><b>${x.sign} ${fmt(x.qty)} — ${esc(getName(db.foods,x.foodId))}</b><small>${x.kind} • ${esc(getName(db.origins,x.originId))} • ${fmtDate(x.date)}</small></div>`).join(""):'<div class="empty">Nenhum lançamento ainda.</div>';
}
function renderEntries(){
  const date=document.getElementById("entryDate").value||isoToday();const arr=db.entries.filter(x=>x.date===date).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  document.getElementById("entryDayTotal").textContent=`Total: ${fmt(arr.reduce((s,x)=>s+Number(x.qty),0))}`;
  document.getElementById("entriesTable").innerHTML=table(arr,[
    ["Data",x=>fmtDate(x.date)],["Origem",x=>esc(getName(db.origins,x.originId))],["Alimento",x=>esc(getName(db.foods,x.foodId))],
    ["Qtd",x=>fmt(x.qty)],["Obs.",x=>esc(x.note||"")]
  ],x=>removeEntry(x.id));
}
function renderMovements(){
  const arr=db.movements.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  document.getElementById("movementsTable").innerHTML=table(arr,[
    ["Data",x=>fmtDate(x.date)],["Tipo",x=>`<span class="pill ${x.type==="perda"?"red":"blue"}">${x.type==="perda"?"Perda":"Saída"}</span>`],
    ["Origem",x=>esc(getName(db.origins,x.originId))],["Alimento",x=>esc(getName(db.foods,x.foodId))],["Qtd",x=>fmt(x.qty)],
    ["Motivo",x=>esc(getName(db.reasons,x.reasonId))],["Obs.",x=>esc(x.note||"")]
  ],x=>removeMovement(x.id));
}
function table(arr,cols,remove){
  if(!arr.length)return '<div class="empty">Nenhum registro encontrado.</div>';
  return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}<th>Ação</th></tr></thead><tbody>${arr.map(x=>`<tr>${cols.map(c=>`<td>${c[1](x)}</td>`).join("")}<td><button class="btn danger-btn" data-remove="${x.id}">Excluir</button></td></tr>`).join("")}</tbody></table></div>`;
}
function removeEntry(id){if(confirm("Excluir esta entrada?")){db.entries=db.entries.filter(x=>x.id!==id);save();renderAll();toast("Entrada excluída.")}}
function removeMovement(id){if(confirm("Excluir esta movimentação?")){db.movements=db.movements.filter(x=>x.id!==id);save();renderAll();toast("Movimentação excluída.")}}

function renderAttendance(){
  const date=document.getElementById("attendanceDate").value||isoToday(), q=(document.getElementById("attendanceSearch").value||"").toLowerCase();
  const set=new Set(db.attendance[date]||[]);const people=db.people.filter(p=>(p.name+" "+p.registration).toLowerCase().includes(q));
  document.getElementById("attendanceCount").textContent=`${set.size} presentes`;
  document.getElementById("attendanceList").innerHTML=people.length?people.map(p=>`<div class="attendance-row"><div><div class="person-name">${esc(p.name)}</div><div class="person-reg">Matrícula: ${esc(p.registration)}</div></div><label class="switch"><input type="checkbox" data-person="${p.id}" ${set.has(p.id)?"checked":""}><span class="slider"></span></label></div>`).join(""):'<div class="empty">Nenhuma pessoa cadastrada/encontrada.</div>';
  document.querySelectorAll("[data-person]").forEach(el=>el.addEventListener("change",e=>{
    const a=new Set(db.attendance[date]||[]);e.target.checked?a.add(e.target.dataset.person):a.delete(e.target.dataset.person);
    db.attendance[date]=[...a];save();renderAttendance();renderDashboard();
  }));
}

function renderStock(){
  const st=calcStock();
  document.getElementById("stockCards").innerHTML=db.origins.map(o=>{
    const total=Object.values(st[o.id]||{}).reduce((a,v)=>a+Number(v),0);
    return `<div class="panel"><h3>📍 ${esc(o.name)}</h3><div class="origin-value">${fmt(total)} itens</div></div>`
  }).join("");
  const rows=db.foods.map(f=>{
    const vals=db.origins.map(o=>Number(st[o.id]?.[f.id]||0));const total=vals.reduce((a,v)=>a+v,0);
    return `<tr><td>${esc(f.name)}</td>${vals.map(v=>`<td>${fmt(v)}</td>`).join("")}<td><b>${fmt(total)}</b></td></tr>`;
  }).join("");
  document.getElementById("stockTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Alimento</th>${db.origins.map(o=>`<th>${esc(o.name)}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderReport(){
  const start=document.getElementById("reportStart").value,end=document.getElementById("reportEnd").value,origin=document.getElementById("reportOrigin").value;
  const entries=db.entries.filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)&&(!origin||x.originId===origin));
  const mov=db.movements.filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)&&(!origin||x.originId===origin));
  const presentDates=Object.entries(db.attendance).filter(([d])=>(!start||d>=start)&&(!end||d<=end));
  const html=`<div class="cards">
    <div class="card"><span>Entradas</span><strong>${fmt(entries.reduce((s,x)=>s+Number(x.qty),0))}</strong></div>
    <div class="card"><span>Saídas</span><strong>${fmt(mov.filter(x=>x.type==="saida").reduce((s,x)=>s+Number(x.qty),0))}</strong></div>
    <div class="card danger"><span>Perdas</span><strong>${fmt(mov.filter(x=>x.type==="perda").reduce((s,x)=>s+Number(x.qty),0))}</strong></div>
    <div class="card"><span>Dias com presença</span><strong>${presentDates.length}</strong></div>
  </div>`+
  `<h3>Entradas</h3>${entries.length?table(entries,[["Data",x=>fmtDate(x.date)],["Origem",x=>esc(getName(db.origins,x.originId))],["Alimento",x=>esc(getName(db.foods,x.foodId))],["Qtd",x=>fmt(x.qty)],["Obs.",x=>esc(x.note||"")]],()=>{}):'<div class="empty">Sem entradas no período.</div>'}`+
  `<h3>Saídas e perdas</h3>${mov.length?table(mov,[["Data",x=>fmtDate(x.date)],["Tipo",x=>esc(x.type==="perda"?"Perda":"Saída")],["Origem",x=>esc(getName(db.origins,x.originId))],["Alimento",x=>esc(getName(db.foods,x.foodId))],["Qtd",x=>fmt(x.qty)],["Motivo",x=>esc(getName(db.reasons,x.reasonId))]],()=>{}):'<div class="empty">Sem movimentações no período.</div>'}`;
  document.getElementById("reportResult").innerHTML=html;
}

function renderCadastros(){
  document.getElementById("peopleTable").innerHTML=`<div class="mini-list">${db.people.map(p=>`<div class="mini-row"><span><b>${esc(p.name)}</b><br><small>${esc(p.registration)}</small></span><button class="btn danger-btn" data-del-person="${p.id}">Excluir</button></div>`).join("")||'<div class="empty">Nenhuma pessoa.</div>'}</div>`;
  document.getElementById("foodsTable").innerHTML=`<div class="mini-list">${db.foods.map(p=>`<div class="mini-row"><span>${esc(p.name)}</span><button class="btn danger-btn" data-del-food="${p.id}">Excluir</button></div>`).join("")}</div>`;
  document.getElementById("originsTable").innerHTML=`<div class="mini-list">${db.origins.map(p=>`<div class="mini-row"><span>${esc(p.name)}</span><button class="btn danger-btn" data-del-origin="${p.id}">Excluir</button></div>`).join("")}</div>`;
  document.getElementById("reasonsTable").innerHTML=`<div class="mini-list">${db.reasons.map(p=>`<div class="mini-row"><span>${esc(p.name)}</span><button class="btn danger-btn" data-del-reason="${p.id}">Excluir</button></div>`).join("")}</div>`;
  document.querySelectorAll("[data-del-person]").forEach(b=>b.onclick=()=>delBy("people",b.dataset.delPerson));
  document.querySelectorAll("[data-del-food]").forEach(b=>b.onclick=()=>delBy("foods",b.dataset.delFood));
  document.querySelectorAll("[data-del-origin]").forEach(b=>b.onclick=()=>delBy("origins",b.dataset.delOrigin));
  document.querySelectorAll("[data-del-reason]").forEach(b=>b.onclick=()=>delBy("reasons",b.dataset.delReason));
}
function delBy(key,id){
  if(!confirm("Excluir cadastro? Registros históricos que já usam este item continuarão salvos."))return;
  db[key]=db[key].filter(x=>x.id!==id);save();renderAll();toast("Cadastro excluído.");
}

function csvEscape(v){return `"${String(v??"").replace(/"/g,'""')}"`}
function exportCSV(){
  const start=document.getElementById("reportStart").value,end=document.getElementById("reportEnd").value,origin=document.getElementById("reportOrigin").value;
  const rows=[["Data","Tipo","Origem","Alimento","Quantidade","Motivo","Observação"]];
  db.entries.filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)&&(!origin||x.originId===origin)).forEach(x=>rows.push([x.date,"Entrada",getName(db.origins,x.originId),getName(db.foods,x.foodId),x.qty,"",x.note||""]));
  db.movements.filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)&&(!origin||x.originId===origin)).forEach(x=>rows.push([x.date,x.type==="perda"?"Perda":"Saída",getName(db.origins,x.originId),getName(db.foods,x.foodId),x.qty,getName(db.reasons,x.reasonId),x.note||""]));
  const blob=new Blob(["\ufeff"+rows.map(r=>r.map(csvEscape).join(";")).join("\n")],{type:"text/csv;charset=utf-8"});
  download(blob,`relatorio_${start||"inicio"}_${end||"fim"}.csv`);
}
function download(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function renderAll(){refreshSelects();renderDashboard();renderEntries();renderMovements();renderAttendance();renderStock();renderCadastros()}
function nav(){
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.getElementById(b.dataset.page).classList.add("active");
    window.scrollTo({top:0,behavior:"smooth"});
  }))
}

document.getElementById("entryForm").addEventListener("submit",e=>{
  e.preventDefault();const f=new FormData(e.target);
  db.entries.push({id:uid(),date:f.get("date"),originId:f.get("origin"),foodId:f.get("foodId"),qty:Number(f.get("qty")),note:f.get("note")||"",createdAt:new Date().toISOString()});
  save();e.target.reset();document.getElementById("entryDate").value=isoToday();renderAll();toast("Entrada registrada.")
});
document.getElementById("movementForm").addEventListener("submit",e=>{
  e.preventDefault();const f=new FormData(e.target),origin=f.get("origin"),food=f.get("foodId"),qty=Number(f.get("qty"));
  const st=calcStock();const available=Number(st[origin]?.[food]||0);
  if(qty>available){toast(`Saldo insuficiente. Disponível em ${getName(db.origins,origin)}: ${fmt(available)}.`);return}
  db.movements.push({id:uid(),date:f.get("date"),type:f.get("type"),originId:origin,foodId:food,qty,reasonId:f.get("reasonId"),note:f.get("note")||"",createdAt:new Date().toISOString()});
  save();e.target.reset();document.getElementById("movementDate").value=isoToday();renderAll();toast("Movimentação registrada.")
});

document.getElementById("dashboardDate").addEventListener("change",renderDashboard);
document.getElementById("entryDate").addEventListener("change",renderEntries);
document.getElementById("attendanceDate").addEventListener("change",renderAttendance);
document.getElementById("attendanceSearch").addEventListener("input",renderAttendance);
document.getElementById("refreshStock").addEventListener("click",()=>{renderStock();toast("Estoque atualizado.")});
document.getElementById("generateReport").addEventListener("click",renderReport);
document.getElementById("exportCSV").addEventListener("click",exportCSV);

document.getElementById("personForm").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);db.people.push({id:uid(),name:f.get("name").trim(),registration:f.get("registration").trim()});save();e.target.reset();renderAll();toast("Pessoa cadastrada.")});
document.getElementById("foodForm").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);db.foods.push({id:uid(),name:f.get("name").trim()});save();e.target.reset();renderAll();toast("Alimento cadastrado.")});
document.getElementById("originForm").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);db.origins.push({id:uid(),name:f.get("name").trim()});save();e.target.reset();renderAll();toast("Origem cadastrada.")});
document.getElementById("reasonForm").addEventListener("submit",e=>{e.preventDefault();const f=new FormData(e.target);db.reasons.push({id:uid(),name:f.get("name").trim()});save();e.target.reset();renderAll();toast("Motivo cadastrado.")});

document.getElementById("backupBtn").addEventListener("click",()=>download(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}),`backup_controle_alimentos_${isoToday()}.json`));
document.getElementById("restoreFile").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const obj=JSON.parse(await file.text());if(!obj.foods||!obj.origins||!obj.entries)throw Error("Arquivo inválido");db=obj;save();renderAll();toast("Backup restaurado.")}catch(err){alert("Não foi possível restaurar este arquivo.")}e.target.value="";
});
document.getElementById("resetBtn").addEventListener("click",()=>{
  if(!confirm("Isso apagará os dados atuais deste aparelho. Tem certeza?"))return;
  localStorage.removeItem(KEY);db=load();setDates();renderAll();toast("Dados padrão restaurados.");
});

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.getElementById("installBtn").classList.remove("hidden")});
document.getElementById("installBtn").addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt=null;document.getElementById("installBtn").classList.add("hidden")});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));

setDates();nav();renderAll();
