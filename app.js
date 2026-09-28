const cfg = window.APP_CONFIG || {};
const frame = document.getElementById('webappFrame');
const loading = document.getElementById('loading');

function ehMobile(){
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|SamsungBrowser/i.test(ua) ||
         (window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
}

function iniciar(){
  if(!cfg.API_URL || cfg.API_URL.includes('COLE_AQUI')){
    if(loading) loading.querySelector('span').textContent = 'URL do Apps Script não configurada.';
    return;
  }

  // CELULAR/TABLET: nunca embutir o Apps Script em iframe.
  // O Google redireciona o conteúdo embutido e alguns navegadores móveis
  // acabam abrindo uma tela do Drive. Abrimos o WebApp como página principal.
  if(ehMobile()){
    if(loading){
      loading.classList.remove('hidden');
      const msg = loading.querySelector('span');
      if(msg) msg.textContent = 'Abrindo versão móvel...';
    }
    window.location.replace(cfg.API_URL);
    return;
  }

  // DESKTOP: mantém o WebApp dentro do contêiner PWA.
  if(frame){
    frame.addEventListener('load', () => {
      setTimeout(() => loading && loading.classList.add('hidden'), 250);
    }, { once:true });
    frame.src = cfg.API_URL;
  }

  setTimeout(() => {
    if(loading && !loading.classList.contains('hidden')){
      const msg = loading.querySelector('span');
      if(msg) msg.textContent = 'Ainda carregando...';
    }
  }, 12000);
}

if('serviceWorker' in navigator){
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=4');
      if(reg && reg.update) reg.update();
    } catch(_) {}
  });
}

iniciar();
