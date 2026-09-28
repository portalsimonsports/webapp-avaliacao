const cfg = window.APP_CONFIG || {};
const frame = document.getElementById('webappFrame');
const loading = document.getElementById('loading');

function iniciar(){
  if(!cfg.API_URL || cfg.API_URL.includes('COLE_AQUI')){
    loading.querySelector('span').textContent = 'URL do Apps Script não configurada.';
    return;
  }

  frame.addEventListener('load', () => {
    setTimeout(() => loading.classList.add('hidden'), 250);
  }, { once:true });

  frame.src = cfg.API_URL;

  setTimeout(() => {
    if(!loading.classList.contains('hidden')){
      loading.querySelector('span').textContent = 'Ainda carregando...';
    }
  }, 12000);
}

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

iniciar();
