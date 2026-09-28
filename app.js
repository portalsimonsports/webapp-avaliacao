const cfg = window.APP_CONFIG || {};
const frame = document.getElementById('appFrame');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');

function api(payload){
  return new Promise((resolve,reject)=>{
    if(!cfg.API_URL){ reject(new Error('Backend não configurado.')); return; }

    const requestId='wa_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const iframe=document.createElement('iframe');
    iframe.name=requestId;
    iframe.style.display='none';
    document.body.appendChild(iframe);

    const f=document.createElement('form');
    f.method='POST';
    f.action=cfg.API_URL;
    f.target=requestId;
    f.style.display='none';

    const input=document.createElement('input');
    input.type='hidden';
    input.name='payload';
    input.value=JSON.stringify({...payload,requestId});
    f.appendChild(input);
    document.body.appendChild(f);

    let done=false;
    const cleanup=()=>{
      window.removeEventListener('message',onMessage);
      try{f.remove()}catch(_){}
      setTimeout(()=>{try{iframe.remove()}catch(_){}},100);
    };
    const onMessage=(ev)=>{
      if(done) return;
      let data=ev.data;
      try{ if(typeof data==='string') data=JSON.parse(data); }catch(_){}
      if(!data || data.requestId!==requestId) return;
      done=true;
      clearTimeout(timer);
      cleanup();
      resolve(data.response||data);
    };
    window.addEventListener('message',onMessage);

    const timer=setTimeout(()=>{
      if(done) return;
      done=true;
      cleanup();
      reject(new Error('Sem resposta do backend. Verifique a implantação do Apps Script.'));
    },30000);

    f.submit();
  });
}

function criarShimGoogleScript(){
  return `
<script>
(function(){
  const pendentes = new Map();
  let seq = 0;

  function criarRunner(estado){
    estado = estado || {ok:null, fail:null, user:null};
    return new Proxy({}, {
      get(_, prop){
        if(prop === 'withSuccessHandler') return fn => criarRunner({...estado, ok:fn});
        if(prop === 'withFailureHandler') return fn => criarRunner({...estado, fail:fn});
        if(prop === 'withUserObject') return obj => criarRunner({...estado, user:obj});
        if(prop === 'then') return undefined;

        return (...args) => {
          const id = 'rpc_' + Date.now() + '_' + (++seq);
          pendentes.set(id, estado);
          window.parent.postMessage({type:'PSS_PWA_RPC', requestId:id, funcao:String(prop), args}, '*');
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = criarRunner();

  window.addEventListener('message', ev => {
    const d = ev.data;
    if(!d || d.type !== 'PSS_PWA_RPC_RESULT' || !d.requestId) return;
    const st = pendentes.get(d.requestId);
    if(!st) return;
    pendentes.delete(d.requestId);

    try{
      if(d.ok){
        if(typeof st.ok === 'function') st.ok(d.resultado, st.user);
      }else{
        const err = new Error(d.erro || 'Erro no Apps Script');
        if(typeof st.fail === 'function') st.fail(err, st.user);
        else console.error(err);
      }
    }catch(e){ console.error(e); }
  });
})();
<\/script>`;
}

function injetarShim(html){
  const shim = criarShimGoogleScript();
  if(/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>'+shim);
  return shim + html;
}

window.addEventListener('message', async ev => {
  const d = ev.data;
  if(!d || d.type !== 'PSS_PWA_RPC' || !d.requestId) return;

  try{
    const r = await api({acao:'rpc', funcao:d.funcao, args:Array.isArray(d.args)?d.args:[]});
    frame.contentWindow.postMessage({
      type:'PSS_PWA_RPC_RESULT',
      requestId:d.requestId,
      ok:!!r?.ok,
      resultado:r?.resultado,
      erro:r?.erro||''
    }, '*');
  }catch(err){
    frame.contentWindow.postMessage({
      type:'PSS_PWA_RPC_RESULT',
      requestId:d.requestId,
      ok:false,
      erro:err?.message||String(err)
    }, '*');
  }
});

async function iniciar(){
  try{
    loadingText.textContent='Carregando interface real...';
    const r = await api({acao:'frontend'});
    if(!r?.ok || !r?.html) throw new Error(r?.erro || 'HTML do sistema não retornado.');

    const html = injetarShim(r.html);
    frame.addEventListener('load', ()=>setTimeout(()=>loading.classList.add('hidden'),150), {once:true});
    frame.srcdoc = html;
  }catch(err){
    loadingText.textContent = err?.message || 'Erro ao carregar sistema.';
    loadingText.classList.add('erro');
  }
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=6').then(r=>r.update&&r.update()).catch(()=>{}));
}

iniciar();
