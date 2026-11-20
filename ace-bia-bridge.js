/* ACE • Integração discreta com a Bia. Mantém o gerador original e a validação nativa da assinatura. */
(()=>{
  "use strict";
  const OFFICE="https://escritorio-ia-ace.hatchable.site";
  const MAX_BYTES=12*1024*1024;
  const allowed=new Set(["auth.status","report.prepare","report.sign","report.export","navigate"]);
  let busy=false,lastPrepared=null;
  const respond=(target,id,result)=>target.postMessage({type:"ace-bia-response",id,result},OFFICE);
  const fail=s=>{throw new Error(s)};
  const okDate=s=>{if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(s||"")))return false;const d=new Date(s+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s};
  const authorized=()=>typeof currentUser!=="undefined"&&Boolean(currentUser?.id);
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  // Usa a mesma autorização do ACE, sem pedir novo login ao usuário.
  let lastLoadedAt=0;
  const dataReady=()=>authorized()&&typeof db!=="undefined"&&Array.isArray(db?.entries)&&Array.isArray(db?.movements);
  async function ensureSession(data){
    if(!data?.access_token||!data?.refresh_token)fail("A sessão do ACE não está disponível nesta aba. Confira a conexão do escritório.");
    if(typeof supabaseClient==="undefined")fail("O mecanismo de autenticação do ACE não iniciou.");
    const {data:auth,error}=await supabaseClient.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
    if(error||!auth?.user?.id)fail("O ACE não aceitou a sessão atual. Confira se sua conta permanece autenticada no escritório.");
    const userId=String(auth.user.id);
    // Confere no próprio ACE as permissões da conta que veio do escritório.
    if(typeof loadAceOnlineAccess!=="function")fail("O controle de acesso oficial do ACE não está disponível.");
    await loadAceOnlineAccess(auth.user);
    const ok=()=>dataReady()&&String(currentUser.id)===userId;
    // O listener SIGNED_IN do ACE inicializa a base. Nunca reiniciar à força
    // enquanto o initApp está trabalhando: isso duplicava a carga e travava relatórios.
    for(let i=0;i<35;i++){
      if(ok()){lastLoadedAt=Date.now();return {connected:true,ready:true,original:true};}
      await delay(350);
    }
    if(!authorized()&&typeof currentUser!=="undefined"&&!currentUser){
      // O acesso já foi validado em ace_app_users. Recupera a inicialização
      // quando o evento SIGNED_IN não disparou (alguns navegadores móveis).
      currentUser=auth.user;
    }
    if(typeof initApp==="function"&&typeof appStarted!=="undefined"&&!appStarted){
      await initApp();
    }
    for(let i=0;i<95;i++){
      if(ok()){lastLoadedAt=Date.now();return {connected:true,ready:true,original:true};}
      await delay(350);
    }
    fail("A conta foi autorizada, mas o ACE não concluiu a sincronização dos registros para gerar o relatório. Não foi solicitado novo login.");
  }
  function navigate(page){
    const pages=new Set(["dashboard","entrada","movimentacao","presenca","estoque","relatorios","cadastros","estatisticas","inventario","inventarioSacos","sacosEstoque","sacos"]);
    if(!pages.has(page))fail("Setor desconhecido.");
    const nav=[...document.querySelectorAll("[data-page]")].find(el=>el.dataset.page===page);
    if(!nav)fail("O setor solicitado não foi encontrado nesta versão do ACE.");
    nav.click();
  }
  function reportPreview(){
    const node=document.getElementById("reportResult");
    if(!node||!node.textContent.trim())fail("O relatório original ainda não foi gerado.");
    const clone=node.cloneNode(true);
    clone.querySelectorAll("script,iframe,object,embed,form,canvas,.ace-report-signature-section").forEach(el=>el.remove());
    clone.querySelectorAll("*").forEach(el=>{for(const a of [...el.attributes]){if(/^on/i.test(a.name)||/javascript:/i.test(a.value))el.removeAttribute(a.name)}});
    const styles=[...document.querySelectorAll("style")].map(el=>el.textContent||"").join("\n").slice(0,450000);
    return {html:clone.innerHTML,styles,from:document.getElementById("reportStart")?.value||"",to:document.getElementById("reportEnd")?.value||"",complete:true};
  }
  async function prepare({from,to,origin=""}){
    if(!authorized())fail("O ACE ainda não confirmou seu acesso. Reconecte sua conta.");
    if(!okDate(from)||!okDate(to)||from>to)fail("Datas do período inválidas.");
    if(typeof reloadFromSupabase==="function")await reloadFromSupabase(false);
    navigate("relatorios");
    const first=document.getElementById("reportStart"),last=document.getElementById("reportEnd"),sel=document.getElementById("reportOrigin");
    if(!first||!last)fail("Os filtros originais de período não estão disponíveis.");
    first.value=from;last.value=to;
    first.dispatchEvent(new Event("change",{bubbles:true}));last.dispatchEvent(new Event("change",{bubbles:true}));
    if(sel){sel.value=[...sel.options].some(opt=>opt.value===String(origin))?String(origin):"";sel.dispatchEvent(new Event("change",{bubbles:true}))}
    if(typeof renderReport!=="function")fail("O gerador original do ACE não está disponível.");
    await renderReport();
    lastPrepared={from,to};
    return {generated:true,original:true,signed:false,preview:reportPreview(),from,to};
  }
  function sign({strokes}){
    if(!authorized()||!lastPrepared)fail("Gere o relatório primeiro.");
    const canvas=document.getElementById("reportSignatureCanvas");
    if(!canvas)fail("O ACE não criou o quadro de assinatura.");
    const rect=canvas.getBoundingClientRect();
    if(rect.width<80||rect.height<60)fail("O quadro de assinatura do ACE não está pronto.");
    if(!Array.isArray(strokes)||strokes.length<1||strokes.length>20)fail("Assine no quadro de assinatura.");
    const ratio=window.devicePixelRatio||1,ctx=canvas.getContext("2d");
    canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.strokeStyle="#111827";ctx.lineWidth=2.2;ctx.lineCap="round";ctx.lineJoin="round";
    const real=[];
    for(const raw of strokes){
      if(!Array.isArray(raw)||raw.length<3||raw.length>2000)fail("Assinatura inválida.");
      const points=[];
      for(const pair of raw){
        if(!Array.isArray(pair)||pair.length!==2||!pair.every(n=>Number.isFinite(n)&&n>=0&&n<=1))fail("Traços de assinatura fora do quadro.");
        points.push({x:pair[0]*rect.width,y:pair[1]*rect.height});
      }
      ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();
      real.push(points);
    }
    canvas.__aceSignatureStrokes=real;
    reportSignatureHasInk=Boolean(isAceReportSignatureValid(canvas));
    if(typeof syncAceReportExportButtons==="function")syncAceReportExportButtons();
    if(!reportSignatureHasInk){ctx.clearRect(0,0,rect.width,rect.height);canvas.__aceSignatureStrokes=[];fail("Rubrica inválida. Assine novamente com traços naturais.");}
    lastGeneratedReportPdfBlob=null;lastGeneratedReportPdfName="";
    return {signed:true,original:true,message:"Assinatura aceita pela validação nativa do ACE."};
  }
  async function exportReport({format}){
    if(!authorized()||!lastPrepared||!reportSignatureHasInk)fail("Gere e assine o relatório original antes de exportar.");
    if(!["pdf","word","excel"].includes(format))fail("Formato inválido.");
    let blob=null,name="";
    if(format==="pdf"){
      // O gerador original guarda a versão final em lastGeneratedReportPdfBlob.
      await generateSignedReportPDF();
      blob=lastGeneratedReportPdfBlob;
      name=lastGeneratedReportPdfName;
    }else{
      const previous=download;
      download=(file,filename)=>{if(file instanceof Blob){blob=file;name=filename||""}};
      try{if(format==="word")await exportReportWord();else await exportReportExcel()}finally{download=previous}
    }
    if(!(blob instanceof Blob)||blob.size<500)fail("O ACE não confirmou a geração do arquivo oficial.");
    if(blob.size>MAX_BYTES)fail("Arquivo oficial maior que 12 MB.");
    return {file:{name:name||(format==="pdf"?"relatorio_ACE.pdf":format==="word"?"relatorio_ACE.docx":"relatorio_ACE.xlsx"),mime:blob.type||"application/octet-stream",buffer:await blob.arrayBuffer()},signed:true,original:true,from:lastPrepared.from,to:lastPrepared.to};
  }
  window.addEventListener("message",async event=>{
    if(event.origin!==OFFICE||event.source!==window.parent)return;
    const d=event.data||{},id=String(d.id||"");
    if(!/^ace_[a-z0-9_]+$/i.test(id)||id.length>65)return;
    if(d.type!=="ace-bia-request"&&d.type!=="ace-bia-auth")return;
    if(d.type==="ace-bia-request"&&!allowed.has(d.command))return;
    if(busy){respond(event.source,id,{error:"A Bia ainda está concluindo a tarefa anterior."});return}
    busy=true;
    try{
      let result;
      if(d.type==="ace-bia-auth")result=await ensureSession(d.session);
      else if(d.command==="auth.status")result={connected:authorized(),ready:!!db,original:true};
      else if(d.command==="report.prepare")result=await prepare(d);
      else if(d.command==="report.sign")result=sign(d);
      else if(d.command==="report.export")result=await exportReport(d);
      else if(d.command==="navigate"){if(!authorized())fail("ACE não autorizado.");navigate(d.page);result={ok:true,page:d.page}}
      if(result?.file?.buffer)event.source.postMessage({type:"ace-bia-response",id,result},OFFICE,[result.file.buffer]);
      else respond(event.source,id,result);
    }catch(e){respond(event.source,id,{error:String(e?.message||"Falha no ACE").slice(0,260)})}
    finally{busy=false}
  });
})();
