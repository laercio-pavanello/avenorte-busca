const CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbx6SJaj9bU7yqZ7pt24wvBWP1kSPjgS5jULCYgLy6c4xK43HrbzHxZJM11RMlmYm7zO/exec',
  planilhaPublicaUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTZpGIwFTPXC-4PAnjjJSiijzTKLjv3M5xtNKnKf4ag5tGplU7kaAgSLZXo4vxE6I1nwZme74um9lQ4/pub?gid=0&single=true&output=csv',
  csvLocais: ['lista_busca_google_sheets.csv', 'lista_portas_google_sheets.csv'],
  token: ''
};

const CHAVE_DADOS = 'avenorte_pecas_v4';
const CHAVE_PENDENTES = 'avenorte_pendentes_v1';

const estado = {
  itens: [],
  pendentes: [],
  ultimoDuplicado: ''
};

const el = {
  busca: document.getElementById('campoBusca'),
  contador: document.getElementById('contador'),
  resultados: document.getElementById('resultados'),
  status: document.getElementById('statusConexao'),
  novoCodigo: document.getElementById('novoCodigo'),
  novaDescricao: document.getElementById('novaDescricao'),
  novoSetor: document.getElementById('novoSetor'),
  novaObservacao: document.getElementById('novaObservacao'),
  mensagem: document.getElementById('mensagemFormulario'),
  dialogo: document.getElementById('dialogo'),
  dialogoTitulo: document.getElementById('dialogoTitulo'),
  dialogoTexto: document.getElementById('dialogoTexto')
};

function iniciar() {
  carregarCache();
  renderizar();
  atualizarStatus();
  registrarEventos();
  registrarOffline();
  carregarOnline();
}

function registrarEventos() {
  el.busca.addEventListener('input', renderizar);
  document.getElementById('limparBusca').addEventListener('click', limparBusca);
  document.getElementById('adicionarItem').addEventListener('click', adicionarItem);
  document.getElementById('limparFormulario').addEventListener('click', limparFormulario);
  document.getElementById('dialogoFechar').addEventListener('click', () => el.dialogo.close());
  document.getElementById('dialogoBuscar').addEventListener('click', buscarDuplicado);
  window.addEventListener('online', () => {
    atualizarStatus();
    sincronizarPendentes().then(carregarOnline);
  });
  window.addEventListener('offline', atualizarStatus);
}

function registrarOffline() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

function atualizarStatus() {
  const online = navigator.onLine;
  const pendentes = estado.pendentes.length;
  el.status.textContent = online ? (pendentes ? `${pendentes} pendente(s)` : 'Online') : 'Offline';
  el.status.classList.toggle('offline', !online || pendentes > 0);
}

function carregarCache() {
  estado.itens = lerJson(CHAVE_DADOS, []);
  estado.pendentes = lerJson(CHAVE_PENDENTES, []);

  if (!estado.itens.length && Array.isArray(window.DADOS_INICIAIS)) {
    estado.itens = limparLista(window.DADOS_INICIAIS);
    salvarCache();
  }
}

function salvarCache() {
  localStorage.setItem(CHAVE_DADOS, JSON.stringify(estado.itens));
  localStorage.setItem(CHAVE_PENDENTES, JSON.stringify(estado.pendentes));
  atualizarStatus();
}

function lerJson(chave, padrao) {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? JSON.parse(texto) : padrao;
  } catch (erro) {
    return padrao;
  }
}

async function carregarOnline() {
  if (!navigator.onLine) {
    el.contador.textContent = textoContador();
    return;
  }

  try {
    const listaLocal = juntarListas(carregarDadosEmbutidos(), await carregarCsvsLocais());
    const resposta = CONFIG.appsScriptUrl
      ? await chamarAppsScript({ acao: 'listar' })
      : await carregarPelaPlanilhaPublica();

    const lista = Array.isArray(resposta.itens) ? resposta.itens : resposta;
    if (Array.isArray(lista)) {
      estado.itens = juntarListas(listaLocal, lista);
      salvarCache();
      renderizar();
    }
  } catch (erro) {
    try {
      const listaLocal = juntarListas(carregarDadosEmbutidos(), await carregarCsvsLocais());
      const listaPublica = await carregarPelaPlanilhaPublica();
      estado.itens = juntarListas(listaLocal, listaPublica);
      salvarCache();
      renderizar();
    } catch (erroPlanilha) {
      try {
        estado.itens = juntarListas(carregarDadosEmbutidos(), await carregarCsvsLocais());
        salvarCache();
        renderizar();
      } catch (erroCsv) {
        estado.itens = carregarDadosEmbutidos();
        salvarCache();
        renderizar();
      }
    }
  }
}

function carregarDadosEmbutidos() {
  return Array.isArray(window.DADOS_INICIAIS)
    ? limparLista(window.DADOS_INICIAIS)
    : [];
}

async function carregarCsvsLocais() {
  const listas = await Promise.all(CONFIG.csvLocais.map(async arquivo => {
    const resposta = await fetch(`${arquivo}?v=2`, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`Nao consegui abrir ${arquivo}.`);
    return csvParaItens(await resposta.text());
  }));

  return limparLista(listas.flat());
}

function csvParaItens(csv) {
  const linhas = separarCsv(csv);
  const cabecalho = (linhas.shift() || []).map(coluna => texto(coluna).toLowerCase());

  return linhas.map(linha => {
    const item = {};
    cabecalho.forEach((coluna, indice) => {
      item[coluna] = linha[indice] || '';
    });
    return item;
  });
}

function separarCsv(csv) {
  const linhas = [];
  let linha = [];
  let campo = '';
  let dentroAspas = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const proximo = csv[i + 1];

    if (char === '"' && dentroAspas && proximo === '"') {
      campo += '"';
      i++;
    } else if (char === '"') {
      dentroAspas = !dentroAspas;
    } else if (char === ',' && !dentroAspas) {
      linha.push(campo);
      campo = '';
    } else if ((char === '\n' || char === '\r') && !dentroAspas) {
      if (char === '\r' && proximo === '\n') i++;
      linha.push(campo);
      if (linha.some(valor => texto(valor))) linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += char;
    }
  }

  linha.push(campo);
  if (linha.some(valor => texto(valor))) linhas.push(linha);
  return linhas;
}

function juntarListas(...listas) {
  const mapa = new Map();

  listas.flat().forEach(itemOriginal => {
    const item = normalizarItem(itemOriginal);
    const chave = termo(item.codigo || `${item.descricao} ${item.setor}`);
    if (!chave) return;

    const atual = mapa.get(chave) || {};
    mapa.set(chave, {
      ...atual,
      ...item,
      descricao: item.descricao || atual.descricao || '',
      setor: item.setor || atual.setor || '',
      observacao: item.observacao || atual.observacao || '',
      termos_busca: semAcento([
        item.codigo || atual.codigo,
        item.descricao || atual.descricao,
        item.setor || atual.setor,
        item.observacao || atual.observacao,
        item.termos_busca || atual.termos_busca
      ].join(' ')).toUpperCase()
    });
  });

  return Array.from(mapa.values()).sort((a, b) => termo(a.codigo).localeCompare(termo(b.codigo)));
}

function limparLista(lista) {
  return lista
    .map(item => normalizarItem(item))
    .filter(item => item.codigo || item.descricao || item.setor || item.observacao);
}

function normalizarItem(item) {
  const codigo = texto(item.codigo);
  const descricao = texto(item.descricao);
  const setor = texto(item.setor);
  const observacao = texto(item.observacao);
  const termosBusca = semAcento([codigo, descricao, setor, observacao, texto(item.termos_busca)].join(' ')).toUpperCase();

  return {
    codigo,
    descricao,
    setor,
    observacao,
    termos_busca: termosBusca,
    linha: item.linha || item._linha || ''
  };
}

function texto(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ');
}

function semAcento(valor) {
  return texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function termo(valor) {
  return semAcento(valor).toLowerCase();
}

function buscarItens() {
  const palavras = termo(el.busca.value).split(' ').filter(Boolean);

  if (!palavras.length) {
    return [];
  }

  return estado.itens.filter(item => {
    const base = termo([item.codigo, item.descricao, item.setor, item.observacao, item.termos_busca].join(' '));
    return palavras.every(palavra => base.includes(palavra));
  });
}

function renderizar() {
  const termoBusca = texto(el.busca.value);
  const resultados = buscarItens();

  if (!termoBusca) {
    el.resultados.innerHTML = '<div class="vazio">Digite algo para buscar.</div>';
    el.contador.textContent = textoContador();
    return;
  }

  el.contador.textContent = `${resultados.length} resultado(s) para "${termoBusca}"`;

  if (!resultados.length) {
    el.resultados.innerHTML = '<div class="vazio">Nenhum item encontrado.</div>';
    return;
  }

  el.resultados.innerHTML = resultados.map((item, indice) => `
    <article class="item">
      <div>
        <div class="codigo">${escapar(item.codigo || 'SEM CODIGO')}</div>
        <div class="descricao">${escapar(item.descricao || 'Sem descricao')}</div>
        <div class="meta">
          ${item.setor ? `<span class="tag">${escapar(item.setor)}</span>` : ''}
          ${item.observacao ? `<span class="tag">${escapar(item.observacao)}</span>` : ''}
        </div>
      </div>
      <div class="item-acoes">
        <button type="button" data-copiar="${indice}">Copiar</button>
        <button type="button" class="perigo" data-excluir="${indice}">Excluir</button>
      </div>
    </article>
  `).join('');

  el.resultados.querySelectorAll('[data-copiar]').forEach(botao => {
    botao.addEventListener('click', () => copiarItem(resultados[Number(botao.dataset.copiar)]));
  });

  el.resultados.querySelectorAll('[data-excluir]').forEach(botao => {
    botao.addEventListener('click', () => excluirItem(resultados[Number(botao.dataset.excluir)]));
  });
}

function textoContador() {
  const base = estado.itens.length === 1 ? '1 item carregado' : `${estado.itens.length} itens carregados`;
  const offline = navigator.onLine ? '' : ' no celular para usar offline';
  return `${base}${offline}.`;
}

function escapar(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function limparBusca() {
  el.busca.value = '';
  renderizar();
  el.busca.focus();
}

function lerFormulario() {
  return normalizarItem({
    codigo: el.novoCodigo.value,
    descricao: el.novaDescricao.value,
    setor: el.novoSetor.value,
    observacao: el.novaObservacao.value
  });
}

function limparFormulario() {
  el.novoCodigo.value = '';
  el.novaDescricao.value = '';
  el.novoSetor.value = '';
  el.novaObservacao.value = '';
  el.mensagem.textContent = '';
  el.novoCodigo.focus();
}

function itemExistente(novoItem) {
  const codigoNovo = termo(novoItem.codigo);
  if (!codigoNovo) return null;
  return estado.itens.find(item => termo(item.codigo) === codigoNovo) || null;
}

async function adicionarItem() {
  const item = lerFormulario();

  if (!item.codigo || !item.descricao) {
    el.mensagem.textContent = 'Preencha codigo e descricao.';
    return;
  }

  const existente = itemExistente(item);
  if (existente) {
    estado.ultimoDuplicado = existente.codigo;
    mostrarDialogo('Ja existe', `O codigo "${existente.codigo}" ja esta cadastrado. Vou abrir a busca dele para conferir.`);
    return;
  }

  estado.itens.push(item);
  estado.itens.sort((a, b) => termo(a.codigo).localeCompare(termo(b.codigo)));
  salvarCache();
  el.busca.value = item.codigo;
  renderizar();
  limparFormulario();

  if (navigator.onLine) {
    try {
      const resposta = await chamarAppsScript({ acao: 'cadastrar', ...item });
      if (!resposta.ok) {
        if (resposta.codigo === 'duplicado') {
          estado.itens = estado.itens.filter(atual => termo(atual.codigo) !== termo(item.codigo));
          salvarCache();
          renderizar();
          estado.ultimoDuplicado = item.codigo;
          mostrarDialogo('Ja existe', resposta.mensagem || 'Esse codigo ja esta na planilha.');
        } else {
          throw new Error(resposta.mensagem || 'Falha ao salvar.');
        }
      } else {
        el.mensagem.textContent = 'Item salvo na planilha.';
        await carregarOnline();
      }
    } catch (erro) {
      adicionarPendente({ acao: 'cadastrar', item });
      el.mensagem.textContent = 'Sem conexao com a planilha. Ficou pendente para sincronizar.';
    }
  } else {
    adicionarPendente({ acao: 'cadastrar', item });
    el.mensagem.textContent = 'Offline. O item ficou salvo neste celular e sera enviado depois.';
  }
}

async function excluirItem(item) {
  const confirmar = window.confirm(`Excluir "${item.codigo}" da planilha?`);
  if (!confirmar) return;

  estado.itens = estado.itens.filter(atual => termo(atual.codigo) !== termo(item.codigo));
  salvarCache();
  renderizar();

  if (navigator.onLine) {
    try {
      const resposta = await chamarAppsScript({
        acao: 'deletar',
        codigo: item.codigo,
        linha: item.linha || ''
      });

      if (!resposta.ok) {
        throw new Error(resposta.mensagem || 'Falha ao deletar.');
      }

      await carregarOnline();
    } catch (erro) {
      adicionarPendente({ acao: 'deletar', item });
      mostrarDialogo('Pendente', 'Nao consegui acessar a planilha agora. A exclusao ficou pendente neste celular.');
    }
  } else {
    adicionarPendente({ acao: 'deletar', item });
    mostrarDialogo('Offline', 'A exclusao ficou pendente e sera enviada quando este celular voltar a internet.');
  }
}

function adicionarPendente(pendente) {
  estado.pendentes.push({ ...pendente, criadoEm: new Date().toISOString() });
  salvarCache();
}

async function sincronizarPendentes() {
  if (!estado.pendentes.length || !navigator.onLine) return;

  const restantes = [];

  for (const pendente of estado.pendentes) {
    try {
      if (pendente.acao === 'cadastrar') {
        const resposta = await chamarAppsScript({ acao: 'cadastrar', ...pendente.item });
        if (!resposta.ok && resposta.codigo !== 'duplicado') restantes.push(pendente);
      }

      if (pendente.acao === 'deletar') {
        const resposta = await chamarAppsScript({
          acao: 'deletar',
          codigo: pendente.item.codigo,
          linha: pendente.item.linha || ''
        });
        if (!resposta.ok && resposta.codigo !== 'nao_encontrado') restantes.push(pendente);
      }
    } catch (erro) {
      restantes.push(pendente);
    }
  }

  estado.pendentes = restantes;
  salvarCache();
}

function mostrarDialogo(titulo, textoMensagem) {
  el.dialogoTitulo.textContent = titulo;
  el.dialogoTexto.textContent = textoMensagem;

  if (typeof el.dialogo.showModal === 'function') {
    el.dialogo.showModal();
  } else {
    window.alert(`${titulo}: ${textoMensagem}`);
  }
}

function buscarDuplicado() {
  el.dialogo.close();
  el.busca.value = estado.ultimoDuplicado;
  renderizar();
  el.busca.focus();
}

function copiarItem(item) {
  const textoCopiar = [item.codigo, item.descricao, item.setor, item.observacao].filter(Boolean).join(' | ');
  copiarTexto(textoCopiar).then(() => {
    el.contador.textContent = `Copiado: ${item.codigo}`;
  });
}

function copiarTexto(valor) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(valor);
  }

  const area = document.createElement('textarea');
  area.value = valor;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

function chamarAppsScript(parametros) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.appsScriptUrl) {
      reject(new Error('Apps Script nao configurado.'));
      return;
    }

    const callback = `avenorte_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({
      ...parametros,
      token: CONFIG.token,
      callback,
      t: Date.now()
    });

    const timer = window.setTimeout(() => {
      limpar();
      reject(new Error('Tempo esgotado.'));
    }, 15000);

    function limpar() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = resposta => {
      limpar();
      resolve(resposta || { ok: false });
    };

    script.onerror = () => {
      limpar();
      reject(new Error('Falha ao acessar Apps Script.'));
    };

    script.src = `${CONFIG.appsScriptUrl}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

function carregarPelaPlanilhaPublica() {
  return new Promise((resolve, reject) => {
    if (!CONFIG.planilhaPublicaUrl) {
      reject(new Error('Planilha publica nao configurada.'));
      return;
    }

    const callback = `planilha_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const url = CONFIG.planilhaPublicaUrl.replace('output=csv', `output=gviz&tqx=out:json;responseHandler:${callback}`);
    const timer = window.setTimeout(() => {
      limpar();
      reject(new Error('Tempo esgotado.'));
    }, 15000);

    function limpar() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = resposta => {
      limpar();
      const linhas = resposta && resposta.table && Array.isArray(resposta.table.rows)
        ? resposta.table.rows
        : [];

      const itens = linhas.map(linha => {
        const c = linha.c || [];
        return {
          codigo: c[0] && c[0].v,
          descricao: c[1] && c[1].v,
          setor: c[2] && c[2].v,
          observacao: c[3] && c[3].v,
          termos_busca: c[4] && c[4].v
        };
      });

      resolve(itens);
    };

    script.onerror = () => {
      limpar();
      reject(new Error('Falha ao carregar planilha publica.'));
    };

    script.src = `${url}&t=${Date.now()}`;
    document.body.appendChild(script);
  });
}

iniciar();
