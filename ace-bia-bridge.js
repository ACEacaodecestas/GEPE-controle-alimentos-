/* Integração Bia/Escritório IA GEPE com o ACE original (execução discreta e relatórios oficiais).
 * Somente relatórios e navegação autorizada. Nenhuma alteração de dados.
 * O login e as permissões continuam sendo os do próprio ACE/Supabase.
 */
(()=>{
  'use strict';
  const OFFICE='https://escritorio-ia-ace.hatchable.site';
  const RESPONSE='ace-bia-response';
  const MAX_BYTES=12*1024*1024;
  let busy=false;

  function validDate(s){
    if(!/^(19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/.test(String(s||'')))return false;
    const d=new Date(s+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
  }
  function isLoggedIn(){
    return typeof currentUser!=='undefined'&&Boolean(currentUser?.id);
  }
  function status(){
    return {
      connected:isLoggedIn(),
      generated:Boolean(document.getElementById('reportResult')?.textContent?.trim()),
      signed:typeof reportSignatureHasInk!=='undefined'&&Boolean(reportSignatureHasInk)
    };
  }
  function respond(target,id,result){
    try{target.postMessage({type:RESPONSE,id,result},OFFICE)}catch(e){console.warn('ACE: falha na resposta ao escritório.',e)}
  }
  function navigate(page){
    const allowed=new Set(['dashboard','entrada','movimentacao','presenca','estoque','relatorios','cadastros','estatisticas','inventario','inventarioSacos','sacosEstoque','sacos']);
    if(!allowed.has(page))throw new Error('Esse setor não está habilitado para navegação pela Bia.');
    const btn=[...document.querySelectorAll('[data-page]')].find(el=>el.getAttribute('data-page')===page);
    if(!btn)throw new Error('Não encontrei a tela solicitada no ACE atual.');
    btn.click();
  }
  async function prepare(params){
    if(!isLoggedIn())throw new Error('Entre na sua conta no ACE original antes de gerar o relatório.');
    const {from,to,origin}=params;
    if(!validDate(from)||!validDate(to)||from>to)throw new Error('Informe as datas exatas de início e fim, com dia, mês e ano.');
    if(typeof reloadFromSupabase==='function')await reloadFromSupabase(false);
    navigate('relatorios');
    const first=document.getElementById('reportStart');
    const last=document.getElementById('reportEnd');
    const select=document.getElementById('reportOrigin');
    if(!first||!last)throw new Error('Os campos de período do relatório oficial não foram encontrados.');
    first.value=from;last.value=to;
    first.dispatchEvent(new Event('change',{bubbles:true}));
    last.dispatchEvent(new Event('change',{bubbles:true}));
    if(select){
      const requested=String(origin||'');
      select.value=requested&&[...select.options].some(o=>o.value===requested)?requested:'';
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if(typeof renderReport!=='function')throw new Error('O gerador oficial do ACE não está disponível.');
    await renderReport();
    document.getElementById('reportResult')?.scrollIntoView({behavior:'smooth',block:'start'});
    return {generated:true,signed:false,from,to,original:true,message:'Relatório original gerado. Confira e assine no ACE.'};
  }
  async function signedExport(format,source,id){
    if(!isLoggedIn())throw new Error('Sua conta ACE precisa estar autenticada.');
    if(typeof reportSignatureHasInk==='undefined'||!reportSignatureHasInk)
      throw new Error('Assine primeiro no quadro de assinatura do relatório original.');
    if(!['pdf','word','excel'].includes(format))throw new Error('Formato de exportação inválido.');
    let blob=null,name='';
    if(format==='pdf'){
      if(typeof generateSignedReportPDF!=='function')throw new Error('Gerador PDF original indisponível.');
      await generateSignedReportPDF();
      blob=lastGeneratedReportPdfBlob;
      name=lastGeneratedReportPdfName||'relatorio_ACE_assinado.pdf';
    }else{
      if(typeof download!=='function')throw new Error('Exportador original indisponível.');
      const originalDownload=download;
      const handler=format==='word'?exportReportWord:exportReportExcel;
      if(typeof handler!=='function')throw new Error('Exportador do formato solicitado indisponível.');
      download=function(file,filename){
        if(file instanceof Blob&&/^relatorio/i.test(String(filename||''))){blob=file;name=filename}
        return originalDownload.apply(this,arguments);
      };
      try{await handler()}finally{download=originalDownload}
    }
    if(!(blob instanceof Blob)||blob.size<100)throw new Error('O ACE não confirmou a geração do arquivo. Use o botão original.');
    if(blob.size>MAX_BYTES)throw new Error('Arquivo maior que 12 MB: compartilhe diretamente pelo ACE.');
    const bytes=await blob.arrayBuffer();
    source.postMessage({type:RESPONSE,id,result:{file:{name,mime:blob.type||'application/octet-stream',buffer:bytes},signed:true,original:true}},OFFICE,[bytes]);
    return true;
  }
  window.addEventListener('message',async event=>{
    if(event.origin!==OFFICE)return;
    if(event.source!==window.parent&&event.source!==window.opener)return;
    const d=event.data||{};
    if(d.type!=='ace-bia-request'||typeof d.id!=='string'||d.id.length>65)return;
    if(!['status','navigate','report.prepare','report.export'].includes(d.command))return;
    if(busy){respond(event.source,d.id,{error:'O ACE ainda está concluindo outra solicitação.'});return}
    busy=true;
    try{
      let result=null;
      if(d.command==='status')result=status();
      if(d.command==='navigate'){
        if(!isLoggedIn())throw new Error('Entre na sua conta ACE para navegar.');
        navigate(String(d.page||''));
        result={ok:true,page:d.page};
      }
      if(d.command==='report.prepare')result=await prepare(d);
      if(d.command==='report.export'){
        await signedExport(d.format,event.source,d.id);
        return;
      }
      respond(event.source,d.id,result);
    }catch(error){
      respond(event.source,d.id,{error:String(error?.message||'Não foi possível concluir a solicitação.').slice(0,280)});
    }finally{busy=false}
  });
})();
