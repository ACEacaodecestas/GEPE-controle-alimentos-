// ============================================================
// ACE - CONTROLE DE ALIMENTOS
// V7 + SUPABASE AUTH
// ============================================================

// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL = "https://jblyzktbngvjqgvejgsa.supabase.co";

// COLE AQUI A SUA SUPABASE PUBLISHABLE KEY
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tLvr-LHX18qGGjGzkFVs6A_Alh83jMm";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


// ============================================================
// 2. BANCO LOCAL TEMPORÁRIO
// ============================================================

const KEY = "controle_alimentos_v1";

const DEFAULT = {
  origins: ["Piedade", "Água Fria"],

  reasons: [
    "Gorgulho",
    "Vencimento",
    "Avaria",
    "Outro"
  ],

  foods: [
    "Açúcar 1 kg",
    "Arroz 1 kg",
    "Café 250g",
    "Café Almofada 250g",
    "Charque",
    "Farinha Mandioca 1kg",
    "Feijão 1kg",
    "Flocão 400G/500g",
    "Leite 200g",
    "Macarrão",
    "Macarrão NINHO/LASANHA",
    "Óleo 900ml",
    "Proteína de Soja 400g",
    "Sal 1kg"
  ],

  people: [
    ["Alexandre Gonçalves Tavares", "43571"],
    ["Angelo Potrichi", "43986"],
    ["Mariella Pompeu", "43983"],
    ["Stefania Márcia Câmara Monteiro", "44134"],
    ["José Airton Martins Filho", "44051"],
    ["André Settinieri", "42705"]
  ].map(([name, registration]) => ({
    id: uid(),
    name,
    registration
  }))
};


// ============================================================
// 3. VARIÁVEIS
// ============================================================

let db = null;
let deferredPrompt = null;
let currentUser = null;
let appStarted = false;

// ============================================================
// MURAL ACE
// ============================================================

const MURAL_ACE_ADMIN_EMAIL =
  "aislantavares329@gmail.com";

let muralAcePosts = [];

const ACE_OFFLINE_DB_KEY =
  "ace_offline_snapshot_v1";

const ACE_OFFLINE_STATUS_ID =
  "aceOfflineStatus";


function saveOfflineSnapshot(snapshot) {
  try {
    localStorage.setItem(
      ACE_OFFLINE_DB_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        db: snapshot
      })
    );
  } catch (error) {
    console.warn(
      "ACE: não foi possível salvar snapshot offline:",
      error
    );
  }
}


function loadOfflineSnapshot() {
  try {
    const raw =
      localStorage.getItem(
        ACE_OFFLINE_DB_KEY
      );

    if (!raw) return null;

    const parsed =
      JSON.parse(raw);

    return parsed?.db || null;

  } catch (error) {
    console.warn(
      "ACE: não foi possível ler snapshot offline:",
      error
    );
    return null;
  }
}


function updateOfflineStatusBadge() {
  let badge =
    document.getElementById(
      ACE_OFFLINE_STATUS_ID
    );

  if (!badge) {
    badge =
      document.createElement("div");

    badge.id =
      ACE_OFFLINE_STATUS_ID;

    badge.style.cssText = `
      position:fixed;
      right:14px;
      bottom:14px;
      z-index:1000010;
      padding:8px 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:900;
      box-shadow:0 8px 24px rgba(0,0,0,.18);
      pointer-events:none;
    `;

    document.body.appendChild(badge);
  }

  if (navigator.onLine) {
    badge.textContent = "🟢 Online";
    badge.style.background = "#eaf8ef";
    badge.style.color = "#167a3d";
    badge.style.border = "1px solid #9bd4ad";
  } else {
    badge.textContent = "🟠 Offline";
    badge.style.background = "#fff6e7";
    badge.style.color = "#a15c00";
    badge.style.border = "1px solid #f1c27d";
  }
}


function setupOfflineStatus() {
  updateOfflineStatusBadge();

  window.addEventListener(
    "online",
    () => {
      updateOfflineStatusBadge();
      showAceSuccess(
        "✅ Conexão restabelecida."
      );
    }
  );

  window.addEventListener(
    "offline",
    () => {
      updateOfflineStatusBadge();
      showAceSuccess(
        "🟠 Você está offline. O app continuará usando os últimos dados sincronizados."
      );
    }
  );
}

// ============================================================
// IDENTIFICAÇÃO DOS USUÁRIOS DAS MOVIMENTAÇÕES
// ============================================================

function getCurrentDisplayName() {
  const metadataName =
    currentUser?.user_metadata?.nome ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    "";

  if (metadataName) return metadataName;

  try {
    const key = "ace_usuarios_nomes_v1";
    const raw = localStorage.getItem(key);
    const users = raw ? JSON.parse(raw) : {};

    if (currentUser?.id && users[currentUser.id]) {
      const saved = String(users[currentUser.id]).trim();
      if (saved && saved !== currentUser?.email) return saved;
    }
  } catch (error) {
    console.warn("ACE: não foi possível consultar o nome salvo:", error);
  }

  // Esta é a conta do Tavares. Se o Supabase não devolver o campo
  // user_metadata.nome, ainda assim mostramos o nome correto.
  const email = String(currentUser?.email || "").toLowerCase();
  if (email.includes("tavares")) return "Tavares";

  return currentUser?.email || "Usuário não identificado";
}

function rememberCurrentUser() {
  if (!currentUser?.id) return;

  try {
    const key = "ace_usuarios_nomes_v1";
    const raw = localStorage.getItem(key);
    const users = raw ? JSON.parse(raw) : {};

    users[currentUser.id] = getCurrentDisplayName();

    localStorage.setItem(key, JSON.stringify(users));
  } catch (error) {
    console.warn("ACE: não foi possível guardar o nome do usuário:", error);
  }
}

function getMovementUserName(item) {
  const userId = item?.usuarioId || item?.usuario_id || "";

  // 1) Se o ID pertence ao usuário logado, mostra o nome dele.
  if (userId && currentUser?.id && userId === currentUser.id) {
    return getCurrentDisplayName();
  }

  // 2) Se a movimentação já possui o nome salvo, preserva esse nome.
  if (item?.usuarioNome) {
    return item.usuarioNome;
  }

  // 3) Tenta localizar o nome pelo ID salvo localmente.
  try {
    const raw = localStorage.getItem("ace_usuarios_nomes_v1");
    const users = raw ? JSON.parse(raw) : {};

    if (userId && users[userId]) {
      return users[userId];
    }
  } catch (error) {
    console.warn("ACE: não foi possível consultar nomes locais:", error);
  }

  // 4) Registros históricos do usuário Tavares tiveram o usuario_id
  // apagado no Supabase quando a conta antiga foi excluída com SET NULL.
  // Esses lançamentos antigos devem continuar identificados como Tavares,
  // e NÃO assumir o nome do usuário atualmente logado.
  if (!userId) {
    return "Tavares";
  }

  return "Usuário não identificado";
}


// ============================================================
// 4. FUNÇÕES BÁSICAS
// ============================================================

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
}


function isoToday() {
  // Usa a data LOCAL do aparelho/navegador.
  // Não usar toISOString(), pois ele converte para UTC e, no Brasil,
  // após aproximadamente 21h pode avançar para o dia seguinte.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let numericIdCounter = 0;

function newNumericId() {
  numericIdCounter = (numericIdCounter + 1) % 1000;
  return Date.now() * 1000 + numericIdCounter;
}

function reasonsStorageKey() {
  return `controle_alimentos_motivos_${currentUser?.id || "anon"}`;
}

function loadLocalReasons() {
  const defaults = DEFAULT.reasons.map(name => ({ id: name, name }));
  try {
    const raw = localStorage.getItem(reasonsStorageKey());
    const saved = raw ? JSON.parse(raw) : [];
    const names = new Map();
    [...defaults, ...(Array.isArray(saved) ? saved : [])].forEach(r => {
      const name = String(r?.name || "").trim();
      if (name) names.set(name.toLowerCase(), { id: name, name });
    });
    return [...names.values()];
  } catch (e) {
    console.warn("Não foi possível carregar os motivos locais:", e);
    return defaults;
  }
}

function saveLocalReasons() {
  try {
    localStorage.setItem(reasonsStorageKey(), JSON.stringify(db?.reasons || []));
  } catch (e) {
    console.warn("Não foi possível salvar os motivos locais:", e);
  }
}


async function loadFromSupabase(allowJwtRefresh = true) {

  if (!currentUser?.id) {
    throw new Error("Usuário não autenticado.");
  }

  rememberCurrentUser();

  // ==========================================================
  // CARREGA OS DADOS DO SUPABASE
  // ==========================================================

  const [
    peopleResult,
    foodsResult,
    originsResult,
    entriesResult,
    outputsResult,
    lossesResult,
    attendanceResult,
    basketsResult,
    basketItemsResult,
    basketOutputsResult,
    historyResult
  ] = await Promise.all([

    supabaseClient
      .from("Pessoas")
      .select("*")
      .or("ativo.eq.true,ativo.is.null")
      .order("nome"),

    supabaseClient
      .from("Alimentos")
      .select("*")
      .order("nome"),

    supabaseClient
      .from("origens")
      .select("*")
      .order("nome"),

    supabaseClient
      .from("entradas")
      .select("*")
      .order("data_entrada", {
        ascending: false
      }),

    supabaseClient
      .from("saídas")
      .select("*")
      .order("data_saida", {
        ascending: false
      }),

    supabaseClient
      .from("perdas")
      .select("*")
      .order("data_perda", {
        ascending: false
      }),

    supabaseClient
      .from("presença")
      .select("*")
      .order("data", {
        ascending: false
      }),

    supabaseClient
      .from("cestas")
      .select("*")
      .eq("ativo", true)
      .order("id"),

    supabaseClient
      .from("cestas_itens")
      .select("*")
      .order("cesta_id"),

    supabaseClient
      .from("cestas_saidas")
      .select("*")
      .order("data_saida", {
        ascending: false
      }),

    supabaseClient
      .from("historico_movimentacoes")
      .select("*")
      .order("created_at", {
        ascending: false
      })

  ]);


  // ==========================================================
  // VERIFICA ERROS
  // ==========================================================

  const failed = [
    ["Pessoas", peopleResult],
    ["Alimentos", foodsResult],
    ["origens", originsResult],
    ["entradas", entriesResult],
    ["saídas", outputsResult],
    ["perdas", lossesResult],
    ["presença", attendanceResult],
    ["cestas", basketsResult],
    ["cestas_itens", basketItemsResult],
    ["cestas_saidas", basketOutputsResult],
    ["historico_movimentacoes", historyResult]
  ].find(([, result]) => result.error);


  if (failed) {

    const err = failed[1].error;

    const message =
      err?.message ||
      "erro desconhecido";


    // --------------------------------------------------------
    // CORREÇÃO DO ERRO:
    // "JWT issued at future"
    //
    // O token antigo fica inválido quando o relógio/token
    // fica adiantado. Limpamos SOMENTE a sessão local.
    //
    // IMPORTANTE:
    // NÃO apagamos entradas, perdas, saídas, estoque,
    // pessoas ou qualquer dado do Supabase.
    // --------------------------------------------------------

    if (
      message
        .toLowerCase()
        .includes("jwt issued at future")
    ) {

      console.warn(
        "ACE: JWT emitido no futuro. Tentando renovar a sessão."
      );


      // ------------------------------------------------------
      // PRIMEIRA TENTATIVA:
      // renovar o token sem apagar nenhum dado do sistema.
      // ------------------------------------------------------

      if (allowJwtRefresh) {

        try {

          const {
            data: refreshData,
            error: refreshError
          } =
            await supabaseClient.auth.refreshSession();


          if (
            !refreshError &&
            refreshData?.session?.user
          ) {

            currentUser =
              refreshData.session.user;

            rememberCurrentUser();


            console.log(
              "ACE: sessão renovada. Recarregando dados."
            );


            // Recarrega somente uma vez para evitar loop.
            return await loadFromSupabase(
              false
            );

          }

        } catch (refreshError) {

          console.warn(
            "ACE: falha ao renovar JWT:",
            refreshError
          );

        }

      }


      // ------------------------------------------------------
      // SEGUNDA TENTATIVA:
      // se o token continuar inválido, limpa SOMENTE a
      // sessão local. Nenhum dado do Supabase é apagado.
      // ------------------------------------------------------

      try {

        await supabaseClient.auth.signOut({
          scope: "local"
        });

      } catch (signOutError) {

        console.warn(
          "ACE: não foi possível limpar a sessão local:",
          signOutError
        );

      }


      currentUser = null;


      throw new Error(
        "Sua sessão estava com um token inválido (JWT emitido no futuro). " +
        "A sessão local foi reiniciada. Entre novamente."
      );

    }


    throw new Error(
      `Falha ao carregar a tabela ${failed[0]}: ${message}`
    );

  }


  // ==========================================================
  // CONVERTE OS DADOS DO SUPABASE PARA A ESTRUTURA DO APP
  // ==========================================================

  const people =
    peopleResult.data || [];

  const foods =
    foodsResult.data || [];

  const origins =
    originsResult.data || [];

  const entries =
    entriesResult.data || [];

  const outputs =
    outputsResult.data || [];

  const losses =
    lossesResult.data || [];

  const attendanceRows =
    attendanceResult.data || [];

  const baskets =
    basketsResult.data || [];

  const basketItems =
    basketItemsResult.data || [];

  const basketOutputs =
    basketOutputsResult.data || [];

  const historyRows =
    historyResult.data || [];

  const reasons =
    loadLocalReasons();


  const dbSupabase = {

    people:
      people.map(p => ({
        id: Number(p.id),
        name: p.nome,
        registration:
          p["matrícula"] ??
          p.matricula ??
          "",
        ede: p.ede || "",
        studyDay: p.dia_estudo || "",
        studyTime: p.horario || "",
        sede: p.sede || ""
      })),


    foods:
      foods.map(f => ({
        id: Number(f.id),
        name: f.nome
      })),


    origins:
      origins.map(o => ({
        id: Number(o.id),
        name: o.nome
      })),


    entries:
      entries.map(e => ({
        id: Number(e.id),
        date: e.data_entrada,
        foodId: Number(e.alimento_id),
        qty: Number(e.quantidade || 0),
        originId: Number(e.origem_id),
        usuarioId: e.usuario_id || null,
        usuarioNome: e.usuario_nome || e.usuarioNome || null,
        note:
          e.observacao ||
          e.obs ||
          "",
        createdAt:
          e.created_at ||
          `${e.data_entrada || isoToday()}T00:00:00Z`
      })),


    movements: [

      ...outputs.map(s => ({
        id: `saida-${s.id}`,
        rawId: Number(s.id),
        sourceTable: "saídas",
        date: s.data_saida,
        type: "saida",
        foodId: Number(s.alimento_id),
        qty: Number(s.quantidade || 0),
        originId: Number(s.origem_id),
        usuarioId: s.usuario_id || null,
        usuarioNome: s.usuario_nome || s.usuarioNome || null,
        reasonId:
          reasons.find(
            r =>
              r.name
                .toLowerCase() ===
              String(
                s.motivo || ""
              ).toLowerCase()
          )?.id ||
          s.motivo ||
          null,
        note:
          s.observacao ||
          s.destino ||
          "",
        createdAt:
          s.created_at ||
          `${s.data_saida || isoToday()}T00:00:00Z`
      })),

      ...losses.map(p => ({
        id: `perda-${p.id}`,
        rawId: Number(p.id),
        sourceTable: "perdas",
        date: p.data_perda,
        type: "perda",
        foodId: Number(p.alimento_id),
        qty: Number(p.quantidade || 0),
        originId: Number(p.origem_id),
        usuarioId: p.usuario_id || null,
        usuarioNome: p.usuario_nome || p.usuarioNome || null,
        reasonId:
          reasons.find(
            r =>
              r.name
                .toLowerCase() ===
              String(
                p.motivo || ""
              ).toLowerCase()
          )?.id ||
          p.motivo ||
          null,
        note:
          p.observacao ||
          p.obs ||
          "",
        createdAt:
          p.created_at ||
          `${p.data_perda || isoToday()}T00:00:00Z`
      }))

    ],


    attendance: {},

    // ========================================================
    // CESTAS
    // ========================================================

    baskets:
      baskets.map(c => ({
        id: Number(c.id),
        name: c.nome,
        image: c.imagem || "",
        active: c.ativo !== false
      })),

    basketItems:
      basketItems.map(ci => ({
        id: Number(ci.id),
        basketId: Number(ci.cesta_id),
        foodId: Number(ci.alimento_id),
        qty: Number(ci.quantidade || 0)
      })),

    basketOutputs:
      basketOutputs.map(cs => ({
        id: Number(cs.id),
        basketId:
          cs.cesta_id != null
            ? Number(cs.cesta_id)
            : null,
        basketName: cs.cesta_nome || "",
        basketImage: cs.cesta_imagem || "",
        basketQty: Number(cs.quantidade_cestas || 0),
        originId:
          cs.origem_id != null
            ? Number(cs.origem_id)
            : null,
        destination: cs.destino || "",
        receivedBy: cs.recebido_por || "",
        date: cs.data_saida,
        usuarioId: cs.usuario_id || null,
        composition:
          cs.composicao || [],
        createdAt:
          cs.created_at ||
          `${cs.data_saida || isoToday()}T00:00:00Z`
      })),

    history:
      historyRows.map(h => ({
        id: Number(h.id),
        date: h.data,
        type: h.tipo || "",
        originId:
          h.origem_id != null
            ? Number(h.origem_id)
            : null,
        foodId:
          h.alimento_id != null
            ? Number(h.alimento_id)
            : null,
        qty: Number(h.quantidade || 0),
        reason: h.motivo || "—",
        basketType: h.tipo_cesta || "—",
        note: h.observacao || "",
        usuarioId: h.usuario_id || null,
        createdAt:
          h.created_at ||
          `${h.data || isoToday()}T00:00:00Z`
      })),

    reasons

  };


  attendanceRows.forEach(row => {

    if (
      !dbSupabase.attendance[row.data]
    ) {

      dbSupabase.attendance[row.data] =
        [];

    }


    if (
      row.present &&
      row.pessoa_id != null
    ) {

      const id =
        Number(row.pessoa_id);


      if (
        !dbSupabase
          .attendance[row.data]
          .includes(id)
      ) {

        dbSupabase
          .attendance[row.data]
          .push(id);

      }

    }

  });


  return dbSupabase;

}


function save() {
  // Compatibilidade com a estrutura antiga.
  // O banco oficial agora é o Supabase; não usamos localStorage para dados.
  return true;
}


async function reloadFromSupabase(showToast = false) {

  if (!navigator.onLine) {

    const offlineDb =
      loadOfflineSnapshot();

    if (offlineDb) {
      db = offlineDb;
      renderAll();

      if (showToast) {
        showAceSuccess(
          "🟠 Dados carregados do modo offline."
        );
      }

      return;
    }

    throw new Error(
      "Sem conexão e sem dados offline salvos neste aparelho."
    );
  }


  db =
    await loadFromSupabase();

  saveOfflineSnapshot(db);

  renderAll();

  if (showToast) {
    showAceSuccess(
      "✅ Dados atualizados do Supabase."
    );
  }
}


function getCurrentUserId() {
  if (!currentUser?.id) {
    throw new Error("Usuário não autenticado.");
  }

  rememberCurrentUser();

  return currentUser.id;
}


async function insertPerson({
  name,
  registration,
  ede,
  studyDay,
  studyTime,
  sede
}) {
  const id = newNumericId();

  const { error } = await supabaseClient
    .from("Pessoas")
    .insert({
      id,
      nome: name,
      "matrícula": registration,
      ede: ede || "",
      dia_estudo: studyDay || "",
      horario: studyTime || "",
      sede: sede || "",
      ativo: true,
      usuario_id: getCurrentUserId()
    });

  if (error) throw error;
  return id;
}


async function updatePerson({
  id,
  name,
  registration,
  ede,
  studyDay,
  studyTime,
  sede
}) {

  const {
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .update({
        nome:
          name,
        "matrícula":
          registration,
        ede:
          ede || "",
        dia_estudo:
          studyDay || "",
        horario:
          studyTime || "",
        sede:
          sede || ""
      })
      .eq(
        "id",
        Number(id)
      );


  if (error) {
    throw error;
  }

}


async function archivePersonAndRemoveAttendance(
  personId
) {

  const numericPersonId =
    Number(personId);


  // ----------------------------------------------------------
  // 1. Remove SOMENTE as presenças dessa pessoa.
  // Assim os dias antigos são recalculados sem ela.
  // ----------------------------------------------------------

  const {
    error: attendanceError
  } =
    await supabaseClient
      .from("presença")
      .delete()
      .eq(
        "pessoa_id",
        numericPersonId
      );


  if (attendanceError) {
    throw attendanceError;
  }


  // ----------------------------------------------------------
  // 2. Não apaga fisicamente a pessoa.
  // Apenas deixa o cadastro inativo para evitar conflito
  // com outros registros vinculados no Supabase.
  // ----------------------------------------------------------

  const {
    error: personError
  } =
    await supabaseClient
      .from("Pessoas")
      .update({
        ativo:
          false
      })
      .eq(
        "id",
        numericPersonId
      );


  if (personError) {
    throw personError;
  }

}


function ensureAttendancePersonActionsStyle() {

  if (
    document.getElementById(
      "aceAttendancePersonActionsStyle"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );

  style.id =
    "aceAttendancePersonActionsStyle";

  style.textContent = `

    .attendance-row{
      gap:14px;
    }

    .ace-attendance-actions{
      display:flex;
      align-items:center;
      gap:8px;
      margin-left:auto;
    }

    .ace-attendance-edit,
    .ace-attendance-delete{
      min-height:38px;
      padding:7px 12px;
      border-radius:9px;
      background:#fff;
      font-family:inherit;
      font-size:13px;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
    }

    .ace-attendance-edit{
      border:1px solid #0b4b7a;
      color:#0b4b7a;
    }

    .ace-attendance-delete{
      border:1px solid #ef4444;
      color:#d92d20;
    }

    .ace-attendance-switch-wrap{
      margin-left:4px;
    }

    #acePersonEditModal{
      position:fixed;
      inset:0;
      z-index:1000020;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,35,70,.58);
      backdrop-filter:blur(3px);
    }

    .ace-person-edit-box{
      width:min(620px,calc(100vw - 34px));
      max-height:90vh;
      overflow:auto;
      box-sizing:border-box;
      padding:25px;
      border-radius:18px;
      background:#fff;
      box-shadow:0 22px 70px rgba(0,0,0,.30);
    }

    .ace-person-edit-title{
      margin:0 0 18px;
      color:#0b3a63;
      font-size:24px;
      font-weight:900;
    }

    .ace-person-edit-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:13px;
    }

    .ace-person-edit-field{
      display:flex;
      flex-direction:column;
      gap:6px;
      color:#102a43;
      font-weight:900;
    }

    .ace-person-edit-field input,
    .ace-person-edit-field select{
      min-height:46px;
      box-sizing:border-box;
      padding:9px 11px;
      border:1px solid #ccd9e4;
      border-radius:10px;
      background:#fff;
      color:#102a43;
      font:inherit;
    }

    .ace-person-edit-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:20px;
    }

    .ace-person-edit-actions button{
      min-height:43px;
      padding:9px 17px;
      border-radius:10px;
      font:inherit;
      font-weight:900;
      cursor:pointer;
    }

    #acePersonEditSave{
      border:1px solid #0756a0;
      background:#0756a0;
      color:#fff;
    }

    #acePersonEditCancel{
      border:1px solid #98a2b3;
      background:#fff;
      color:#344054;
    }

    @media(max-width:760px){

      .attendance-row{
        align-items:flex-start;
        flex-wrap:wrap;
      }

      .ace-attendance-actions{
        width:100%;
        margin-left:0;
      }

      .ace-person-edit-grid{
        grid-template-columns:1fr;
      }

    }

  `;


  document.head.appendChild(
    style
  );

}


function openAttendancePersonEditModal(
  personId
) {

  ensureAttendancePersonActionsStyle();


  const person =
    db.people.find(
      p =>
        Number(p.id) ===
        Number(personId)
    );


  if (!person) {
    toast(
      "Pessoa não encontrada."
    );
    return;
  }


  const old =
    document.getElementById(
      "acePersonEditModal"
    );

  if (old) {
    old.remove();
  }


  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "acePersonEditModal";


  const studyDays = [
    "",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo"
  ];


  modal.innerHTML = `

    <div class="ace-person-edit-box">

      <div class="ace-person-edit-title">
        ✏️ Editar pessoa
      </div>

      <div class="ace-person-edit-grid">

        <label class="ace-person-edit-field">
          Nome completo
          <input
            id="acePersonEditName"
            type="text"
            value="${esc(person.name || "")}"
          >
        </label>

        <label class="ace-person-edit-field">
          Matrícula
          <input
            id="acePersonEditRegistration"
            type="text"
            value="${esc(person.registration || "")}"
          >
        </label>

        <label class="ace-person-edit-field">
          Qual EDE
          <input
            id="acePersonEditEde"
            type="text"
            value="${esc(person.ede || "")}"
            placeholder="Ex.: ESDE 1"
          >
        </label>

        <label class="ace-person-edit-field">
          Dia de Estudo
          <select id="acePersonEditStudyDay">
            ${
              studyDays
                .map(
                  day => `
                    <option
                      value="${esc(day)}"
                      ${
                        day ===
                        (person.studyDay || "")
                          ? "selected"
                          : ""
                      }
                    >
                      ${day || "Selecione..."}
                    </option>
                  `
                )
                .join("")
            }
          </select>
        </label>

        <label class="ace-person-edit-field">
          Horário
          <input
            id="acePersonEditStudyTime"
            type="time"
            value="${esc(person.studyTime || "")}"
          >
        </label>

        <label class="ace-person-edit-field">
          Sede
          <input
            id="acePersonEditSede"
            type="text"
            value="${esc(person.sede || "")}"
          >
        </label>

      </div>

      <div class="ace-person-edit-actions">

        <button
          id="acePersonEditCancel"
          type="button"
        >
          Cancelar
        </button>

        <button
          id="acePersonEditSave"
          type="button"
        >
          💾 Salvar
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  document
    .getElementById(
      "acePersonEditCancel"
    )
    .onclick =
      () =>
        modal.remove();


  document
    .getElementById(
      "acePersonEditSave"
    )
    .onclick =
      async () => {

        const saveButton =
          document.getElementById(
            "acePersonEditSave"
          );

        const name =
          document
            .getElementById(
              "acePersonEditName"
            )
            .value
            .trim();

        const registration =
          document
            .getElementById(
              "acePersonEditRegistration"
            )
            .value
            .trim();

        const ede =
          document
            .getElementById(
              "acePersonEditEde"
            )
            .value
            .trim();

        const studyDay =
          document
            .getElementById(
              "acePersonEditStudyDay"
            )
            .value
            .trim();

        const studyTime =
          document
            .getElementById(
              "acePersonEditStudyTime"
            )
            .value
            .trim();

        const sede =
          document
            .getElementById(
              "acePersonEditSede"
            )
            .value
            .trim();


        if (
          !name ||
          !registration
        ) {
          toast(
            "Informe nome e matrícula."
          );
          return;
        }


        saveButton.disabled = true;
        saveButton.textContent =
          "Salvando...";


        try {

          await updatePerson({
            id:
              person.id,
            name,
            registration,
            ede,
            studyDay,
            studyTime,
            sede
          });


          modal.remove();

          await reloadFromSupabase();

          showAceSuccess(
            "Cadastro atualizado com sucesso!"
          );


        } catch (error) {

          console.error(
            "ACE - ERRO AO EDITAR PESSOA:",
            error
          );

          toast(
            "Não foi possível editar a pessoa: " +
            (
              error?.message ||
              "verifique o Supabase."
            )
          );


        } finally {

          if (
            document.body.contains(
              saveButton
            )
          ) {
            saveButton.disabled = false;
            saveButton.textContent =
              "💾 Salvar";
          }

        }

      };

}


async function deleteAttendancePerson(
  personId
) {

  const person =
    db.people.find(
      p =>
        Number(p.id) ===
        Number(personId)
    );


  if (!person) {
    return;
  }


  const confirmed =
    await showAceConfirm(
      `Excluir ${person.name}?\n\n` +
      "A pessoa será removida das listas do sistema e todas as presenças dela serão apagadas.\n\n" +
      "Os outros presentes de cada dia continuarão registrados. Entradas, saídas, estoque e demais históricos não serão alterados.",
      "Excluir pessoa"
    );


  if (!confirmed) {
    return;
  }


  try {

    await archivePersonAndRemoveAttendance(
      person.id
    );

    await reloadFromSupabase();

    showAceSuccess(
      "Pessoa excluída das listas e presenças removidas com sucesso!"
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO EXCLUIR PESSOA DA PRESENÇA:",
      error
    );

    toast(
      "Não foi possível excluir a pessoa: " +
      (
        error?.message ||
        "verifique o Supabase."
      )
    );

  }

}


async function insertFood(name) {
  const id = newNumericId();
  const { error } = await supabaseClient.from("Alimentos").insert({ id, nome: name, unidade: "unidade", ativo: true, usuario_id: getCurrentUserId() });
  if (error) throw error;
  return id;
}

async function insertOrigin(name) {
  const id = newNumericId();
  const { error } = await supabaseClient.from("origens").insert({ id, nome: name, ativo: true, usuario_id: getCurrentUserId() });
  if (error) throw error;
  return id;
}


async function insertHistoryRecord({
  date,
  type,
  originId,
  foodId,
  qty,
  reason = "—",
  basketType = "—",
  note = ""
}) {

  const {
    error
  } =
    await supabaseClient
      .from("historico_movimentacoes")
      .insert({
        data: date,
        tipo: type,
        origem_id:
          originId != null
            ? Number(originId)
            : null,
        alimento_id:
          foodId != null
            ? Number(foodId)
            : null,
        quantidade:
          Number(qty || 0),
        motivo:
          reason || "—",
        tipo_cesta:
          basketType || "—",
        observacao:
          note || "",
        usuario_id:
          getCurrentUserId()
      });


  if (error) {
    throw error;
  }

}


async function insertEntry({ date, originId, foodId, qty, note }) {
  rememberCurrentUser();

  const { error } = await supabaseClient.from("entradas").insert({
    id: newNumericId(),
    data_entrada: date,
    alimento_id: Number(foodId),
    quantidade: qty,
    origem_id: Number(originId),
    observacao: note || "",
    usuario_id: getCurrentUserId()
  });

  if (error) throw error;

  await insertHistoryRecord({
    date,
    type: "entrada",
    originId,
    foodId,
    qty,
    reason: "—",
    basketType: "—",
    note: note || ""
  });
}

async function insertMovement({ date, type, originId, foodId, qty, reasonId, note }) {
  const userId = getCurrentUserId();
  const reasonName = db.reasons.find(r => r.id === reasonId)?.name || reasonId || "Outro";

  if (type === "saida") {
    const { error } = await supabaseClient.from("saídas").insert({
      id: newNumericId(),
      data_saida: date,
      alimento_id: Number(foodId),
      quantidade: qty,
      origem_id: Number(originId),
      destino: note || "",
      motivo: reasonName,
      usuario_id: userId
    });
    if (error) throw error;

    await insertHistoryRecord({
      date,
      type: "saida",
      originId,
      foodId,
      qty,
      reason: reasonName,
      basketType: "—",
      note: note || ""
    });

    return;
  }
  const { error } = await supabaseClient.from("perdas").insert({
    id: newNumericId(),
    data_perda: date,
    alimento_id: Number(foodId),
    quantidade: qty,
    origem_id: Number(originId),
    motivo: reasonName,
    observacao: note || "",
    usuario_id: userId
  });
  if (error) throw error;

  await insertHistoryRecord({
    date,
    type: "perda",
    originId,
    foodId,
    qty,
    reason: reasonName,
    basketType: "—",
    note: note || ""
  });
}

async function updateEntry({ id, date, originId, foodId, qty, note }) {
  const { error } = await supabaseClient
    .from("entradas")
    .update({
      data_entrada: date,
      alimento_id: Number(foodId),
      quantidade: Number(qty),
      origem_id: Number(originId),
      observacao: note || ""
    })
    .eq("id", Number(id));

  if (error) throw error;
}

async function updateMovement({ id, type, date, originId, foodId, qty, reasonId, note }) {
  const movement = db.movements.find(x => x.id === id);

  if (!movement?.rawId || !movement.sourceTable) {
    throw new Error("Não foi possível identificar a movimentação no Supabase.");
  }

  if (
    movement.sourceTable !==
    (type === "saida" ? "saídas" : "perdas")
  ) {
    await deleteMovement(id);

    await insertMovement({
      date,
      type,
      originId,
      foodId,
      qty: Number(qty),
      reasonId,
      note
    });

    return;
  }

  const payload =
    type === "saida"
      ? {
          data_saida: date,
          alimento_id: Number(foodId),
          quantidade: Number(qty),
          origem_id: Number(originId),
          destino: note || "",
          motivo:
            db.reasons.find(r => r.id === reasonId)?.name ||
            reasonId ||
            "Outro"
        }
      : {
          data_perda: date,
          alimento_id: Number(foodId),
          quantidade: Number(qty),
          origem_id: Number(originId),
          motivo:
            db.reasons.find(r => r.id === reasonId)?.name ||
            reasonId ||
            "Outro",
          observacao: note || ""
        };

  const { error } = await supabaseClient
    .from(movement.sourceTable)
    .update(payload)
    .eq("id", Number(movement.rawId));

  if (error) throw error;
}

async function deletePerson(id) {
  const { error } = await supabaseClient.from("Pessoas").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteFood(id) {
  const { error } = await supabaseClient.from("Alimentos").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteOrigin(id) {
  const { error } = await supabaseClient.from("origens").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteReasonLocalOnly(id) {
  db.reasons = db.reasons.filter(x => x.id !== id);
  saveLocalReasons();
}

async function deleteEntry(id) {
  const { error } = await supabaseClient.from("entradas").delete().eq("id", Number(id));
  if (error) throw error;
}

async function deleteMovement(id) {
  const movement = db.movements.find(x => x.id === id);
  if (!movement?.rawId || !movement.sourceTable) throw new Error("Não foi possível identificar a movimentação no Supabase.");
  const { error } = await supabaseClient.from(movement.sourceTable).delete().eq("id", Number(movement.rawId));
  if (error) throw error;
}

async function setAttendance(date, personId, present) {
  const table = supabaseClient.from("presença");
  const { data: existing, error: findError } = await table.select("id").eq("data", date).eq("pessoa_id", Number(personId)).limit(1);
  if (findError) throw findError;

  if (present) {
    if (!existing?.length) {
      const { error } = await table.insert({ id: newNumericId(), data: date, pessoa_id: Number(personId), present: true, usuario_id: getCurrentUserId() });
      if (error) throw error;
    }
    return;
  }

  const { error } = await table.delete().eq("data", date).eq("pessoa_id", Number(personId));
  if (error) throw error;
}

async function deleteCadastro(key, id) {
  if (key === "people") return deletePerson(id);
  if (key === "foods") return deleteFood(id);
  if (key === "origins") return deleteOrigin(id);
  if (key === "reasons") return deleteReasonLocalOnly(id);
  throw new Error("Cadastro desconhecido.");
}

function esc(s) {

  return String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );

}


function fmt(n) {

  return Number(n || 0).toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits: 2
    }
  );

}


function fmtDate(d) {

  return d
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR")
    : "";

}


function getName(arr, id) {

  return arr.find(x => x.id === id)?.name || "—";

}


function toast(msg) {

  const el = document.getElementById("toast");

  if (!el) return;

  el.textContent = msg;

  el.classList.add("show");

  clearTimeout(window._toast);

  window._toast = setTimeout(
    () => el.classList.remove("show"),
    2400
  );

}


// ============================================================
// MENSAGEM CENTRAL DE SUCESSO
// ============================================================
function showAceSuccess(message) {

  document.getElementById("aceSuccessMessage")?.remove();

  clearTimeout(window._aceSuccessTimer);

  const overlay = document.createElement("div");
  overlay.id = "aceSuccessMessage";

  overlay.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      z-index:1000005;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      pointer-events:none;
      background:rgba(11,58,99,.12);
      backdrop-filter:blur(1px);
    ">
      <div style="
        width:min(460px,calc(100vw - 40px));
        box-sizing:border-box;
        padding:28px 30px;
        border:2px solid #22a65a;
        border-radius:18px;
        background:#ffffff;
        box-shadow:0 18px 50px rgba(0,0,0,.22);
        text-align:center;
        font-family:inherit;
      ">
        <div style="
          margin-bottom:10px;
          font-size:46px;
          line-height:1;
        ">✅</div>
        <div style="
          color:#169447;
          font-size:22px;
          font-weight:900;
          line-height:1.4;
        ">${esc(message)}</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  window._aceSuccessTimer = setTimeout(() => {
    overlay.style.transition = "opacity .35s ease";
    overlay.style.opacity = "0";

    setTimeout(() => {
      overlay.remove();
    }, 350);
  }, 2000);
}


// ============================================================
// 4.9 RECUPERAÇÃO DE SENHA
// ============================================================

function closeAcePasswordModal() {

  const modal =
    document.getElementById("acePasswordModal");

  if (modal) {
    modal.remove();
  }

}


function openForgotPasswordModal() {

  closeAcePasswordModal();

  const modal =
    document.createElement("div");

  modal.id =
    "acePasswordModal";

  modal.innerHTML = `

    <div class="ace-password-box">

      <div class="ace-password-title">
        🔑 Esqueci minha senha
      </div>

      <div class="ace-password-subtitle">
        Digite o e-mail cadastrado para receber o link de redefinição.
      </div>

      <label class="ace-password-label">
        E-mail
        <input
          id="forgotPasswordEmail"
          type="email"
          placeholder="Digite seu e-mail"
          autocomplete="email"
        >
      </label>

      <div
        id="forgotPasswordError"
        class="ace-password-error"
      ></div>

      <div class="ace-password-actions">

        <button
          type="button"
          id="forgotPasswordSend"
          class="ace-password-primary"
        >
          📧 Enviar link
        </button>

        <button
          type="button"
          id="forgotPasswordCancel"
          class="ace-password-secondary"
        >
          Cancelar
        </button>

      </div>

    </div>

  `;

  document.body.appendChild(modal);

  const style =
    document.createElement("style");

  style.id =
    "acePasswordModalStyle";

  style.textContent = `

    #acePasswordModal{
      position:fixed;
      inset:0;
      z-index:1000000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,35,70,.62);
      backdrop-filter:blur(3px);
    }

    .ace-password-box{
      width:min(470px,calc(100vw - 40px));
      box-sizing:border-box;
      padding:30px;
      border-radius:18px;
      background:#5da5e6;
      color:#fff;
      box-shadow:0 18px 50px rgba(0,0,0,.35);
    }

    .ace-password-title{
      text-align:center;
      font-size:25px;
      font-weight:900;
      margin-bottom:10px;
      color:#fff;
    }

    .ace-password-subtitle{
      text-align:center;
      font-size:15px;
      line-height:1.45;
      margin-bottom:22px;
      color:#fff;
    }

    .ace-password-label{
      display:flex;
      flex-direction:column;
      gap:7px;
      font-size:14px;
      font-weight:900;
      color:#fff;
    }

    .ace-password-box input{
      width:100%;
      box-sizing:border-box;
      padding:13px;
      border:1px solid rgba(255,255,255,.85);
      border-radius:10px;
      background:#fff;
      color:#172b3a;
      font-size:16px;
      outline:none;
    }

    .ace-password-box input:focus{
      box-shadow:0 0 0 3px rgba(255,255,255,.28);
    }

    .ace-password-error{
      display:none;
      margin-top:12px;
      padding:10px;
      border-radius:9px;
      background:#fff0f0;
      color:#b42318;
      font-weight:800;
      font-size:13px;
    }

    .ace-password-error.show{
      display:block;
    }

    .ace-password-actions{
      display:flex;
      justify-content:center;
      gap:12px;
      margin-top:24px;
    }

    .ace-password-actions button{
      min-width:125px;
      padding:12px 18px;
      border-radius:9px;
      font-size:15px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-password-primary{
      border:1px solid #0756a0;
      background:#0756a0;
      color:#fff;
    }

    .ace-password-secondary{
      border:1px solid rgba(255,255,255,.95);
      background:transparent;
      color:#fff;
    }

    .ace-password-primary:disabled{
      opacity:.65;
      cursor:not-allowed;
    }

    .ace-reset-box{
      width:min(470px,calc(100vw - 40px));
      box-sizing:border-box;
      padding:30px;
      border-radius:18px;
      background:#5da5e6;
      color:#fff;
      box-shadow:0 18px 50px rgba(0,0,0,.35);
    }

    .ace-reset-title{
      text-align:center;
      font-size:25px;
      font-weight:900;
      margin-bottom:10px;
    }

    .ace-reset-subtitle{
      text-align:center;
      font-size:15px;
      line-height:1.45;
      margin-bottom:22px;
    }

    .ace-reset-label{
      display:flex;
      flex-direction:column;
      gap:7px;
      margin-bottom:14px;
      font-size:14px;
      font-weight:900;
    }

    .ace-reset-box input{
      width:100%;
      box-sizing:border-box;
      padding:13px;
      border:1px solid rgba(255,255,255,.85);
      border-radius:10px;
      background:#fff;
      color:#172b3a;
      font-size:16px;
      outline:none;
    }

    .ace-reset-error{
      display:none;
      margin-top:8px;
      padding:10px;
      border-radius:9px;
      background:#fff0f0;
      color:#b42318;
      font-weight:800;
      font-size:13px;
    }

    .ace-reset-error.show{
      display:block;
    }

    .ace-reset-button{
      width:100%;
      margin-top:10px;
      padding:13px;
      border:1px solid #0756a0;
      border-radius:10px;
      background:#0756a0;
      color:#fff;
      font-size:16px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-reset-button:disabled{
      opacity:.65;
      cursor:not-allowed;
    }

  `;

  document.head.appendChild(style);

  document
    .getElementById("forgotPasswordCancel")
    .onclick =
      closeAcePasswordModal;

  document
    .getElementById("forgotPasswordSend")
    .onclick =
      sendPasswordResetEmail;

  document
    .getElementById("forgotPasswordEmail")
    .focus();

}


async function sendPasswordResetEmail() {

  const email =
    document
      .getElementById("forgotPasswordEmail")
      ?.value
      .trim();

  const error =
    document.getElementById(
      "forgotPasswordError"
    );

  const button =
    document.getElementById(
      "forgotPasswordSend"
    );

  if (!email) {

    error.textContent =
      "Digite o e-mail cadastrado.";

    error.classList.add("show");

    return;

  }

  error.classList.remove("show");

  button.disabled = true;
  button.textContent = "Enviando...";

  try {

    const redirectTo =
      "https://aceacaodecestas.github.io/GEPE-controle-alimentos-/";

    const { error: resetError } =
      await supabaseClient.auth
        .resetPasswordForEmail(
          email,
          {
            redirectTo
          }
        );

    if (resetError) {
      throw resetError;
    }

    closeAcePasswordModal();

    await showAceConfirm(
      "Enviamos um link para redefinir sua senha.\n\n" +
      "Abra o e-mail e clique no link. " +
      "Você voltará para o sistema para cadastrar a nova senha.",
      "📧 E-mail enviado"
    );

  } catch (err) {

    console.error(
      "ACE - ERRO AO ENVIAR RECUPERAÇÃO:",
      err
    );

    error.textContent =
      err?.message ||
      "Não foi possível enviar o link de redefinição.";

    error.classList.add("show");

    button.disabled = false;
    button.textContent = "📧 Enviar link";

  }

}


function showPasswordResetScreen() {

  closeAcePasswordModal();

  const oldLogin =
    document.getElementById("loginScreen");

  if (oldLogin) {
    oldLogin.remove();
  }

  const modal =
    document.createElement("div");

  modal.id =
    "acePasswordModal";

  modal.innerHTML = `

    <div class="ace-reset-box">

      <div class="ace-reset-title">
        🔐 Redefinir senha
      </div>

      <div class="ace-reset-subtitle">
        Digite sua nova senha e confirme para salvar.
      </div>

      <label class="ace-reset-label">
        Nova senha
        <input
          id="resetPassword"
          type="password"
          autocomplete="new-password"
          placeholder="Digite a nova senha"
          minlength="6"
        >
      </label>

      <label class="ace-reset-label">
        Confirmar nova senha
        <input
          id="resetPasswordConfirm"
          type="password"
          autocomplete="new-password"
          placeholder="Confirme a nova senha"
          minlength="6"
        >
      </label>

      <div
        id="resetPasswordError"
        class="ace-reset-error"
      ></div>

      <button
        id="resetPasswordButton"
        class="ace-reset-button"
        type="button"
      >
        🔐 Salvar nova senha
      </button>

    </div>

  `;

  document.body.appendChild(modal);

  if (!document.getElementById("acePasswordModalStyle")) {

    const style =
      document.createElement("style");

    style.id =
      "acePasswordModalStyle";

    style.textContent = `

      #acePasswordModal{
        position:fixed;
        inset:0;
        z-index:1000000;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(0,35,70,.62);
        backdrop-filter:blur(3px);
      }

      .ace-reset-box{
        width:min(470px,calc(100vw - 40px));
        box-sizing:border-box;
        padding:30px;
        border-radius:18px;
        background:#5da5e6;
        color:#fff;
        box-shadow:0 18px 50px rgba(0,0,0,.35);
      }

      .ace-reset-title{
        text-align:center;
        font-size:25px;
        font-weight:900;
        margin-bottom:10px;
      }

      .ace-reset-subtitle{
        text-align:center;
        font-size:15px;
        line-height:1.45;
        margin-bottom:22px;
      }

      .ace-reset-label{
        display:flex;
        flex-direction:column;
        gap:7px;
        margin-bottom:14px;
        font-size:14px;
        font-weight:900;
      }

      .ace-reset-box input{
        width:100%;
        box-sizing:border-box;
        padding:13px;
        border:1px solid rgba(255,255,255,.85);
        border-radius:10px;
        background:#fff;
        color:#172b3a;
        font-size:16px;
        outline:none;
      }

      .ace-reset-error{
        display:none;
        margin-top:8px;
        padding:10px;
        border-radius:9px;
        background:#fff0f0;
        color:#b42318;
        font-weight:800;
        font-size:13px;
      }

      .ace-reset-error.show{
        display:block;
      }

      .ace-reset-button{
        width:100%;
        margin-top:10px;
        padding:13px;
        border:1px solid #0756a0;
        border-radius:10px;
        background:#0756a0;
        color:#fff;
        font-size:16px;
        font-weight:900;
        cursor:pointer;
      }

      .ace-reset-button:disabled{
        opacity:.65;
        cursor:not-allowed;
      }

    `;

    document.head.appendChild(style);

  }

  document
    .getElementById("resetPasswordButton")
    .onclick =
      updateRecoveredPassword;

  document
    .getElementById("resetPassword")
    .focus();

}


async function updateRecoveredPassword() {

  const password =
    document
      .getElementById("resetPassword")
      .value;

  const confirmPassword =
    document
      .getElementById("resetPasswordConfirm")
      .value;

  const error =
    document.getElementById(
      "resetPasswordError"
    );

  const button =
    document.getElementById(
      "resetPasswordButton"
    );

  error.classList.remove("show");
  error.textContent = "";

  if (password.length < 6) {

    error.textContent =
      "A senha deve ter pelo menos 6 caracteres.";

    error.classList.add("show");

    return;

  }

  if (password !== confirmPassword) {

    error.textContent =
      "As senhas não conferem.";

    error.classList.add("show");

    return;

  }

  button.disabled = true;
  button.textContent = "Salvando...";

  try {

    const { error: updateError } =
      await supabaseClient.auth
        .updateUser({
          password
        });

    if (updateError) {
      throw updateError;
    }

    window.acePasswordResetCompleted = true;
    window.acePasswordRecoveryActive = false;

    await supabaseClient.auth.signOut();

    closeAcePasswordModal();

    const oldLogin =
      document.getElementById("loginScreen");

    if (oldLogin) {
      oldLogin.remove();
    }

    createLoginScreen();

    await showAceConfirm(
      "Sua senha foi redefinida com sucesso.\n\n" +
      "Agora entre com seu e-mail e a nova senha.",
      "✅ Senha alterada"
    );

  } catch (err) {

    console.error(
      "ACE - ERRO AO REDEFINIR SENHA:",
      err
    );

    error.textContent =
      err?.message ||
      "Não foi possível redefinir sua senha.";

    error.classList.add("show");

    button.disabled = false;
    button.textContent =
      "🔐 Salvar nova senha";

  }

}


// ============================================================
// 5. TELA DE LOGIN
// ============================================================

function createLoginScreen() {

  if (document.getElementById("loginScreen")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "loginStyle";

  style.textContent = `

    #loginScreen{
      position:fixed;
      inset:0;
      z-index:99999;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:
        linear-gradient(
          135deg,
          #0b3a63 0%,
          #075486 55%,
          #0b3a63 100%
        );
    }

    .login-box{
      width:min(420px,100%);
      background:#fff;
      border-radius:20px;
      padding:30px;
      box-shadow:0 20px 60px rgba(0,0,0,.28);
    }

    .login-logo{
      text-align:center;
      margin-bottom:18px;
    }

    .login-logo img{
      width:150px;
      max-width:70%;
      height:auto;
    }

    .login-title{
      text-align:center;
      color:#0b3a63;
      font-size:27px;
      font-weight:900;
      margin:5px 0;
    }

    .login-subtitle{
      text-align:center;
      color:#667085;
      font-size:14px;
      margin-bottom:25px;
    }

    .login-box label{
      display:flex;
      flex-direction:column;
      gap:6px;
      margin-bottom:14px;
      font-size:13px;
      font-weight:800;
      color:#344054;
    }

    .login-box input{
      width:100%;
      padding:13px;
      border:1px solid #d9e1e8;
      border-radius:10px;
      font-size:15px;
      outline:none;
      box-sizing:border-box;
    }

    .login-box input:focus{
      border-color:#1467a8;
      box-shadow:0 0 0 3px rgba(20,103,168,.12);
    }

    .login-button{
      width:100%;
      padding:13px;
      margin-top:8px;
      border:0;
      border-radius:10px;
      background:#0b3a63;
      color:#fff;
      font-weight:900;
      font-size:15px;
      cursor:pointer;
    }

    .login-button:hover{
      filter:brightness(1.08);
    }

    .login-button:disabled{
      opacity:.65;
      cursor:not-allowed;
    }


    .hidden{
      display:none !important;
    }

    .forgot-password-button{
      display:block !important;
      width:100%;
      margin-top:12px;
      padding:9px;
      border:0;
      background:transparent;
      color:#0b3a63;
      font-weight:900;
      font-size:14px;
      cursor:pointer;
      text-align:center;
      visibility:visible !important;
      opacity:1 !important;
    }

    .forgot-password-button:hover{
      text-decoration:underline;
    }

    .login-secondary-button{
      width:100%;
      padding:13px;
      margin-top:10px;
      border:1px solid #0b3a63;
      border-radius:10px;
      background:#fff;
      color:#0b3a63;
      font-weight:900;
      font-size:15px;
      cursor:pointer;
    }

    .login-secondary-button:hover{
      background:#f2f7fb;
    }

    .signup-success{
      display:none;
      margin-top:14px;
      padding:14px;
      border-radius:10px;
      background:#ecfdf3;
      color:#027a48;
      font-size:13px;
      font-weight:800;
      line-height:1.5;
    }

    .signup-success.show{
      display:block;
    }

    .signup-back{
      width:100%;
      padding:12px;
      margin-top:10px;
      border:0;
      border-radius:10px;
      background:#fff;
      color:#0b3a63;
      font-weight:900;
      font-size:14px;
      cursor:pointer;
    }

    .login-error{
      display:none;
      margin-top:14px;
      padding:11px;
      border-radius:9px;
      background:#fdeceb;
      color:#b42318;
      font-size:13px;
      font-weight:700;
    }

    .login-error.show{
      display:block;
    }

    .login-loading{
      text-align:center;
      color:#667085;
      font-size:13px;
      margin-top:12px;
    }

    .user-bar{
      display:flex;
      align-items:center;
      gap:10px;
      margin-left:auto;
    }

    .user-email{
      font-size:12px;
      opacity:.9;
    }

    .logout-btn{
      border:1px solid rgba(255,255,255,.35);
      background:rgba(255,255,255,.12);
      color:#fff;
      border-radius:8px;
      padding:8px 11px;
      cursor:pointer;
      font-weight:800;
    }

    .logout-btn:hover{
      background:rgba(255,255,255,.22);
    }

    @media(max-width:700px){

      .login-box{
        padding:24px 20px;
      }

      .login-title{
        font-size:24px;
      }

      .user-email{
        display:none;
      }

    }

  `;

  document.head.appendChild(style);


  const login = document.createElement("div");

  login.id = "loginScreen";

  login.innerHTML = `

    <div class="login-box">

      <div class="login-logo">
        <img src="ace-cesta.png" alt="ACE">
      </div>

      <div class="login-title">
        ACE Ação de Cestas
      </div>

      <div class="login-subtitle">
        Controle de Alimentos
      </div>

      <form id="loginForm">

        <label>
          E-mail
          <input
            id="loginEmail"
            type="email"
            placeholder="Digite seu e-mail"
            autocomplete="username"
            required
          >
        </label>

        <label>
          Senha
          <input
            id="loginPassword"
            type="password"
            placeholder="Digite sua senha"
            autocomplete="current-password"
            required
          >
        </label>

        <button
          id="loginButton"
          class="login-button"
          type="submit"
        >
          🔐 Entrar
        </button>

        <button
          id="forgotPasswordButton"
          class="forgot-password-button"
          type="button"
        >
          🔑 Esqueci minha senha
        </button>

        <button
          id="createAccountButton"
          class="login-secondary-button"
          type="button"
        >
          📄 Criar minha conta
        </button>

        <div
          id="loginError"
          class="login-error"
        ></div>

        <div
          id="loginLoading"
          class="login-loading"
        ></div>

      </form>

    </div>

  `;

  document.body.appendChild(login);


  document
    .getElementById("loginForm")
    .addEventListener("submit", loginUser);

  ensureForgotPasswordButton();

  document
    .getElementById("createAccountButton")
    .addEventListener("click", createSignupScreen);

}



// ============================================================
// 5.0 GARANTE BOTÃO "ESQUECI MINHA SENHA"
// ============================================================

function ensureForgotPasswordButton() {

  const loginForm =
    document.getElementById("loginForm");

  if (!loginForm) {
    return;
  }

  let button =
    document.getElementById("forgotPasswordButton");

  if (!button) {

    button =
      document.createElement("button");

    button.id =
      "forgotPasswordButton";

    button.className =
      "forgot-password-button";

    button.type =
      "button";

    button.textContent =
      "🔑 Esqueci minha senha";

    const createButton =
      document.getElementById(
        "createAccountButton"
      );

    if (createButton) {
      loginForm.insertBefore(
        button,
        createButton
      );
    } else {
      loginForm.appendChild(button);
    }

  }

  // Evita adicionar vários listeners ao mesmo botão.
  if (
    button.dataset.aceForgotBound !== "1"
  ) {

    button.dataset.aceForgotBound = "1";

    button.addEventListener(
      "click",
      openForgotPasswordModal
    );

  }

}


// ============================================================
// 5.1 CRIAR CONTA
// ============================================================

function createSignupScreen() {

  const loginScreen =
    document.getElementById("loginScreen");

  if (!loginScreen) {
    return;
  }


  loginScreen.innerHTML = `

    <div class="login-box">

      <div class="login-logo">
        <img src="ace-cesta.png" alt="ACE">
      </div>

      <div class="login-title">
        📄 Criar minha conta
      </div>

      <div class="login-subtitle">
        Cadastre seu acesso ao sistema
      </div>


      <form id="signupForm">

        <label>
          Nome
          <input
            id="signupName"
            type="text"
            placeholder="Digite seu nome"
            autocomplete="name"
            required
          >
        </label>


        <label>
          E-mail
          <input
            id="signupEmail"
            type="email"
            placeholder="Digite seu e-mail"
            autocomplete="email"
            required
          >
        </label>


        <label>
          Senha
          <input
            id="signupPassword"
            type="password"
            placeholder="Digite sua senha"
            autocomplete="new-password"
            minlength="6"
            required
          >
        </label>


        <label>
          Confirmar senha
          <input
            id="signupPasswordConfirm"
            type="password"
            placeholder="Confirme sua senha"
            autocomplete="new-password"
            minlength="6"
            required
          >
        </label>


        <button
          id="signupButton"
          class="login-button"
          type="submit"
        >
          📄 Criar conta
        </button>


        <button
          id="signupBackButton"
          class="signup-back"
          type="button"
        >
          ← Voltar para o login
        </button>


        <div
          id="signupError"
          class="login-error"
        ></div>


        <div
          id="signupSuccess"
          class="signup-success"
        ></div>


        <div
          id="signupLoading"
          class="login-loading"
        ></div>

      </form>

    </div>

  `;


  document
    .getElementById("signupForm")
    .addEventListener(
      "submit",
      signupUser
    );


  document
    .getElementById("signupBackButton")
    .addEventListener(
      "click",
      () => {

        // O loginScreen já existe porque a tela de cadastro
        // usa o mesmo elemento. Remove o cadastro e recria
        // somente a tela de login.
        const loginScreen =
          document.getElementById(
            "loginScreen"
          );

        if (loginScreen) {
          loginScreen.remove();
        }

        createLoginScreen();

      }
    );

}


async function signupUser(e) {

  e.preventDefault();


  const name =
    document
      .getElementById("signupName")
      .value
      .trim();


  const email =
    document
      .getElementById("signupEmail")
      .value
      .trim();


  const password =
    document
      .getElementById("signupPassword")
      .value;


  const confirmPassword =
    document
      .getElementById("signupPasswordConfirm")
      .value;


  const button =
    document.getElementById(
      "signupButton"
    );


  const error =
    document.getElementById(
      "signupError"
    );


  const success =
    document.getElementById(
      "signupSuccess"
    );


  const loading =
    document.getElementById(
      "signupLoading"
    );


  error.classList.remove("show");
  error.textContent = "";

  success.classList.remove("show");
  success.textContent = "";

  loading.textContent = "";


  if (!name) {

    error.textContent =
      "Digite seu nome.";

    error.classList.add("show");

    return;

  }


  if (password.length < 6) {

    error.textContent =
      "A senha deve ter pelo menos 6 caracteres.";

    error.classList.add("show");

    return;

  }


  if (
    password !==
    confirmPassword
  ) {

    error.textContent =
      "As senhas não conferem.";

    error.classList.add("show");

    return;

  }


  button.disabled = true;

  button.textContent =
    "Criando conta...";

  loading.textContent =
    "Registrando usuário...";


  try {

    // Impede que o SIGNED_IN automático do cadastro abra o aplicativo.
    window.aceSignupInProgress = true;

    const {
      data,
      error: authError
    } =
      await supabaseClient.auth.signUp({

        email,

        password,

        options: {

          data: {

            nome: name

          }

        }

      });


    if (authError) {

      throw authError;

    }


    // ========================================================
    // CONTA CRIADA
    // Não entra automaticamente no aplicativo.
    // Exibe aviso verde e retorna para o login.
    // ========================================================

    loading.textContent = "";

    // Quando a confirmação de e-mail está desativada,
    // o Supabase pode criar uma sessão automaticamente.
    // Encerramos somente essa sessão para exigir login manual.
    window.aceSignupSigningOut = true;

    try {

      await supabaseClient.auth.signOut({
        scope: "local"
      });

    } catch (signOutError) {

      console.warn(
        "ACE: não foi possível encerrar a sessão criada no cadastro:",
        signOutError
      );

    }

    currentUser = null;
    appStarted = false;
    window.aceSignupInProgress = false;


    const oldNotice =
      document.getElementById(
        "aceSignupSuccessNotice"
      );

    if (oldNotice) {
      oldNotice.remove();
    }


    const notice =
      document.createElement("div");

    notice.id =
      "aceSignupSuccessNotice";

    notice.innerHTML = `
      <div style="
        background:#ffffff;
        color:#16803a;
        border:2px solid #22a447;
        border-radius:16px;
        padding:24px 34px;
        font-size:22px;
        font-weight:900;
        text-align:center;
        box-shadow:0 18px 50px rgba(0,0,0,.28);
      ">
        ✅ Conta criada com sucesso!
      </div>
    `;

    notice.style.cssText = `
      position:fixed;
      inset:0;
      z-index:1000002;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,35,70,.35);
    `;

    document.body.appendChild(notice);


    setTimeout(
      () => {

        // A mensagem some, mas o usuário permanece
        // na tela de criação de conta.
        // Ele só volta ao login quando clicar
        // no botão "Voltar para o login".
        notice.remove();

      },
      1800
    );


  } catch (err) {

    window.aceSignupInProgress = false;
    window.aceSignupSigningOut = false;

    console.error(
      "ACE - ERRO AO CRIAR CONTA:",
      err
    );


    const msg =
      String(
        err?.message ||
        ""
      ).toLowerCase();


    if (
      msg.includes(
        "user already registered"
      ) ||
      msg.includes(
        "already registered"
      )
    ) {

      error.textContent =
        "Este e-mail já possui uma conta.";

    } else if (
      msg.includes(
        "password"
      ) &&
      msg.includes(
        "weak"
      )
    ) {

      error.textContent =
        "A senha é muito fraca. Use pelo menos 6 caracteres.";

    } else if (
      msg.includes(
        "invalid email"
      )
    ) {

      error.textContent =
        "Digite um e-mail válido.";

    } else {

      error.textContent =
        err?.message ||
        "Não foi possível criar a conta.";

    }


    error.classList.add("show");


    button.disabled = false;

    button.textContent =
      "📄 Criar conta";

    loading.textContent = "";

  }

}


async function loginUser(e) {

  e.preventDefault();

  const email =
    document.getElementById("loginEmail").value.trim();

  const password =
    document.getElementById("loginPassword").value;

  const button =
    document.getElementById("loginButton");

  const error =
    document.getElementById("loginError");

  const loading =
    document.getElementById("loginLoading");


  error.classList.remove("show");

  error.textContent = "";

  button.disabled = true;

  button.textContent = "Entrando...";

  loading.textContent = "Autenticando...";


  try {

    const { data, error: authError } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });


    if (authError) {
      throw authError;
    }


    currentUser = data.user;

    document
      .getElementById("loginScreen")
      .remove();

    initApp();

  } catch (err) {

    console.error(err);

    error.textContent =
      traduzirErroLogin(err);

    error.classList.add("show");

    button.disabled = false;

    button.textContent = "🔐 Entrar";

    loading.textContent = "";

  }

}


function traduzirErroLogin(err) {

  const msg = String(
    err?.message || ""
  ).toLowerCase();


  if (
    msg.includes("invalid login credentials")
  ) {
    return "E-mail ou senha incorretos.";
  }


  if (
    msg.includes("email not confirmed")
  ) {
    return "Este e-mail ainda não foi confirmado.";
  }


  if (
    msg.includes("too many requests")
  ) {
    return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  }


  if (!msg) {
    return "Não foi possível realizar o login.";
  }


  return err.message;

}


// ============================================================
// 6. CONTROLE DO USUÁRIO LOGADO
// ============================================================

function addUserBar() {

  const header =
    document.querySelector(".ace-header-v6");

  if (!header || !currentUser) {
    return;
  }


  if (document.getElementById("userBar")) {
    return;
  }


  const bar = document.createElement("div");

  bar.id = "userBar";

  bar.className = "user-bar";


  bar.innerHTML = `

    <span class="user-email">
      ${esc(currentUser.email)}
    </span>

    

    <button
      id="logoutBtn"
      class="logout-btn"
      type="button"
    >
      🚪 Sair
    </button>

  `;


  header.appendChild(bar);


  document
    .getElementById("logoutBtn")
    .addEventListener(
      "click",
      logoutUser
    );

}


// ============================================================
// MODAL PERSONALIZADO - CONFIRMAÇÕES
// ============================================================

function showAceConfirm(message, title = "Atenção") {

  return new Promise(resolve => {

    const old = document.getElementById("aceCustomModal");

    if (old) {
      old.remove();
    }

    const overlay = document.createElement("div");

    overlay.id = "aceCustomModal";

    overlay.innerHTML = `
      <div class="ace-modal-box" role="dialog" aria-modal="true">
        <div class="ace-modal-title">${esc(title)}</div>
        <div class="ace-modal-message">${esc(message).replace(/\n/g, "<br>")}</div>

        <div class="ace-modal-actions">
          <button type="button" class="ace-modal-ok">OK</button>
          <button type="button" class="ace-modal-cancel">Cancelar</button>
        </div>
      </div>
    `;

    const style = document.createElement("style");

    style.id = "aceCustomModalStyle";

    style.textContent = `
      #aceCustomModal {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 35, 70, .62);
        backdrop-filter: blur(3px);
      }

      #aceCustomModal .ace-modal-box {
        width: min(520px, calc(100vw - 40px));
        max-height: calc(100vh - 40px);
        overflow: auto;
        box-sizing: border-box;
        padding: 28px 30px 24px;
        border-radius: 18px;
        background: #5da5e6;
        color: #fff;
        box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
        text-align: center;
        font-family: inherit;
      }

      #aceCustomModal .ace-modal-title {
        margin-bottom: 18px;
        font-size: 25px;
        font-weight: 900;
        color: #fff;
      }

      #aceCustomModal .ace-modal-message {
        font-size: 17px;
        line-height: 1.55;
        text-align: left;
        color: #fff;
      }

      #aceCustomModal .ace-modal-actions {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-top: 24px;
      }

      #aceCustomModal button {
        min-width: 105px;
        padding: 11px 20px;
        border-radius: 9px;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
      }

      #aceCustomModal .ace-modal-ok {
        border: 1px solid #0756a0;
        background: #0756a0;
        color: #fff;
      }

      #aceCustomModal .ace-modal-cancel {
        border: 1px solid rgba(255,255,255,.9);
        background: transparent;
        color: #fff;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const close = value => {
      overlay.remove();
      resolve(value);
    };

    overlay
      .querySelector(".ace-modal-ok")
      .onclick = () => close(true);

    overlay
      .querySelector(".ace-modal-cancel")
      .onclick = () => close(false);

  });

}


function showAceInput(message, title = "Confirmação") {

  return new Promise(resolve => {

    const old = document.getElementById("aceCustomModal");

    if (old) old.remove();

    const overlay = document.createElement("div");

    overlay.id = "aceCustomModal";

    overlay.innerHTML = `
      <div class="ace-modal-box" role="dialog" aria-modal="true">
        <div class="ace-modal-title">${esc(title)}</div>
        <div class="ace-modal-message">${esc(message).replace(/\n/g, "<br>")}</div>

        <input
          id="aceModalInput"
          type="text"
          autocomplete="off"
          style="
            width:100%;
            box-sizing:border-box;
            margin-top:18px;
            padding:12px;
            border:1px solid rgba(255,255,255,.8);
            border-radius:9px;
            font-size:17px;
            font-weight:700;
            text-align:center;
            outline:none;
          "
        >

        <div class="ace-modal-actions">
          <button type="button" class="ace-modal-ok">OK</button>
          <button type="button" class="ace-modal-cancel">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#aceModalInput");

    const close = value => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector(".ace-modal-ok").onclick =
      () => close(input.value);

    overlay.querySelector(".ace-modal-cancel").onclick =
      () => close(null);

    input.focus();

    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        close(input.value);
      }

      if (event.key === "Escape") {
        close(null);
      }
    });

  });

}


async function logoutUser() {

  const ok =
    await showAceConfirm(
      "Deseja sair do sistema?",
      "Sair do sistema"
    );

  if (!ok) return;


  const { error } =
    await supabaseClient.auth.signOut();


  if (error) {

    console.error(error);

    toast("Não foi possível sair.");

    return;

  }


  location.reload();

}


// ============================================================
// 7. SELECTS
// ============================================================

function populateSelect(
  id,
  arr,
  placeholder = "Selecione..."
) {

  const el =
    document.getElementById(id);

  if (!el) return;


  el.innerHTML =
    `<option value="">${placeholder}</option>` +
    arr
      .map(
        x =>
          `<option value="${x.id}">
            ${esc(x.name)}
          </option>`
      )
      .join("");

}


function setDates() {

  [
    "entryDate",
    "movementDate",
    "dashboardDate",
    "attendanceDate",
    "historyDateFilter"
  ].forEach(id => {

    const e =
      document.getElementById(id);

    if (e) {
      e.value = isoToday();
    }

  });


  const start =
    document.getElementById("reportStart");

  const end =
    document.getElementById("reportEnd");


  if (start) {
    start.value = isoToday();
  }


  if (end) {
    end.value = isoToday();
  }

}


function refreshSelects() {

  populateSelect(
    "entryOrigin",
    db.origins
  );

  populateSelect(
    "movementOrigin",
    db.origins
  );

  populateSelect(
    "entryFood",
    db.foods
  );

  populateSelect(
    "movementFood",
    db.foods
  );

  populateSelect(
    "movementReason",
    db.reasons
  );


  const reportOrigin =
    document.getElementById(
      "reportOrigin"
    );


  if (reportOrigin) {

    reportOrigin.innerHTML =
      '<option value="">Todas</option>' +
      db.origins
        .map(
          x =>
            `<option value="${x.id}">
              ${esc(x.name)}
            </option>`
        )
        .join("");

  }

}


// ============================================================
// 8. ESTOQUE
// ============================================================

function calcStock() {

  const stock = {};

  db.origins.forEach(
    o => stock[o.id] = {}
  );


  db.foods.forEach(food => {

    db.origins.forEach(origin => {

      stock[origin.id][food.id] = 0;

    });

  });


  db.entries.forEach(entry => {

    if (
      stock[entry.originId] &&
      stock[entry.originId][entry.foodId] != null
    ) {

      stock[entry.originId][entry.foodId] +=
        Number(entry.qty);

    }

  });


  db.movements.forEach(movement => {

    if (
      stock[movement.originId] &&
      stock[movement.originId][movement.foodId] != null
    ) {

      stock[movement.originId][movement.foodId] -=
        Number(movement.qty);

    }

  });


  return stock;

}


// ============================================================
// 9. DASHBOARD
// ============================================================

function renderDashboard() {

  const date =
    document.getElementById(
      "dashboardDate"
    )?.value || isoToday();


  const todayLabel =
    document.getElementById(
      "todayLabel"
    );

  if (todayLabel) {
    todayLabel.textContent =
      fmtDate(date);
  }


  const ent =
    db.entries
      .filter(x => x.date === date)
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const sai =
    db.movements
      .filter(
        x =>
          x.date === date &&
          x.type === "saida"
      )
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const per =
    db.movements
      .filter(
        x =>
          x.date === date &&
          x.type === "perda"
      )
      .reduce(
        (s, x) =>
          s + Number(x.qty),
        0
      );


  const st = calcStock();


  const estoque =
    Object.values(st)
      .reduce(
        (a, o) =>
          a +
          Object.values(o)
            .reduce(
              (x, v) =>
                x + Number(v),
              0
            ),
        0
      );


  const pres =
    (db.attendance[date] || [])
      .filter(Boolean)
      .length;


  const cestasSaidas =
    (db.basketOutputs || [])
      .filter(x => x.date === date)
      .reduce(
        (total, x) =>
          total + Number(x.basketQty || 0),
        0
      );


  // Cria automaticamente o cartão de Cestas no Resumo do dia.
  let kpiCestas =
    document.getElementById("kpiCestas");

  if (!kpiCestas) {
    const cards =
      document.querySelector("#dashboard .cards");

    if (cards) {
      const card =
        document.createElement("div");

      card.className = "card";
      card.innerHTML = `
        <span>🧺 Cestas</span>
        <strong id="kpiCestas">0</strong>
        <small>cestas</small>
      `;

      cards.appendChild(card);
      kpiCestas =
        document.getElementById("kpiCestas");
    }
  }


  const ids = [
    ["kpiEntrada", ent],
    ["kpiSaida", sai],
    ["kpiPerda", per],
    ["kpiEstoque", estoque],
    ["kpiPresentes", pres],
    ["kpiCestas", cestasSaidas]
  ];


  ids.forEach(([id, value]) => {

    const el =
      document.getElementById(id);

    if (el) {
      el.textContent = fmt(value);
    }

  });


  const originSummary =
    document.getElementById(
      "originSummary"
    );


  if (originSummary) {

    originSummary.innerHTML =
      db.origins
        .map(o => {

          const total =
            Object.values(
              st[o.id] || {}
            ).reduce(
              (a, v) =>
                a + Number(v),
              0
            );


          return `
            <div class="origin-box">

              <div class="origin-title">

                <span>
                  📍 ${esc(o.name)}
                </span>

                <span class="badge">
                  ${fmt(total)}
                </span>

              </div>

              <div class="origin-value">
                ${fmt(total)} itens
              </div>

            </div>
          `;

        })
        .join("");

  }


  const recent =
    document.getElementById(
      "recentMovements"
    );

  if (recent) {

    const all = [

      ...db.entries.map(x => ({
        ...x,
        kind: "Entrada",
        sign: "+",
        color: "green"
      })),

      ...db.movements.map(x => ({
        ...x,
        kind:
          x.type === "perda"
            ? "Perda"
            : "Saída",
        sign: "-",
        color:
          x.type === "perda"
            ? "red"
            : "blue"
      }))

    ]
      .sort(
        (a, b) =>
          (b.createdAt || "")
            .localeCompare(
              a.createdAt || ""
            )
      )
      .slice(0, 8);

    recent.innerHTML =
      all.length

        ? all.map(x => `

            <div
              class="recent-item"
              style="position:relative;"
            >

              <div
                style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:10px;
                "
              >

                <b>
                  ${x.sign}
                  ${fmt(x.qty)}
                  —
                  ${esc(
                    getName(
                      db.foods,
                      x.foodId
                    )
                  )}
                </b>

                <div style="display:flex;align-items:center;gap:7px;flex:0 0 auto;">
                  <button
                    type="button"
                    class="recent-edit-button"
                    data-edit-recent="${esc(String(x.id))}"
                    style="
                      border:1px solid #0b3a63;
                      background:#fff;
                      color:#0b3a63;
                      border-radius:7px;
                      padding:5px 9px;
                      font-size:12px;
                      font-weight:900;
                      cursor:pointer;
                    "
                  >
                    ✏️ Editar
                  </button>

                  <button
                    type="button"
                    class="recent-delete-button"
                    data-delete-recent="${esc(String(x.id))}"
                    style="
                      border:1px solid #dc2626;
                      background:#fff;
                      color:#dc2626;
                      border-radius:7px;
                      padding:5px 9px;
                      font-size:12px;
                      font-weight:900;
                      cursor:pointer;
                    "
                  >
                    🗑️ Excluir
                  </button>
                </div>

              </div>

              <small>
                ${x.kind}
                •
                ${esc(
                  getName(
                    db.origins,
                    x.originId
                  )
                )}
                •
                ${fmtDate(x.date)}
                •
                👤 ${esc(getMovementUserName(x))}
              </small>

            </div>

          `).join("")

        : `
          <div class="empty">
            Nenhum lançamento ainda.
          </div>
        `;

    document
      .querySelectorAll("[data-edit-recent]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () =>
            openRecentEditModal(
              button.dataset.editRecent
            )
        );

      });

    document
      .querySelectorAll("[data-delete-recent]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () =>
            deleteRecentLaunch(
              button.dataset.deleteRecent
            )
        );

      });

  }

}


// ============================================================
// ESTORNAR ÚLTIMO LANÇAMENTO
// ============================================================

async function deleteMatchingHistoryRecord(item, isEntry) {

  const type = isEntry
    ? "entrada"
    : (item.type === "perda" ? "perda" : "saida");

  let query = supabaseClient
    .from("historico_movimentacoes")
    .select("id")
    .eq("data", item.date)
    .eq("tipo", type)
    .eq("quantidade", Number(item.qty || 0))
    .order("created_at", { ascending: false })
    .limit(1);

  if (item.originId != null) {
    query = query.eq("origem_id", Number(item.originId));
  }

  if (item.foodId != null) {
    query = query.eq("alimento_id", Number(item.foodId));
  }

  if (item.usuarioId) {
    query = query.eq("usuario_id", item.usuarioId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn(
      "ACE - não foi possível localizar o histórico correspondente:",
      error
    );
    return;
  }

  const historyId = data?.[0]?.id;

  if (historyId == null) {
    return;
  }

  const { error: deleteError } = await supabaseClient
    .from("historico_movimentacoes")
    .delete()
    .eq("id", historyId);

  if (deleteError) {
    console.warn(
      "ACE - não foi possível excluir o histórico correspondente:",
      deleteError
    );
  }
}


async function deleteRecentLaunch(id) {

  const entry = db.entries.find(
    x => String(x.id) === String(id)
  );

  const movement = db.movements.find(
    x => String(x.id) === String(id)
  );

  const item = entry || movement;
  const isEntry = Boolean(entry);

  if (!item) {
    toast("Lançamento não encontrado.");
    return;
  }

  const foodName = getName(db.foods, item.foodId);
  const qty = fmt(item.qty);

  const stockText = isEntry
    ? "Como este lançamento é uma Entrada, essa quantidade será retirada do estoque."
    : "Como este lançamento é uma Saída/Perda, essa quantidade voltará automaticamente para o estoque.";

  const confirmed = await showAceConfirm(
    `Excluir o lançamento de ${qty} — ${foodName}?

${stockText}`,
    "🗑️ Excluir lançamento"
  );

  if (confirmed === false) {
    return;
  }

  try {

    if (isEntry) {
      await deleteEntry(item.id);
    } else {
      await deleteMovement(item.id);
    }

    await deleteMatchingHistoryRecord(item, isEntry);
    await reloadFromSupabase();
    renderAll();

    showAceSuccess(
      isEntry
        ? "Lançamento de entrada excluído com sucesso. Estoque atualizado."
        : "Lançamento excluído com sucesso. Quantidade devolvida ao estoque."
    );

  } catch (error) {

    console.error(
      "ACE - ERRO AO EXCLUIR ÚLTIMO LANÇAMENTO:",
      error
    );

    toast(
      "Não foi possível excluir o lançamento: " +
      (error?.message || "verifique o Supabase.")
    );
  }
}


// ============================================================
// EDITAR ÚLTIMO LANÇAMENTO
// ============================================================

function closeRecentEditModal() {
  document.getElementById("aceRecentEditModal")?.remove();
}

function openRecentEditModal(id) {

  closeRecentEditModal();

  const item =
    db.entries.find(x => String(x.id) === String(id)) ||
    db.movements.find(x => String(x.id) === String(id));

  if (!item) {
    toast("Lançamento não encontrado.");
    return;
  }

  const isEntry = db.entries.some(
    x => String(x.id) === String(id)
  );

  const modal = document.createElement("div");

  modal.id = "aceRecentEditModal";

  modal.innerHTML = `

    <div
      style="
        position:fixed;
        inset:0;
        z-index:1000001;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(0,35,70,.62);
        backdrop-filter:blur(3px);
      "
    >

      <div
        style="
          width:min(500px,calc(100vw - 30px));
          max-height:90vh;
          overflow:auto;
          box-sizing:border-box;
          padding:24px;
          border-radius:18px;
          background:#fff;
          color:#172b3a;
          box-shadow:0 18px 50px rgba(0,0,0,.35);
        "
      >

        <div
          style="
            text-align:center;
            font-size:22px;
            font-weight:900;
            color:#0b3a63;
            margin-bottom:18px;
          "
        >
          ✏️ Editar lançamento
        </div>

        <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
          Data
          <input
            id="recentEditDate"
            type="date"
            value="${esc(item.date || isoToday())}"
            style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
          >
        </label>

        ${
          !isEntry
            ? `
              <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
                Tipo
                <select
                  id="recentEditType"
                  style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
                >
                  <option value="saida" ${item.type === "saida" ? "selected" : ""}>Saída</option>
                  <option value="perda" ${item.type === "perda" ? "selected" : ""}>Perda</option>
                </select>
              </label>
            `
            : ""
        }

        <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
          Origem
          <select
            id="recentEditOrigin"
            style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
          >
            ${db.origins.map(o => `
              <option value="${o.id}" ${Number(item.originId) === Number(o.id) ? "selected" : ""}>
                ${esc(o.name)}
              </option>
            `).join("")}
          </select>
        </label>

        <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
          Alimento
          <select
            id="recentEditFood"
            style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
          >
            ${db.foods.map(f => `
              <option value="${f.id}" ${Number(item.foodId) === Number(f.id) ? "selected" : ""}>
                ${esc(f.name)}
              </option>
            `).join("")}
          </select>
        </label>

        <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
          Quantidade
          <input
            id="recentEditQty"
            type="number"
            min="0.01"
            step="0.01"
            value="${esc(item.qty)}"
            style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
          >
        </label>

        ${
          !isEntry
            ? `
              <label
                id="recentEditReasonWrap"
                style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;"
              >
                Motivo
                <select
                  id="recentEditReason"
                  style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
                >
                  <option value="">Selecione...</option>
                  ${db.reasons.map(r => `
                    <option value="${esc(r.id)}" ${String(item.reasonId) === String(r.id) ? "selected" : ""}>
                      ${esc(r.name)}
                    </option>
                  `).join("")}
                </select>
              </label>
            `
            : ""
        }

        <label style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-weight:800;">
          ${isEntry ? "Observação" : "Observação / destino"}
          <input
            id="recentEditNote"
            type="text"
            value="${esc(item.note || "")}"
            style="padding:11px;border:1px solid #d0d5dd;border-radius:9px;font-size:15px;box-sizing:border-box;"
          >
        </label>

        <div
          id="recentEditError"
          style="
            display:none;
            margin-top:8px;
            padding:10px;
            border-radius:9px;
            background:#fdeceb;
            color:#b42318;
            font-weight:800;
            font-size:13px;
          "
        ></div>

        <div
          style="
            display:flex;
            justify-content:center;
            gap:10px;
            margin-top:18px;
          "
        >

          <button
            id="recentEditSave"
            type="button"
            style="
              border:0;
              border-radius:9px;
              padding:12px 18px;
              background:#0b3a63;
              color:#fff;
              font-weight:900;
              cursor:pointer;
            "
          >
            💾 Salvar
          </button>

          <button
            id="recentEditCancel"
            type="button"
            style="
              border:1px solid #0b3a63;
              border-radius:9px;
              padding:12px 18px;
              background:#fff;
              color:#0b3a63;
              font-weight:900;
              cursor:pointer;
            "
          >
            Cancelar
          </button>

        </div>

      </div>

    </div>

  `;

  document.body.appendChild(modal);

  const typeSelect =
    document.getElementById("recentEditType");

  const reasonWrap =
    document.getElementById("recentEditReasonWrap");

  const updateReasonVisibility = () => {
    if (!typeSelect || !reasonWrap) return;
    reasonWrap.style.display =
      typeSelect.value === "perda"
        ? "flex"
        : "none";
  };

  if (typeSelect) {
    typeSelect.addEventListener(
      "change",
      updateReasonVisibility
    );
    updateReasonVisibility();
  }

  document
    .getElementById("recentEditCancel")
    .onclick =
      closeRecentEditModal;

  document
    .getElementById("recentEditSave")
    .onclick =
      () =>
        saveRecentEdit(
          id,
          isEntry
        );

}

async function saveRecentEdit(id, isEntry) {

  const error =
    document.getElementById(
      "recentEditError"
    );

  const button =
    document.getElementById(
      "recentEditSave"
    );

  const date =
    document.getElementById(
      "recentEditDate"
    )?.value;

  const originId =
    document.getElementById(
      "recentEditOrigin"
    )?.value;

  const foodId =
    document.getElementById(
      "recentEditFood"
    )?.value;

  const qty =
    Number(
      document.getElementById(
        "recentEditQty"
      )?.value
    );

  const note =
    document.getElementById(
      "recentEditNote"
    )?.value
      ?.trim() || "";

  const type =
    document.getElementById(
      "recentEditType"
    )?.value ||
    "saida";

  const reasonId =
    document.getElementById(
      "recentEditReason"
    )?.value ||
    "";

  const original =
    db.entries.find(
      x => String(x.id) === String(id)
    ) ||
    db.movements.find(
      x => String(x.id) === String(id)
    );

  if (!original) {
    error.textContent =
      "Lançamento não encontrado.";
    error.style.display = "block";
    return;
  }

  if (
    !date ||
    !originId ||
    !foodId ||
    !Number.isFinite(qty) ||
    qty <= 0
  ) {
    error.textContent =
      "Preencha data, origem, alimento e quantidade corretamente.";
    error.style.display = "block";
    return;
  }

  if (!isEntry && type === "perda" && !reasonId) {
    error.textContent =
      "Selecione o motivo da perda.";
    error.style.display = "block";
    return;
  }

  if (!isEntry) {
    const st = calcStock();

    if (
      st[original.originId] &&
      st[original.originId][original.foodId] != null
    ) {
      st[original.originId][original.foodId] +=
        Number(original.qty || 0);
    }

    const available =
      Number(
        st[originId]?.[foodId] || 0
      );

    if (qty > available) {
      error.textContent =
        `Saldo insuficiente. Disponível para essa correção em ${getName(db.origins, originId)}: ${fmt(available)}.`;
      error.style.display = "block";
      return;
    }
  }

  error.style.display = "none";
  button.disabled = true;
  button.textContent = "Salvando...";

  try {

    if (isEntry) {

      await updateEntry({
        id,
        date,
        originId,
        foodId,
        qty,
        note
      });

    } else {

      await updateMovement({
        id,
        type,
        date,
        originId,
        foodId,
        qty,
        reasonId,
        note
      });

    }

    document
      .getElementById("aceRecentEditModal")
      ?.remove();

    await reloadFromSupabase();

    toast("Lançamento corrigido com sucesso.");

  } catch (err) {

    console.error(
      "ACE - ERRO AO EDITAR LANÇAMENTO:",
      err
    );

    error.textContent =
      err?.message ||
      "Não foi possível corrigir o lançamento.";

    error.style.display = "block";

    button.disabled = false;
    button.textContent = "💾 Salvar";

  }

}


// ============================================================
// 10. ENTRADAS
// ============================================================

function ensureEntryHistoryControls() {

  const tableEl =
    document.getElementById(
      "entriesTable"
    );

  if (!tableEl) return;


  // ----------------------------------------------------------
  // ESTILO DA JANELA:
  // máximo visual equivalente a 10 entradas.
  // A partir da 11ª aparece rolagem vertical.
  // ----------------------------------------------------------

  if (
    !document.getElementById(
      "aceEntryHistoryStyle"
    )
  ) {

    const style =
      document.createElement(
        "style"
      );

    style.id =
      "aceEntryHistoryStyle";

    style.textContent = `

      #entryHistoryControls{
        display:flex;
        flex-wrap:wrap;
        align-items:flex-end;
        gap:12px;
        margin:0 0 16px;
      }

      #entryHistoryControls .entry-history-field{
        display:flex;
        flex-direction:column;
        gap:6px;
        min-width:210px;
        color:#102a43;
        font-weight:900;
      }

      #entryHistoryControls input{
        min-height:46px;
        box-sizing:border-box;
        padding:9px 12px;
        border:1px solid #ccd9e4;
        border-radius:10px;
        background:#fff;
        color:#102a43;
        font:inherit;
      }

      #entryHistoryControls button{
        min-height:46px;
        padding:9px 16px;
        border-radius:10px;
        font:inherit;
        font-weight:900;
        cursor:pointer;
      }

      #entryHistoryClear{
        border:1px solid #0756a0;
        background:#fff;
        color:#0756a0;
      }

      #entryHistoryDelete{
        border:1px solid #ef4444;
        background:#fff;
        color:#d92d20;
      }

      #entriesTable .table-wrap{
        max-height:530px;
        overflow-y:auto;
        overflow-x:auto;
        scrollbar-gutter:stable;
      }

      #entriesTable table{
        width:100%;
      }

      #entriesTable thead th{
        position:sticky;
        top:0;
        z-index:2;
        background:#f5f7f9;
      }

      #entriesTable tbody tr{
        height:48px;
      }

    `;

    document.head.appendChild(
      style
    );

  }


  if (
    document.getElementById(
      "entryHistoryControls"
    )
  ) {
    return;
  }


  const controls =
    document.createElement(
      "div"
    );

  controls.id =
    "entryHistoryControls";

  controls.innerHTML = `

    <label class="entry-history-field">
      Filtrar por data
      <input
        id="entryHistoryDateFilter"
        type="date"
        value="${isoToday()}"
      >
    </label>

    <button
      id="entryHistoryClear"
      type="button"
    >
      Limpar filtro
    </button>

    <button
      id="entryHistoryDelete"
      type="button"
    >
      🗑️ Excluir Histórico
    </button>

  `;


  tableEl.parentElement?.insertBefore(
    controls,
    tableEl
  );


  document
    .getElementById(
      "entryHistoryDateFilter"
    )
    ?.addEventListener(
      "change",
      renderEntries
    );


  document
    .getElementById(
      "entryHistoryDateFilter"
    )
    ?.addEventListener(
      "input",
      renderEntries
    );


  document
    .getElementById(
      "entryHistoryClear"
    )
    ?.addEventListener(
      "click",
      () => {

        const input =
          document.getElementById(
            "entryHistoryDateFilter"
          );

        if (input) {
          input.value = "";
        }

        renderEntries();

      }
    );


  document
    .getElementById(
      "entryHistoryDelete"
    )
    ?.addEventListener(
      "click",
      deleteEntryHistoryOnly
    );

}


async function deleteEntryHistoryOnly() {

  const date =
    document.getElementById(
      "entryHistoryDateFilter"
    )?.value || "";


  const message =
    date
      ? (
          "Excluir apenas o histórico de ENTRADAS da data " +
          fmtDate(date) +
          "?\n\nO estoque NÃO será alterado."
        )
      : (
          "Excluir TODO o histórico exibido em Entradas do dia?\n\n" +
          "O estoque NÃO será alterado."
        );


  const ok =
    await showAceConfirm(
      message,
      "🗑️ Excluir histórico de entradas"
    );


  if (!ok) return;


  const button =
    document.getElementById(
      "entryHistoryDelete"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Excluindo...";
  }


  try {

    let query =
      supabaseClient
        .from(
          "historico_movimentacoes"
        )
        .delete()
        .eq(
          "tipo",
          "entrada"
        );


    if (date) {
      query =
        query.eq(
          "data",
          date
        );
    }


    const {
      error
    } =
      await query;


    if (error) {
      throw error;
    }


    // Recarrega somente os dados.
    // As entradas reais permanecem na tabela "entradas",
    // portanto o cálculo do estoque não muda.
    db =
      await loadFromSupabase(
        false
      );

    renderAll();

    showAceSuccess(
      "Histórico de entradas excluído com sucesso!"
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO EXCLUIR HISTÓRICO DE ENTRADAS:",
      error
    );

    await showAceConfirm(
      "Não foi possível excluir o histórico de entradas.\n\n" +
      (
        error?.message ||
        "Erro desconhecido."
      ),
      "❌ Erro"
    );


  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "🗑️ Excluir Histórico";
    }

  }

}


function renderEntries() {

  ensureEntryHistoryControls();


  const date =
    document.getElementById(
      "entryHistoryDateFilter"
    )?.value || "";


  // ==========================================================
  // IMPORTANTE:
  // Esta janela passa a mostrar o HISTÓRICO independente das
  // entradas, e não a tabela que calcula o estoque.
  //
  // Dessa forma é possível excluir o histórico desta janela
  // sem apagar a entrada real e sem modificar o estoque.
  // ==========================================================

  const arr =
    (db.history || [])
      .filter(
        x =>
          x.type === "entrada" &&
          (
            !date ||
            x.date === date
          )
      )
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  const total =
    arr.reduce(
      (sum, item) =>
        sum +
        Number(
          item.qty || 0
        ),
      0
    );


  const totalEl =
    document.getElementById(
      "entryDayTotal"
    );


  if (totalEl) {

    totalEl.textContent =
      `Total: ${fmt(total)}`;

  }


  const tableEl =
    document.getElementById(
      "entriesTable"
    );


  if (tableEl) {

    tableEl.innerHTML =
      table(
        arr,
        [
          [
            "Data",
            x =>
              fmtDate(
                x.date
              )
          ],
          [
            "Origem",
            x =>
              esc(
                getName(
                  db.origins,
                  x.originId
                )
              )
          ],
          [
            "Alimento",
            x =>
              esc(
                getName(
                  db.foods,
                  x.foodId
                )
              )
          ],
          [
            "Qtd",
            x =>
              fmt(
                x.qty
              )
          ],
          [
            "Obs.",
            x =>
              esc(
                x.note || ""
              )
          ]
        ],
        null
      );

  }

}


// ============================================================
// 11. MOVIMENTAÇÕES
// ============================================================


function isBasketMovementRecord(item) {

  return (
    item?.type === "saida" &&
    String(
      item?.note || ""
    ).startsWith("Cesta: ")
  );

}


function getBasketTypeFromMovement(item) {

  if (!isBasketMovementRecord(item)) {
    return "";
  }

  const note =
    String(
      item.note || ""
    );

  const withoutPrefix =
    note.replace(
      /^Cesta:\s*/,
      ""
    );

  const parts =
    withoutPrefix.split("|");

  return (
    parts[0]?.trim() ||
    ""
  );

}


function getMovementReasonDisplay(item) {

  if (isBasketMovementRecord(item)) {
    return "Cesta";
  }

  return getName(
    db.reasons,
    item.reasonId
  );

}


function getMovementObservationDisplay(item) {

  // Saída automática de cesta:
  // OBS deve ficar vazia.
  if (isBasketMovementRecord(item)) {
    return "";
  }

  // Saída/Perda manual:
  // mantém a observação digitada pelo usuário.
  return item.note || "";

}


function renderMovements() {

  const source =
    db.movements
      .slice()
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(
            a.createdAt
          )
      );


  // ========================================================
  // AGRUPA SOMENTE AS MOVIMENTAÇÕES GERADAS POR CESTAS.
  //
  // Exemplo:
  // 1 Cesta dos Funcionários + depois mais 1 cesta
  // pelo mesmo usuário/destino no mesmo dia:
  //
  // Arroz 1 + Arroz 1 = Arroz 2
  //
  // Movimentações manuais de Saída/Perda continuam
  // aparecendo exatamente como antes.
  // ========================================================

  const groupedBasket =
    new Map();

  const normalMovements =
    [];


  source.forEach(item => {

    const isBasketMovement =
      item.type === "saida" &&
      String(
        item.note || ""
      ).startsWith("Cesta: ");


    if (!isBasketMovement) {

      normalMovements.push(item);
      return;

    }


    const key =
      [
        item.date || "",
        item.usuarioId || "",
        item.type || "",
        item.originId || "",
        item.foodId || "",
        item.reasonId || "",
        item.note || ""
      ].join("||");


    if (!groupedBasket.has(key)) {

      groupedBasket.set(
        key,
        {
          ...item,
          qty:
            Number(
              item.qty || 0
            )
        }
      );

      return;
    }


    const current =
      groupedBasket.get(key);

    current.qty +=
      Number(
        item.qty || 0
      );


    if (
      String(
        item.createdAt || ""
      ) >
      String(
        current.createdAt || ""
      )
    ) {

      current.createdAt =
        item.createdAt;

    }

  });


  const arr =
    [
      ...normalMovements,
      ...groupedBasket.values()
    ]
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  const el =
    document.getElementById(
      "movementsTable"
    );


  if (!el) return;


  el.innerHTML =
    table(
      arr,
      [
        [
          "Data",
          x => fmtDate(x.date)
        ],

        [
          "Tipo",
          x =>
            `<span class="pill ${
              x.type === "perda"
                ? "red"
                : "blue"
            }">
              ${
                x.type === "perda"
                  ? "Perda"
                  : "Saída"
              }
            </span>`
        ],

        [
          "Origem",
          x =>
            esc(
              getName(
                db.origins,
                x.originId
              )
            )
        ],

        [
          "Alimento",
          x =>
            esc(
              getName(
                db.foods,
                x.foodId
              )
            )
        ],

        [
          "Qtd",
          x => fmt(x.qty)
        ],

        [
          "Motivo",
          x =>
            esc(
              getMovementReasonDisplay(
                x
              )
            )
        ],

        [
          "Tipo de cesta",
          x =>
            isBasketMovementRecord(x)
              ? esc(
                  getBasketTypeFromMovement(
                    x
                  )
                )
              : "—"
        ],

        [
          "Obs.",
          x =>
            esc(
              getMovementObservationDisplay(
                x
              )
            )
        ]

      ],
      null
    );

}


// ============================================================
// 12. TABELA
// ============================================================

function table(
  arr,
  cols,
  remove
) {

  if (!arr.length) {

    return `
      <div class="empty">
        Nenhum registro encontrado.
      </div>
    `;

  }


  return `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            ${cols
              .map(
                c =>
                  `<th>${c[0]}</th>`
              )
              .join("")}

            ${typeof remove === "function" ? "<th>Ação</th>" : ""}

          </tr>

        </thead>

        <tbody>

          ${arr.map(x => `

            <tr>

              ${cols
                .map(
                  c =>
                    `<td>${c[1](x)}</td>`
                )
                .join("")}

              ${typeof remove === "function" ? `
                <td>
                  <button
                    class="btn danger-btn"
                    data-remove="${x.id}"
                  >
                    Excluir
                  </button>
                </td>
              ` : ""}

            </tr>

          `).join("")}

        </tbody>

      </table>

    </div>

  `;

}


async function removeEntry(id) {

  if (!(await showAceConfirm(
      "Deseja excluir esta entrada?",
      "Excluir entrada"
    ))) return;

  try {
    await deleteEntry(id);
    await reloadFromSupabase();
    toast("Entrada excluída.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível excluir a entrada.");
  }

}


async function removeMovement(id) {

  if (!(await showAceConfirm(
      "Deseja excluir esta movimentação?",
      "Excluir movimentação"
    ))) return;

  try {
    await deleteMovement(id);
    await reloadFromSupabase();
    toast("Movimentação excluída.");
  } catch (error) {
    console.error(error);
    toast("Não foi possível excluir a movimentação.");
  }

}


// ============================================================
// 13. PRESENÇA
// ============================================================

function renderAttendance() {

  ensureAttendancePersonActionsStyle();


  const date =
    document.getElementById(
      "attendanceDate"
    )?.value ||
    isoToday();


  const q =
    (
      document.getElementById(
        "attendanceSearch"
      )?.value ||
      ""
    ).toLowerCase();


  const set =
    new Set(
      db.attendance[date] ||
      []
    );


  const people =
    db.people.filter(
      p =>
        (
          p.name +
          " " +
          p.registration +
          " " +
          (p.ede || "") +
          " " +
          (p.studyDay || "") +
          " " +
          (p.studyTime || "") +
          " " +
          (p.sede || "")
        )
          .toLowerCase()
          .includes(q)
    );


  const count =
    document.getElementById(
      "attendanceCount"
    );


  if (count) {
    count.textContent =
      `${set.size} presentes`;
  }


  const list =
    document.getElementById(
      "attendanceList"
    );


  if (!list) {
    return;
  }


  list.innerHTML =
    people.length
      ? people
          .map(
            p => `

              <div class="attendance-row">

                <div style="min-width:0;flex:1;">

                  <div class="person-name">
                    ${esc(p.name)}
                  </div>

                  <div class="person-reg">
                    Matrícula: ${esc(p.registration)}
                    ${String(p.ede || "").trim() ? ` · EDE: ${esc(p.ede)}` : ""}
                    ${String(p.studyDay || "").trim() ? ` · Dia de Estudo: ${esc(p.studyDay)}` : ""}
                    ${String(p.studyTime || "").trim() ? ` · Horário: ${esc(p.studyTime)}` : ""}
                    ${String(p.sede || "").trim() ? ` · Sede: ${esc(p.sede)}` : ""}
                  </div>

                </div>

                <div class="ace-attendance-actions">

                  <button
                    type="button"
                    class="ace-attendance-edit"
                    data-attendance-edit-person="${p.id}"
                  >
                    ✏️ Editar
                  </button>

                </div>

                <label class="switch ace-attendance-switch-wrap">

                  <input
                    type="checkbox"
                    data-person="${p.id}"
                    ${
                      set.has(p.id)
                        ? "checked"
                        : ""
                    }
                  >

                  <span class="slider"></span>

                </label>

              </div>

            `
          )
          .join("")
      : `
          <div class="empty">
            Nenhuma pessoa cadastrada/encontrada.
          </div>
        `;


  document
    .querySelectorAll(
      "[data-person]"
    )
    .forEach(
      el => {

        el.addEventListener(
          "change",
          async e => {

            const personId =
              e.target
                .dataset
                .person;

            const present =
              e.target
                .checked;

            e.target.disabled =
              true;


            try {

              await setAttendance(
                date,
                personId,
                present
              );

              await reloadFromSupabase();

              toast(
                present
                  ? "Presença registrada."
                  : "Presença removida."
              );


            } catch (error) {

              console.error(
                error
              );

              e.target.checked =
                !present;

              toast(
                "Não foi possível atualizar a presença."
              );


            } finally {

              e.target.disabled =
                false;

            }

          }
        );

      }
    );


  document
    .querySelectorAll(
      "[data-attendance-edit-person]"
    )
    .forEach(
      button => {

        button.onclick =
          () =>
            openAttendancePersonEditModal(
              Number(
                button
                  .dataset
                  .attendanceEditPerson
              )
            );

      }
    );


}


// ============================================================
// 14. ESTOQUE
// ============================================================

function renderStock() {

  const st = calcStock();


  const cards =
    document.getElementById(
      "stockCards"
    );


  if (cards) {

    // ========================================================
    // RESUMO DO ESTOQUE
    //
    // Mostra somente Água Fria no cartão superior,
    // pois é o local onde os alimentos ficam armazenados.
    //
    // IMPORTANTE:
    // O quadro "Consolidado" abaixo continua mostrando
    // todas as origens, inclusive Piedade.
    // ========================================================

    const aguaFria =
      db.origins.find(
        o =>
          normalizeAceText(
            o.name
          ) ===
          "agua fria"
      );


    if (aguaFria) {

      // O cartão "Água Fria" representa o estoque físico total.
      // Por isso, soma o saldo de TODAS as origens do consolidado.
      // Ex.: Água Fria 88 + Piedade 22 = 110 itens.
      const totalEstoqueFisico =
        Object.values(st)
          .reduce(
            (total, originStock) =>
              total +
              Object.values(
                originStock || {}
              ).reduce(
                (sum, value) =>
                  sum + Number(value),
                0
              ),
            0
          );


      cards.innerHTML = `

        <div class="panel">

          <h3>
            📍 Água Fria
          </h3>

          <div class="origin-value">
            ${fmt(totalEstoqueFisico)} itens
          </div>

        </div>

      `;

    } else {

      cards.innerHTML = `
        <div class="empty">
          Origem Água Fria não encontrada.
        </div>
      `;

    }

  }


  const rows =
    db.foods
      .map(food => {

        const vals =
          db.origins.map(
            origin =>
              Number(
                st[origin.id]?.[
                  food.id
                ] || 0
              )
          );


        const total =
          vals.reduce(
            (a, v) =>
              a + v,
            0
          );


        return `

          <tr>

            <td>
              ${esc(food.name)}
            </td>

            ${vals
              .map(
                v =>
                  `<td>${fmt(v)}</td>`
              )
              .join("")}

            <td>
              <b>${fmt(total)}</b>
            </td>

          </tr>

        `;

      })
      .join("");


  const tableEl =
    document.getElementById(
      "stockTable"
    );


  if (tableEl) {

    tableEl.innerHTML = `

      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>Alimento</th>

              ${db.origins
                .map(
                  o =>
                    `<th>${esc(o.name)}</th>`
                )
                .join("")}

              <th>Total</th>

            </tr>

          </thead>

          <tbody>

            ${rows}

          </tbody>

        </table>

      </div>

    `;

  }

}


// ============================================================
// 15. RELATÓRIO
// ============================================================

function renderReport() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value || "";

  const end =
    document.getElementById(
      "reportEnd"
    )?.value || "";

  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value || "";

  // Identificação do usuário que está logado.
  const reportUserName =
    currentUser?.user_metadata?.nome ||
    currentUser?.email ||
    "Usuário não identificado";

  const reportUserEmail =
    currentUser?.email ||
    "";


  const entries =
    db.entries.filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (
          !origin ||
          Number(x.originId) ===
          Number(origin)
        )
    );


  const rawMov =
    db.movements.filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (
          !origin ||
          Number(x.originId) ===
          Number(origin)
        )
    );


  // ========================================================
  // RELATÓRIO - MOVIMENTAÇÕES DE CESTA
  //
  // Agrupa somente movimentações geradas por cesta.
  // Exemplo:
  // Arroz 1 + Arroz 1, mesma cesta/usuário/dia/destino
  // = Arroz 2 em uma única linha.
  //
  // Saídas e perdas manuais continuam separadas.
  // ========================================================

  const groupedBasketMovements =
    new Map();

  const normalMovements =
    [];


  rawMov.forEach(item => {

    const isBasketMovement =
      item.type === "saida" &&
      String(
        item.note || ""
      ).startsWith("Cesta: ");


    if (!isBasketMovement) {

      normalMovements.push(item);
      return;

    }


    const key =
      [
        item.date || "",
        item.usuarioId || "",
        item.type || "",
        item.originId || "",
        item.foodId || "",
        item.reasonId || "",
        item.note || ""
      ].join("||");


    if (
      !groupedBasketMovements.has(
        key
      )
    ) {

      groupedBasketMovements.set(
        key,
        {
          ...item,
          qty:
            Number(
              item.qty || 0
            )
        }
      );

      return;
    }


    const current =
      groupedBasketMovements.get(
        key
      );

    current.qty +=
      Number(
        item.qty || 0
      );


    if (
      String(
        item.createdAt || ""
      ) >
      String(
        current.createdAt || ""
      )
    ) {

      current.createdAt =
        item.createdAt;

    }

  });


  const mov =
    [
      ...normalMovements,
      ...groupedBasketMovements.values()
    ]
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  // ========================================================
  // RELATÓRIO - HISTÓRICO DE CESTAS
  //
  // Agrupa:
  // mesma data + usuário + cesta + origem + destino
  // + recebido por (quando Comunidade).
  // ========================================================

  const basketReportMap =
    new Map();


  (db.basketOutputs || [])
    .filter(
      row =>
        (!start || row.date >= start) &&
        (!end || row.date <= end) &&
        (
          !origin ||
          Number(row.originId) ===
          Number(origin)
        )
    )
    .forEach(row => {

      const key =
        [
          row.date || "",
          row.usuarioId || "",
          row.basketId || "",
          row.originId || "",
          row.destination || "",
          normalizeAceText(
            row.receivedBy || ""
          )
        ].join("||");


      if (
        !basketReportMap.has(key)
      ) {

        basketReportMap.set(
          key,
          {
            ...row,
            basketQty:
              Number(
                row.basketQty || 0
              )
          }
        );

        return;
      }


      const current =
        basketReportMap.get(key);

      current.basketQty +=
        Number(
          row.basketQty || 0
        );


      if (
        String(
          row.createdAt || ""
        ) >
        String(
          current.createdAt || ""
        )
      ) {

        current.createdAt =
          row.createdAt;

      }

    });


  const basketReportRows =
    [...basketReportMap.values()]
      .sort(
        (a, b) =>
          String(
            b.createdAt ||
            b.date ||
            ""
          ).localeCompare(
            String(
              a.createdAt ||
              a.date ||
              ""
            )
          )
      );


  const presentDates =
    Object.entries(
      db.attendance
    ).filter(
      ([d]) =>
        (!start || d >= start) &&
        (!end || d <= end)
    );


  const html = `

    <div style="margin-bottom:16px;padding:12px 16px;border-radius:10px;background:#f2f7fb;border:1px solid #d9e6f0;">
      <strong>👤 Usuário logado:</strong>
      ${esc(reportUserName)}
      ${
        reportUserEmail &&
        reportUserName !== reportUserEmail
          ? ` — ${esc(reportUserEmail)}`
          : ""
      }
    </div>

    <div class="cards">

      <div class="card">

        <span>Entradas</span>

        <strong>
          ${fmt(
            entries.reduce(
              (s, x) =>
                s + Number(x.qty),
              0
            )
          )}
        </strong>

      </div>

      <div class="card">

        <span>Saídas</span>

        <strong>
          ${fmt(
            mov
              .filter(
                x =>
                  x.type === "saida"
              )
              .reduce(
                (s, x) =>
                  s + Number(x.qty),
                0
              )
          )}
        </strong>

      </div>

      <div class="card danger">

        <span>Perdas</span>

        <strong>
          ${fmt(
            mov
              .filter(
                x =>
                  x.type === "perda"
              )
              .reduce(
                (s, x) =>
                  s + Number(x.qty),
                0
              )
          )}
        </strong>

      </div>

      <div class="card">

        <span>Cestas</span>

        <strong>
          ${fmt(
            basketReportRows.reduce(
              (s, x) =>
                s +
                Number(
                  x.basketQty || 0
                ),
              0
            )
          )}
        </strong>

      </div>

      <div class="card">

        <span>Dias com presença</span>

        <strong>
          ${presentDates.length}
        </strong>

      </div>

    </div>

    <h3>Entradas</h3>

    ${
      entries.length

        ? table(
            entries,
            [
              [
                "Data",
                x => fmtDate(x.date)
              ],
              [
                "Origem",
                x =>
                  esc(
                    getName(
                      db.origins,
                      x.originId
                    )
                  )
              ],
              [
                "Alimento",
                x =>
                  esc(
                    getName(
                      db.foods,
                      x.foodId
                    )
                  )
              ],
              [
                "Qtd",
                x => fmt(x.qty)
              ],
              [
                "Obs.",
                x =>
                  esc(
                    x.note || ""
                  )
              ]
            ],
            null
          )

        : `
          <div class="empty">
            Sem entradas no período.
          </div>
        `
    }

    <h3>Saídas e perdas</h3>

    ${
      mov.length

        ? table(
            mov,
            [
              [
                "Data",
                x => fmtDate(x.date)
              ],
              [
                "Tipo",
                x =>
                  esc(
                    x.type === "perda"
                      ? "Perda"
                      : "Saída"
                  )
              ],
              [
                "Origem",
                x =>
                  esc(
                    getName(
                      db.origins,
                      x.originId
                    )
                  )
              ],
              [
                "Alimento",
                x =>
                  esc(
                    getName(
                      db.foods,
                      x.foodId
                    )
                  )
              ],
              [
                "Qtd",
                x => fmt(x.qty)
              ],
              [
                "Motivo",
                x =>
                  esc(
                    getName(
                      db.reasons,
                      x.reasonId
                    )
                  )
              ]
            ],
            null
          )

        : `
          <div class="empty">
            Sem movimentações no período.
          </div>
        `
    }

    <h3>Histórico de saída de cestas</h3>

    ${
      basketReportRows.length

        ? table(
            basketReportRows,
            [
              [
                "Data",
                x =>
                  fmtDate(
                    x.date
                  )
              ],
              [
                "Cesta",
                x =>
                  esc(
                    x.basketName ||
                    "—"
                  )
              ],
              [
                "Destino",
                x =>
                  esc(
                    x.destination ||
                    "—"
                  )
              ],
              [
                "Quantidade",
                x =>
                  fmt(
                    x.basketQty
                  )
              ],
              [
                "Usuário",
                x =>
                  esc(
                    getMovementUserName({
                      usuarioId:
                        x.usuarioId,
                      usuarioNome:
                        x.usuarioNome
                    })
                  )
              ],
              [
                "Recebido por",
                x =>
                  x.destination ===
                    "Comunidade"
                    ? esc(
                        x.receivedBy ||
                        "—"
                      )
                    : ""
              ]
            ],
            null
          )

        : `
          <div class="empty">
            Sem saídas de cestas no período.
          </div>
        `
    }

    <div class="ace-report-signature-section">

      <div class="ace-report-signature-title">
        ✍️ Assinatura
      </div>

      <div class="ace-report-signature-help">
        Assine com o dedo na tela do celular ou com o mouse no computador.
      </div>

      <div class="ace-report-signature-canvas-wrap">

        <canvas
          id="reportSignatureCanvas"
        ></canvas>

      </div>

      <div class="ace-report-signature-name">
        <strong>Responsável:</strong>
        ${esc(getReportResponsibleName())}
      </div>

      <div class="ace-report-signature-actions">

        <button
          type="button"
          id="clearReportSignature"
          class="ace-report-clear-btn"
        >
          🧹 Limpar assinatura
        </button>

        <button
          type="button"
          id="generateReportPDF"
          class="ace-report-pdf-btn"
        >
          📄 Gerar PDF do relatório
        </button>

        <button
          type="button"
          id="shareReportPDF"
          class="ace-report-share-btn"
          disabled
        >
          📤 Compartilhar PDF
        </button>

      </div>

    </div>

  `;

  const reportResult =
    document.getElementById(
      "reportResult"
    );

  if (reportResult) {

    reportResult.innerHTML = html;

    reportSignatureHasInk = false;
    lastGeneratedReportPdfBlob = null;
    lastGeneratedReportPdfName = "";

    setupReportSignatureCanvas();

  }

}

// ============================================================
// 16. CADASTROS
// ============================================================

function ensurePersonExtraFields() {

  const form =
    document.getElementById("personForm");

  if (!form || form.dataset.acePersonExtraFields === "1") {
    return;
  }

  form.dataset.acePersonExtraFields = "1";
  form.classList.add("ace-person-form-expanded");

  const submit =
    form.querySelector('button[type="submit"]');

  const fields =
    document.createElement("div");

  fields.className = "ace-person-extra-fields";

  fields.innerHTML = `
    <label class="ace-person-field">
      <span>Qual EDE</span>
      <input
        name="ede"
        type="text"
        placeholder="Ex.: ESDE 1"
      >
    </label>

    <label class="ace-person-field">
      <span>Dia de Estudo</span>
      <select name="studyDay">
        <option value="">Selecione...</option>
        <option value="Segunda-feira">Segunda-feira</option>
        <option value="Terça-feira">Terça-feira</option>
        <option value="Quarta-feira">Quarta-feira</option>
        <option value="Quinta-feira">Quinta-feira</option>
        <option value="Sexta-feira">Sexta-feira</option>
        <option value="Sábado">Sábado</option>
        <option value="Domingo">Domingo</option>
      </select>
    </label>

    <label class="ace-person-field">
      <span>Horário</span>
      <input
        name="studyTime"
        type="time"
      >
    </label>

    <label class="ace-person-field">
      <span>Sede</span>
      <input
        name="sede"
        type="text"
        placeholder="Ex.: Sede Água Fria"
      >
    </label>
  `;

  if (submit) {
    form.insertBefore(fields, submit);
  } else {
    form.appendChild(fields);
  }

  if (!document.getElementById("acePersonExtraFieldsStyle")) {
    const style = document.createElement("style");
    style.id = "acePersonExtraFieldsStyle";
    style.textContent = `
      #personForm.ace-person-form-expanded{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;
        gap:12px;
        align-items:end;
      }

      #personForm .ace-person-extra-fields{
        grid-column:1 / -1;
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
      }

      #personForm .ace-person-field{
        display:flex;
        flex-direction:column;
        gap:6px;
        color:#344054;
        font-size:13px;
        font-weight:800;
      }

      #personForm .ace-person-field input,
      #personForm .ace-person-field select{
        width:100%;
        min-height:48px;
        box-sizing:border-box;
        padding:10px 12px;
        border:1px solid #d0dbe5;
        border-radius:10px;
        background:#fff;
        color:#172b3a;
        font:inherit;
      }

      @media(max-width:900px){
        #personForm.ace-person-form-expanded{
          grid-template-columns:1fr;
        }
        #personForm .ace-person-extra-fields{
          grid-template-columns:1fr 1fr;
        }
        #personForm.ace-person-form-expanded button[type="submit"]{
          width:100%;
        }
      }

      @media(max-width:600px){
        #personForm .ace-person-extra-fields{
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

function renderCadastros() {

  ensurePersonExtraFields();

  const people =
    document.getElementById(
      "peopleTable"
    );


  if (people) {

    people.innerHTML = `

      <div class="mini-list">

        ${
          db.people
            .map(
              p => `

                <div class="mini-row">

                  <span>

                    <b>
                      ${esc(p.name)}
                    </b>

                    <br>

                    <small>
                      Matrícula: ${esc(p.registration)}
                      ${p.ede ? `<br>EDE: ${esc(p.ede)}` : ""}
                      ${p.studyDay ? `<br>Dia de Estudo: ${esc(p.studyDay)}` : ""}
                      ${p.studyTime ? `<br>Horário: ${esc(p.studyTime)}` : ""}
                      ${p.sede ? `<br>Sede: ${esc(p.sede)}` : ""}
                    </small>

                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-person="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
          ||
          `
            <div class="empty">
              Nenhuma pessoa.
            </div>
          `
        }

      </div>

    `;

  }


  const foods =
    document.getElementById(
      "foodsTable"
    );


  if (foods) {

    foods.innerHTML = `

      <div class="mini-list">

        ${
          db.foods
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-food="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  const origins =
    document.getElementById(
      "originsTable"
    );


  if (origins) {

    origins.innerHTML = `

      <div class="mini-list">

        ${
          db.origins
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-origin="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  const reasons =
    document.getElementById(
      "reasonsTable"
    );


  if (reasons) {

    reasons.innerHTML = `

      <div class="mini-list">

        ${
          db.reasons
            .map(
              p => `

                <div class="mini-row">

                  <span>
                    ${esc(p.name)}
                  </span>

                  <button
                    class="btn danger-btn"
                    data-del-reason="${p.id}"
                  >
                    Excluir
                  </button>

                </div>

              `
            )
            .join("")
        }

      </div>

    `;

  }


  document
    .querySelectorAll(
      "[data-del-person]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "people",
              b.dataset.delPerson
            )
    );


  document
    .querySelectorAll(
      "[data-del-food]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "foods",
              b.dataset.delFood
            )
    );


  document
    .querySelectorAll(
      "[data-del-origin]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "origins",
              b.dataset.delOrigin
            )
    );


  document
    .querySelectorAll(
      "[data-del-reason]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            delBy(
              "reasons",
              b.dataset.delReason
            )
    );

}


async function delBy(key, id) {

  // ==========================================================
  // PESSOAS:
  // Não apaga fisicamente para evitar conflito com registros
  // vinculados. Remove as presenças da pessoa e deixa o cadastro
  // inativo, fazendo a pessoa desaparecer das listas.
  // ==========================================================

  if (key === "people") {

    const person =
      db.people.find(
        p =>
          Number(p.id) ===
          Number(id)
      );


    if (!person) {
      toast("Pessoa não encontrada.");
      return;
    }


    const confirmed =
      await showAceConfirm(
        `Excluir ${person.name}?\n\n` +
        "A pessoa será removida do cadastro e das listas de presença.\n" +
        "As presenças anteriores dessa pessoa também serão removidas.\n\n" +
        "Entradas, saídas, estoque e demais históricos não serão alterados.",
        "Excluir pessoa"
      );


    if (!confirmed) {
      return;
    }


    try {

      await archivePersonAndRemoveAttendance(
        person.id
      );

      await reloadFromSupabase();

      showAceSuccess(
        "✅ Excluído com sucesso!"
      );


    } catch (error) {

      console.error(
        "ACE - ERRO AO EXCLUIR PESSOA:",
        error
      );

      toast(
        "Não foi possível excluir a pessoa: " +
        (
          error?.message ||
          "verifique o Supabase."
        )
      );

    }

    return;
  }


  // ==========================================================
  // DEMAIS CADASTROS:
  // Mantém o comportamento anterior.
  // ==========================================================

  if (!(await showAceConfirm(
      "Excluir cadastro? Registros históricos que já usam este item continuarão salvos.",
      "Excluir cadastro"
    ))) {
      return;
    }


  try {

    await deleteCadastro(
      key,
      id
    );

    await reloadFromSupabase();

    toast(
      "Cadastro excluído."
    );


  } catch (error) {

    console.error(
      error
    );

    toast(
      "Não foi possível excluir o cadastro. Verifique se ele possui registros vinculados."
    );

  }

}


// ============================================================
// 17. CSV
// ============================================================

function csvEscape(v) {

  return `"${String(v ?? "")
    .replace(/"/g, '""')}"`;

}


// ============================================================
// ASSINATURA DO RELATÓRIO + PDF
// ============================================================

let reportSignatureHasInk = false;
let lastGeneratedReportPdfBlob = null;
let lastGeneratedReportPdfName = "";


function ensureReportSignatureStyles() {

  if (
    document.getElementById(
      "aceReportSignatureStyle"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "aceReportSignatureStyle";

  style.textContent = `

    .ace-report-signature-section{
      margin-top:28px;
      padding:20px;
      border:1px solid #d9e4ec;
      border-radius:14px;
      background:#fbfcfd;
    }

    .ace-report-signature-title{
      margin:0 0 8px;
      color:#0b3a63;
      font-size:20px;
      font-weight:900;
    }

    .ace-report-signature-help{
      margin-bottom:14px;
      color:#667085;
      font-size:13px;
    }

    .ace-report-signature-canvas-wrap{
      position:relative;
      width:100%;
      height:190px;
      overflow:hidden;
      border:2px dashed #9db6c8;
      border-radius:12px;
      background:#fff;
      touch-action:none;
    }

    #reportSignatureCanvas{
      display:block;
      width:100%;
      height:100%;
      cursor:crosshair;
      touch-action:none;
    }

    .ace-report-signature-name{
      margin-top:12px;
      color:#344054;
      font-size:14px;
    }

    .ace-report-signature-actions{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      margin-top:16px;
    }

    .ace-report-signature-actions button{
      padding:11px 16px;
      border-radius:10px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-report-clear-btn{
      border:1px solid #b8c7d3;
      background:#fff;
      color:#344054;
    }

    .ace-report-pdf-btn{
      border:1px solid #0b4b7a;
      background:#0b4b7a;
      color:#fff;
    }

    .ace-report-share-btn{
      border:1px solid #1570ef;
      background:#1570ef;
      color:#fff;
    }

    .ace-report-share-btn:disabled{
      opacity:.45;
      cursor:not-allowed;
    }

    .ace-report-pdf-only-signature{
      margin-top:28px;
      page-break-inside:avoid;
      break-inside:avoid;
    }

    .ace-report-pdf-signature-line{
      margin-top:10px;
      color:#344054;
      font-size:14px;
    }

    @media(max-width:700px){
      .ace-report-signature-canvas-wrap{
        height:160px;
      }

      .ace-report-signature-actions{
        flex-direction:column;
      }

      .ace-report-signature-actions button{
        width:100%;
      }
    }

  `;

  document.head.appendChild(style);

}


function getReportResponsibleName() {

  return (
    currentUser?.user_metadata?.nome ||
    currentUser?.email ||
    "Usuário não identificado"
  );

}


function getReportSignatureImage() {

  const canvas =
    document.getElementById(
      "reportSignatureCanvas"
    );

  if (!canvas) {
    return "";
  }

  return canvas.toDataURL(
    "image/png"
  );

}


function setupReportSignatureCanvas() {

  ensureReportSignatureStyles();

  const canvas =
    document.getElementById(
      "reportSignatureCanvas"
    );

  if (!canvas) {
    return;
  }


  const resizeCanvas = () => {

    const rect =
      canvas.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return;
    }

    const ratio =
      window.devicePixelRatio ||
      1;

    const previous =
      reportSignatureHasInk
        ? canvas.toDataURL("image/png")
        : null;

    canvas.width =
      Math.round(
        rect.width * ratio
      );

    canvas.height =
      Math.round(
        rect.height * ratio
      );

    const ctx =
      canvas.getContext("2d");

    ctx.setTransform(
      ratio,
      0,
      0,
      ratio,
      0,
      0
    );

    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";


    if (previous) {

      const img =
        new Image();

      img.onload = () => {

        ctx.drawImage(
          img,
          0,
          0,
          rect.width,
          rect.height
        );

      };

      img.src = previous;

    }

  };


  resizeCanvas();


  let drawing = false;


  const getPoint =
    event => {

      const rect =
        canvas.getBoundingClientRect();

      return {
        x:
          event.clientX -
          rect.left,
        y:
          event.clientY -
          rect.top
      };

    };


  canvas.onpointerdown =
    event => {

      event.preventDefault();

      drawing = true;

      canvas.setPointerCapture?.(
        event.pointerId
      );

      const ctx =
        canvas.getContext("2d");

      const p =
        getPoint(event);

      ctx.beginPath();
      ctx.moveTo(
        p.x,
        p.y
      );

    };


  canvas.onpointermove =
    event => {

      if (!drawing) {
        return;
      }

      event.preventDefault();

      const ctx =
        canvas.getContext("2d");

      const p =
        getPoint(event);

      ctx.lineTo(
        p.x,
        p.y
      );

      ctx.stroke();

      reportSignatureHasInk =
        true;

    };


  const stopDrawing =
    event => {

      drawing = false;

      try {
        canvas.releasePointerCapture?.(
          event.pointerId
        );
      } catch {}

    };


  canvas.onpointerup =
    stopDrawing;

  canvas.onpointercancel =
    stopDrawing;

  canvas.onpointerleave =
    event => {
      if (event.buttons === 0) {
        stopDrawing(event);
      }
    };


  const clearButton =
    document.getElementById(
      "clearReportSignature"
    );

  if (clearButton) {

    clearButton.onclick = () => {

      const ctx =
        canvas.getContext("2d");

      const rect =
        canvas.getBoundingClientRect();

      ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
      );

      reportSignatureHasInk =
        false;

      lastGeneratedReportPdfBlob =
        null;

      lastGeneratedReportPdfName =
        "";

      const shareButton =
        document.getElementById(
          "shareReportPDF"
        );

      if (shareButton) {
        shareButton.disabled = true;
      }

    };

  }


  const pdfButton =
    document.getElementById(
      "generateReportPDF"
    );

  if (pdfButton) {

    pdfButton.onclick =
      generateSignedReportPDF;

  }


  const shareButton =
    document.getElementById(
      "shareReportPDF"
    );

  if (shareButton) {

    shareButton.onclick =
      shareSignedReportPDF;

  }

}


function loadExternalScriptOnce(
  src,
  globalCheck
) {

  return new Promise(
    (resolve, reject) => {

      if (
        typeof globalCheck === "function" &&
        globalCheck()
      ) {
        resolve();
        return;
      }


      const existing =
        [...document.scripts]
          .find(
            script =>
              script.src === src
          );


      if (existing) {

        existing.addEventListener(
          "load",
          resolve,
          {
            once: true
          }
        );

        existing.addEventListener(
          "error",
          () =>
            reject(
              new Error(
                "Não foi possível carregar a biblioteca do PDF."
              )
            ),
          {
            once: true
          }
        );

        return;
      }


      const script =
        document.createElement("script");

      script.src = src;
      script.async = true;

      script.onload = resolve;

      script.onerror =
        () =>
          reject(
            new Error(
              "Não foi possível carregar a biblioteca do PDF."
            )
          );

      document.head.appendChild(
        script
      );

    }
  );

}


async function ensureHtml2PdfLibrary() {

  await loadExternalScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
    () =>
      typeof window.html2pdf ===
      "function"
  );

}


function buildReportPdfElement() {

  const reportResult =
    document.getElementById(
      "reportResult"
    );

  if (!reportResult) {
    throw new Error(
      "Relatório não encontrado."
    );
  }


  const clone =
    reportResult.cloneNode(
      true
    );


  // Remove a área interativa de assinatura do clone.
  clone
    .querySelectorAll(
      ".ace-report-signature-section"
    )
    .forEach(
      element =>
        element.remove()
    );


  const signatureImage =
    getReportSignatureImage();


  const signed =
    document.createElement("div");

  signed.className =
    "ace-report-pdf-only-signature";

  signed.innerHTML = `

    <hr
      style="
        border:0;
        border-top:1px solid #d9e4ec;
        margin:24px 0 18px;
      "
    >

    <div
      style="
        font-size:18px;
        font-weight:900;
        color:#0b3a63;
        margin-bottom:10px;
      "
    >
      Assinatura do responsável
    </div>

    <div
      style="
        width:100%;
        height:130px;
        display:flex;
        align-items:center;
        justify-content:center;
        border-bottom:1px solid #344054;
        background:#fff;
      "
    >
      <img
        src="${signatureImage}"
        alt="Assinatura"
        style="
          max-width:95%;
          max-height:120px;
          object-fit:contain;
        "
      >
    </div>

    <div class="ace-report-pdf-signature-line">
      <strong>Nome:</strong>
      ${esc(getReportResponsibleName())}
    </div>

    <div class="ace-report-pdf-signature-line">
      <strong>Data:</strong>
      ${fmtDate(isoToday())}
    </div>

  `;


  clone.appendChild(
    signed
  );


  // Melhora impressão em PDF.
  clone.style.background = "#fff";
  clone.style.padding = "20px";
  clone.style.color = "#111827";


  return clone;

}


async function generateSignedReportPDF() {

  if (!reportSignatureHasInk) {

    await showAceConfirm(
      "Assine o relatório antes de gerar o PDF.",
      "✍️ Assinatura obrigatória"
    );

    return;
  }


  const button =
    document.getElementById(
      "generateReportPDF"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Gerando PDF...";
  }


  let printHost = null;


  try {

    await ensureHtml2PdfLibrary();


    const element =
      buildReportPdfElement();


    // ========================================================
    // CORREÇÃO DO PDF EM BRANCO
    //
    // O html2canvas pode gerar páginas vazias quando recebe
    // um clone que nunca entrou no DOM. Colocamos o conteúdo
    // temporariamente em um container REAL no documento,
    // fora da área visível da tela, e só depois geramos o PDF.
    // ========================================================

    printHost =
      document.createElement("div");

    printHost.id =
      "aceReportPdfHost";

    printHost.style.position =
      "fixed";

    printHost.style.left =
      "0";

    printHost.style.top =
      "0";

    printHost.style.width =
      "794px";

    printHost.style.background =
      "#ffffff";

    printHost.style.zIndex =
      "-9999";

    printHost.style.pointerEvents =
      "none";

    printHost.style.opacity =
      "1";

    printHost.style.display =
      "block";


    element.style.width =
      "760px";

    element.style.maxWidth =
      "760px";

    element.style.boxSizing =
      "border-box";

    element.style.background =
      "#ffffff";

    element.style.color =
      "#111827";

    element.style.margin =
      "0";

    element.style.marginLeft =
      "0";

    element.style.marginRight =
      "0";

    element.style.transform =
      "none";

    element.style.position =
      "relative";

    element.style.left =
      "0";

    element.style.right =
      "auto";


    // ========================================================
    // AJUSTES DE LAYOUT PARA A4
    // ========================================================

    // Remove deslocamentos herdados do layout da tela.
    element
      .querySelectorAll(
        ".panel, .page, .content, .container, .table-wrap"
      )
      .forEach(node => {

        node.style.marginLeft = "0";
        node.style.marginRight = "0";
        node.style.transform = "none";
        node.style.left = "0";
        node.style.right = "auto";

      });


    // Cartões do resumo: em PDF ficam em 3 colunas,
    // evitando que a última coluna saia para fora da página.
    element
      .querySelectorAll(
        ".cards"
      )
      .forEach(cards => {

        cards.style.display =
          "grid";

        cards.style.gridTemplateColumns =
          "repeat(3, minmax(0, 1fr))";

        cards.style.gap =
          "10px";

        cards.style.width =
          "100%";

        cards.style.boxSizing =
          "border-box";

      });


    element
      .querySelectorAll(
        ".card"
      )
      .forEach(card => {

        card.style.minWidth =
          "0";

        card.style.width =
          "auto";

        card.style.boxSizing =
          "border-box";

      });


    // Tabelas ocupam somente a largura disponível do A4.
    element
      .querySelectorAll(
        ".table-wrap"
      )
      .forEach(node => {

        node.style.width =
          "100%";

        node.style.maxWidth =
          "100%";

        node.style.overflow =
          "visible";

        node.style.boxSizing =
          "border-box";

      });


    element
      .querySelectorAll(
        "table"
      )
      .forEach(node => {

        node.style.width =
          "100%";

        node.style.maxWidth =
          "100%";

        node.style.tableLayout =
          "fixed";

        node.style.borderCollapse =
          "collapse";

      });


    // Quebra textos longos dentro das células em vez de cortar.
    element
      .querySelectorAll(
        "th, td"
      )
      .forEach(cell => {

        cell.style.whiteSpace =
          "normal";

        cell.style.wordBreak =
          "break-word";

        cell.style.overflowWrap =
          "anywhere";

        cell.style.fontSize =
          "11px";

        cell.style.padding =
          "7px 6px";

      });


    // Evita qualquer conteúdo horizontal ultrapassando a página.
    element
      .querySelectorAll(
        "*"
      )
      .forEach(node => {

        node.style.maxWidth =
          node.style.maxWidth ||
          "100%";

        node.style.boxSizing =
          "border-box";

      });


    printHost.appendChild(
      element
    );

    document.body.appendChild(
      printHost
    );


    // Aguarda o navegador calcular layout/fontes/imagens.
    if (
      document.fonts?.ready
    ) {
      try {
        await document.fonts.ready;
      } catch {}
    }


    await new Promise(
      resolve =>
        requestAnimationFrame(
          () =>
            requestAnimationFrame(
              resolve
            )
        )
    );


    const start =
      document.getElementById(
        "reportStart"
      )?.value || "inicio";

    const end =
      document.getElementById(
        "reportEnd"
      )?.value || "fim";


    const fileName =
      `relatorio_${start}_${end}.pdf`;


    const options = {

      margin:
        [8, 8, 8, 8],

      filename:
        fileName,

      image: {
        type: "jpeg",
        quality: 0.98
      },

      html2canvas: {
        scale: 1.5,
        useCORS: true,
        allowTaint: false,
        backgroundColor:
          "#ffffff",
        logging: false,
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0
      },

      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait"
      },

      pagebreak: {
        mode: [
          "css",
          "legacy"
        ],
        avoid: [
          "tr",
          ".ace-report-pdf-only-signature"
        ]
      }

    };


    const worker =
      window
        .html2pdf()
        .set(options)
        .from(element)
        .toPdf();


    lastGeneratedReportPdfBlob =
      await worker.outputPdf(
        "blob"
      );


    lastGeneratedReportPdfName =
      fileName;


    if (
      !lastGeneratedReportPdfBlob ||
      lastGeneratedReportPdfBlob.size <
        1000
    ) {
      throw new Error(
        "O PDF foi gerado sem conteúdo."
      );
    }


    const url =
      URL.createObjectURL(
        lastGeneratedReportPdfBlob
      );


    const a =
      document.createElement("a");

    a.href = url;
    a.download = fileName;

    document.body.appendChild(a);
    a.click();
    a.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      2000
    );


    const shareButton =
      document.getElementById(
        "shareReportPDF"
      );

    if (shareButton) {
      shareButton.disabled = false;
    }


    toast(
      "PDF do relatório gerado com assinatura."
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO GERAR PDF:",
      error
    );

    await showAceConfirm(
      "Não foi possível gerar o PDF.\n\n" +
      (
        error?.message ||
        "Erro desconhecido."
      ),
      "❌ Erro ao gerar PDF"
    );

  } finally {

    if (printHost) {
      printHost.remove();
    }

    if (button) {
      button.disabled = false;
      button.textContent =
        "📄 Gerar PDF do relatório";
    }

  }

}

async function shareSignedReportPDF() {

  if (
    !lastGeneratedReportPdfBlob ||
    !lastGeneratedReportPdfName
  ) {

    await showAceConfirm(
      "Primeiro gere o PDF do relatório.",
      "Compartilhar relatório"
    );

    return;
  }


  const file =
    new File(
      [
        lastGeneratedReportPdfBlob
      ],
      lastGeneratedReportPdfName,
      {
        type: "application/pdf"
      }
    );


  try {

    if (
      navigator.share &&
      (
        !navigator.canShare ||
        navigator.canShare({
          files: [file]
        })
      )
    ) {

      await navigator.share({
        title:
          "Relatório ACE",
        text:
          "Relatório ACE assinado.",
        files:
          [file]
      });

      return;
    }


    const url =
      URL.createObjectURL(
        lastGeneratedReportPdfBlob
      );

    const a =
      document.createElement("a");

    a.href = url;
    a.download =
      lastGeneratedReportPdfName;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      2000
    );


    await showAceConfirm(
      "Seu navegador não permite compartilhar o PDF diretamente.\n\n" +
      "O arquivo foi baixado para você enviar pelo WhatsApp, e-mail ou outro aplicativo.",
      "📤 Compartilhar relatório"
    );


  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {
      return;
    }

    console.error(
      "ACE - ERRO AO COMPARTILHAR PDF:",
      error
    );

    await showAceConfirm(
      "Não foi possível compartilhar o PDF.\n\n" +
      (
        error?.message ||
        "Erro desconhecido."
      ),
      "❌ Erro ao compartilhar"
    );

  }

}



function exportCSV() {

  const start =
    document.getElementById(
      "reportStart"
    )?.value || "";

  const end =
    document.getElementById(
      "reportEnd"
    )?.value || "";

  const origin =
    document.getElementById(
      "reportOrigin"
    )?.value || "";


  const reportUserName =
    currentUser?.user_metadata?.nome ||
    currentUser?.email ||
    "Usuário não identificado";

  const reportUserEmail =
    currentUser?.email ||
    "";

  const rows = [
    [
      "Usuário logado",
      reportUserName,
      reportUserEmail
    ],
    [],
    [
      "Data",
      "Tipo",
      "Origem",
      "Alimento",
      "Quantidade",
      "Motivo",
      "Observação"
    ]
  ];


  db.entries
    .filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    )
    .forEach(
      x =>
        rows.push([
          x.date,
          "Entrada",
          getName(
            db.origins,
            x.originId
          ),
          getName(
            db.foods,
            x.foodId
          ),
          x.qty,
          "",
          x.note || ""
        ])
    );


  db.movements
    .filter(
      x =>
        (!start || x.date >= start) &&
        (!end || x.date <= end) &&
        (!origin || x.originId === origin)
    )
    .forEach(
      x =>
        rows.push([
          x.date,
          x.type === "perda"
            ? "Perda"
            : "Saída",
          getName(
            db.origins,
            x.originId
          ),
          getName(
            db.foods,
            x.foodId
          ),
          x.qty,
          getName(
            db.reasons,
            x.reasonId
          ),
          x.note || ""
        ])
    );


  const blob =
    new Blob(
      [
        "\ufeff" +
        rows
          .map(
            r =>
              r
                .map(csvEscape)
                .join(";")
          )
          .join("\n")
      ],
      {
        type:
          "text/csv;charset=utf-8"
      }
    );


  download(
    blob,
    `relatorio_${start || "inicio"}_${end || "fim"}.csv`
  );

}


function download(
  blob,
  name
) {

  const a =
    document.createElement(
      "a"
    );

  a.href =
    URL.createObjectURL(blob);

  a.download = name;

  a.click();

  setTimeout(
    () =>
      URL.revokeObjectURL(
        a.href
      ),
    1000
  );

}


// ============================================================
// ZERAR MOVIMENTAÇÕES
// ============================================================

async function resetMovements() {

  console.log("ACE: botão Zerar movimentações clicado.");

  const confirmation =
    await showAceConfirm(
      "Isso irá apagar TODAS as movimentações do sistema:\n\n" +
      "• Entradas\n" +
      "• Saídas\n" +
      "• Perdas\n" +
      "• Presenças\n\n" +
      "Os cadastros NÃO serão apagados:\n" +
      "• Pessoas\n" +
      "• Alimentos\n" +
      "• Origens\n" +
      "• Motivos\n" +
      "• Usuários\n\n" +
      "Deseja continuar?",
      "⚠️ ATENÇÃO!"
    );

  if (!confirmation) {
    return;
  }

  const code =
    await showAceInput(
      "Para confirmar a operação, digite exatamente:\n\nZERAR",
      "Confirmar zeramento"
    );

  if (code !== "ZERAR") {

    await showAceConfirm(
      "Operação cancelada. A confirmação não foi validada.",
      "Operação cancelada"
    );

    return;
  }

  const button =
    document.getElementById("resetMovementsButton");

  if (button) {
    button.disabled = true;
    button.textContent = "⏳ Zerando...";
  }

  try {

    // IMPORTANTE:
    // Não usamos usuário_id aqui porque o estoque é compartilhado
    // entre os usuários do sistema. O objetivo é zerar o movimento
    // geral, preservando todos os cadastros.

    const tables = [
      "entradas",
      "saídas",
      "perdas",
      "presença"
    ];

    for (const tableName of tables) {

      const { error } =
        await supabaseClient
          .from(tableName)
          .delete()
          .not("id", "is", null);

      if (error) {
        throw new Error(
          `Falha ao zerar a tabela ${tableName}: ${error.message}`
        );
      }
    }

    // Recarrega os dados do Supabase.
    await loadFromSupabase(false);

    if (typeof renderAll === "function") {
      renderAll();
    }

    await showAceConfirm(
      "Movimentações zeradas com sucesso!\n\n" +
      "Entradas, saídas, perdas e presenças foram apagadas.\n" +
      "Os cadastros e usuários foram preservados.",
      "✅ Concluído"
    );

  } catch (error) {

    console.error(
      "ACE - ERRO AO ZERAR MOVIMENTAÇÕES:",
      error
    );

    await showAceConfirm(
      "Não foi possível zerar as movimentações.\n\n" +
      (error?.message || "Erro desconhecido."),
      "❌ Erro"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent = "🗑️ Zerar movimentações";
    }

  }

}

// Torna a função acessível pelo botão criado dinamicamente.
window.resetMovements = resetMovements;


// ============================================================
// BOTÃO "ZERAR MOVIMENTAÇÕES" NO MENU
// ============================================================

function setupResetMovementsButton() {

  const tabs =
    document.querySelector(".tabs");

  if (!tabs) {
    console.warn(
      "ACE: menu .tabs não encontrado."
    );
    return;
  }

  if (
    document.getElementById(
      "resetMovementsButton"
    )
  ) {
    return;
  }

  const button =
    document.createElement("button");

  button.id =
    "resetMovementsButton";

  button.type =
    "button";

  button.textContent =
    "🗑️ Zerar movimentações";

  button.style.cssText = `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    flex:0 0 auto;
    visibility:visible;
    opacity:1;
    position:relative;
    z-index:20;
    margin-left:8px;
    padding:10px 14px;
    border-radius:8px;
    cursor:pointer;
    font-weight:800;
    color:#b42318;
    background:#fff1f0;
    border:1px solid #f0b8b4;
    white-space:nowrap;
  `;

  // Usa onclick diretamente para garantir que o botão
  // continue funcionando mesmo sendo criado dinamicamente.
  button.onclick = async function (event) {

    event.preventDefault();
    event.stopPropagation();

    try {
      await window.resetMovements();
    } catch (error) {
      console.error(
        "ACE - ERRO NO BOTÃO ZERAR:",
        error
      );

      await showAceConfirm(
        "Erro ao executar o botão Zerar movimentações:\n\n" +
        (error?.message || "Erro desconhecido."),
        "❌ Erro"
      );
    }

  };

  const cadastrosButton =
    tabs.querySelector(
      '[data-page="cadastros"]'
    );

  if (cadastrosButton) {

    cadastrosButton.insertAdjacentElement(
      "afterend",
      button
    );

  } else {

    tabs.appendChild(button);

  }

}



// ============================================================
// HISTÓRICO GERAL DE MOVIMENTAÇÕES
// ============================================================

function ensureHistoryStyles() {

  if (document.getElementById("aceHistoryStyle")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "aceHistoryStyle";

  style.textContent = `

    #historico{
      padding-bottom:30px;
    }

    .ace-history-header{
      display:flex;
      align-items:flex-end;
      justify-content:space-between;
      gap:16px;
      flex-wrap:wrap;
      margin-bottom:18px;
    }

    .ace-history-title{
      margin:0;
      color:#0b2f55;
      font-size:30px;
      font-weight:900;
    }

    .ace-history-subtitle{
      margin-top:4px;
      color:#667085;
      font-size:14px;
    }

    .ace-history-actions{
      display:flex;
      align-items:flex-end;
      gap:10px;
      flex-wrap:wrap;
    }

    .ace-history-filter{
      display:flex;
      flex-direction:column;
      gap:5px;
      font-weight:800;
      color:#344054;
      font-size:13px;
    }

    .ace-history-filter input{
      min-width:180px;
      padding:10px 12px;
      border:1px solid #cfd9e2;
      border-radius:9px;
      background:#fff;
      color:#172b3a;
      font:inherit;
    }

    .ace-history-btn{
      padding:10px 14px;
      border-radius:9px;
      font-size:14px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-history-clear-filter{
      border:1px solid #0b4b7a;
      background:#fff;
      color:#0b4b7a;
    }

    .ace-history-delete{
      border:1px solid #f0b8b4;
      background:#fff1f0;
      color:#b42318;
    }

    .ace-history-panel{
      padding:18px;
      border:1px solid #d7e0e8;
      border-radius:16px;
      background:#fff;
      box-shadow:0 10px 30px rgba(20,45,70,.07);
    }

    .ace-history-scroll{
      max-height:620px;
      overflow-y:auto;
      overflow-x:auto;
      border:1px solid #e3e9ef;
      border-radius:10px;
    }

    .ace-history-scroll .table-wrap{
      overflow:visible;
    }

    .ace-history-scroll table{
      margin:0;
    }

    .ace-history-scroll thead{
      position:sticky;
      top:0;
      z-index:3;
      background:#f5f7f9;
    }

    @media(max-width:700px){
      .ace-history-title{
        font-size:25px;
      }

      .ace-history-actions{
        width:100%;
      }

      .ace-history-filter,
      .ace-history-filter input,
      .ace-history-btn{
        width:100%;
      }
    }

  `;

  document.head.appendChild(style);
}


function setupHistoryPage() {

  ensureHistoryStyles();

  const tabs = document.querySelector(".tabs");

  if (!tabs) {
    console.warn("ACE: menu .tabs não encontrado para criar Histórico.");
    return;
  }


  // ----------------------------------------------------------
  // Cria o botão Histórico antes de Estoque
  // ----------------------------------------------------------

  let historyTab =
    tabs.querySelector('[data-page="historico"]');

  if (!historyTab) {

    historyTab = document.createElement("button");

    historyTab.type = "button";
    historyTab.className = "tab";
    historyTab.dataset.page = "historico";
    historyTab.innerHTML = "📜 Histórico";

    const stockTab =
      [...tabs.querySelectorAll(".tab")]
        .find(tab =>
          normalizeAceText(tab.textContent)
            .includes("estoque")
        );

    if (stockTab) {
      tabs.insertBefore(historyTab, stockTab);
    } else {
      tabs.appendChild(historyTab);
    }
  }


  // ----------------------------------------------------------
  // Cria a página Histórico
  // ----------------------------------------------------------

  let page =
    document.getElementById("historico");

  if (!page) {

    page = document.createElement("section");

    page.id = "historico";
    page.className = "page";

    page.innerHTML = `

      <div class="ace-history-header">

        <div>
          <h2 class="ace-history-title">
            📜 Histórico
          </h2>

          <div class="ace-history-subtitle">
            Entradas, saídas e perdas registradas no sistema.
          </div>
        </div>

        <div class="ace-history-actions">

          <label class="ace-history-filter">
            Filtrar por data
            <input
              id="historyDateFilter"
              type="date"
            >
          </label>

          <button
            id="historyClearFilter"
            class="ace-history-btn ace-history-clear-filter"
            type="button"
          >
            Limpar filtro
          </button>

          <button
            id="historyDeleteAll"
            class="ace-history-btn ace-history-delete"
            type="button"
          >
            🗑️ Excluir Histórico
          </button>

        </div>

      </div>

      <div class="ace-history-panel">

        <div
          id="historyMovementsTable"
          class="ace-history-scroll"
        ></div>

      </div>

    `;


    const stockTab =
      [...tabs.querySelectorAll(".tab")]
        .find(tab =>
          normalizeAceText(tab.textContent)
            .includes("estoque")
        );

    const stockPageId =
      stockTab?.dataset?.page;

    const stockPage =
      stockPageId
        ? document.getElementById(stockPageId)
        : null;

    if (stockPage?.parentElement) {
      stockPage.parentElement.insertBefore(
        page,
        stockPage
      );
    } else {

      const anyPage =
        document.querySelector(".page");

      if (anyPage?.parentElement) {
        anyPage.parentElement.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    }
  }


  // ----------------------------------------------------------
  // Retira a tabela Movimentações da tela Saída/Perda
  // O Histórico de saída de cestas permanece onde já está.
  // ----------------------------------------------------------

  const oldMovementsTable =
    document.getElementById("movementsTable");

  const oldMovementsPanel =
    oldMovementsTable?.closest(
      ".panel,.box,.section,.card"
    );

  if (
    oldMovementsPanel &&
    oldMovementsPanel.id !== "aceBasketModule"
  ) {
    oldMovementsPanel.style.display = "none";
  }


  const dateInput =
    document.getElementById("historyDateFilter");

  if (
    dateInput &&
    dateInput.dataset.aceBound !== "1"
  ) {

    dateInput.dataset.aceBound = "1";

    dateInput.addEventListener(
      "change",
      renderHistory
    );
  }


  const clearButton =
    document.getElementById("historyClearFilter");

  if (
    clearButton &&
    clearButton.dataset.aceBound !== "1"
  ) {

    clearButton.dataset.aceBound = "1";

    clearButton.addEventListener(
      "click",
      () => {

        const input =
          document.getElementById(
            "historyDateFilter"
          );

        if (input) {
          input.value = "";
        }

        renderHistory();
      }
    );
  }


  const deleteButton =
    document.getElementById("historyDeleteAll");

  if (
    deleteButton &&
    deleteButton.dataset.aceBound !== "1"
  ) {

    deleteButton.dataset.aceBound = "1";

    deleteButton.addEventListener(
      "click",
      deleteHistoryMovements
    );
  }

}


function buildHistoryRows() {

  const source =
    (db?.history || [])
      .slice()
      .sort(
        (a, b) =>
          String(
            b.createdAt || ""
          ).localeCompare(
            String(
              a.createdAt || ""
            )
          )
      );


  // ==========================================================
  // AGRUPAMENTO DO HISTÓRICO DE CESTAS
  //
  // Quando forem lançamentos de cesta com:
  // - mesma data
  // - mesma origem
  // - mesmo tipo de cesta
  // - mesmo alimento
  //
  // as quantidades são somadas e exibidas em uma única linha.
  //
  // EXCEÇÃO:
  // saídas para Comunidade permanecem separadas por pessoa
  // que recebeu a cesta.
  // ==========================================================

  const grouped = [];
  const basketGroups = new Map();


  source.forEach(row => {

    const basketType =
      String(
        row.basketType || "—"
      ).trim();

    const reason =
      String(
        row.reason || ""
      ).trim();

    const isBasket =
      row.type === "saida" &&
      (
        reason.toLowerCase() === "cesta" ||
        (
          basketType &&
          basketType !== "—"
        )
      );


    if (!isBasket) {
      grouped.push(row);
      return;
    }


    const note =
      String(
        row.note || ""
      ).trim();

    const normalizedNote =
      normalizeAceText(note);

    const isCommunity =
      normalizedNote.includes(
        "comunidade"
      );


    // Para Comunidade, mantém separado pelo recebedor.
    // Para os demais destinos, o recebedor não participa
    // da chave de agrupamento.
    let receiverKey = "";

    if (isCommunity) {

      const receiverMatch =
        note.match(
          /recebido\s+por\s*:\s*(.+)$/i
        );

      receiverKey =
        normalizeAceText(
          receiverMatch?.[1] || note
        );

    }


    const key = [
      row.date || "",
      row.type || "",
      row.originId ?? "",
      row.foodId ?? "",
      basketType,
      isCommunity
        ? `comunidade:${receiverKey}`
        : "nao-comunidade"
    ].join("||");


    if (!basketGroups.has(key)) {

      const copy = {
        ...row,
        qty:
          Number(row.qty || 0)
      };

      basketGroups.set(
        key,
        copy
      );

      grouped.push(copy);

      return;
    }


    const existing =
      basketGroups.get(key);

    existing.qty =
      Number(existing.qty || 0) +
      Number(row.qty || 0);


    // Mantém o registro mais recente como referência
    // para ordenação.
    if (
      String(row.createdAt || "") >
      String(existing.createdAt || "")
    ) {
      existing.createdAt =
        row.createdAt;
    }

  });


  return grouped.sort(
    (a, b) =>
      String(
        b.createdAt || ""
      ).localeCompare(
        String(
          a.createdAt || ""
        )
      )
  );

}



// ============================================================
// LIMITA HISTÓRICOS A 10 LINHAS VISÍVEIS
// CORREÇÃO: não mede altura de elementos escondidos.
// Usa altura máxima fixa somente quando houver mais de 10 linhas.
// ============================================================
function applyTenVisibleRows(container, itemSelector, maxHeight) {

  if (!container) return;

  const count =
    container.querySelectorAll(itemSelector).length;

  if (count > 10) {
    container.style.maxHeight = maxHeight;
    container.style.overflowY = "auto";
    container.style.overflowX = "auto";
    container.style.scrollbarGutter = "stable";
  } else {
    container.style.maxHeight = "none";
    container.style.overflowY = "visible";
    container.style.overflowX = "auto";
  }
}


function renderHistory() {

  const target =
    document.getElementById(
      "historyMovementsTable"
    );

  if (!target) {
    return;
  }


  const filterDate =
    document.getElementById(
      "historyDateFilter"
    )?.value || "";


  let rows =
    buildHistoryRows();


  if (filterDate) {
    rows =
      rows.filter(
        row =>
          row.date === filterDate
      );
  }


  target.innerHTML =
    table(
      rows,
      [
        [
          "Data",
          x => fmtDate(x.date)
        ],

        [
          "Tipo",
          x => {

            if (x.type === "entrada") {
              return `<span class="pill" style="background:#ecfdf3;color:#027a48;">Entrada</span>`;
            }

            if (x.type === "perda") {
              return `<span class="pill red">Perda</span>`;
            }

            return `<span class="pill blue">Saída</span>`;
          }
        ],

        [
          "Origem",
          x =>
            esc(
              getName(
                db.origins,
                x.originId
              )
            )
        ],

        [
          "Alimento",
          x =>
            esc(
              getName(
                db.foods,
                x.foodId
              )
            )
        ],

        [
          "Qtd",
          x => fmt(x.qty)
        ],

        [
          "Motivo",
          x => esc(x.reason || "—")
        ],

        [
          "Tipo de cesta",
          x => esc(x.basketType || "—")
        ],

        [
          "Obs.",
          x => esc(x.note || "")
        ]

      ],
      null
    );

  // Mostra no máximo 10 linhas no Histórico geral.
  requestAnimationFrame(() => {
    applyTenVisibleRows(
      target,
      "tbody tr",
      "535px"
    );
  });

}


async function deleteHistoryMovements() {

  const confirmation =
    await showAceConfirm(
      "Tem certeza que deseja excluir todo o Histórico?\n\n" +
      "Serão apagadas SOMENTE as linhas desta janela de Histórico.\n\n" +
      "Entradas, saídas, perdas, estoque, cestas, presenças, cadastros e usuários NÃO serão alterados.",
      "⚠️ Excluir Histórico"
    );


  if (!confirmation) {
    return;
  }


  const button =
    document.getElementById(
      "historyDeleteAll"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Excluindo...";
  }


  try {

    const {
      error
    } =
      await supabaseClient
        .from(
          "historico_movimentacoes"
        )
        .delete()
        .not(
          "id",
          "is",
          null
        );


    if (error) {
      throw error;
    }


    db = await loadFromSupabase(false);

    renderAll();


    await showAceConfirm(
      "Histórico excluído com sucesso.\n\n" +
      "A janela ficou vazia e será alimentada novamente conforme novas entradas, saídas, perdas e cestas forem registradas.",
      "✅ Histórico limpo"
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO EXCLUIR HISTÓRICO:",
      error
    );


    await showAceConfirm(
      "Não foi possível excluir o Histórico.\n\n" +
      (
        error?.message ||
        "Erro desconhecido."
      ),
      "❌ Erro"
    );


  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "🗑️ Excluir Histórico";
    }

  }

}


// ============================================================
// 18. NAVEGAÇÃO
// ============================================================

// ============================================================

function openDefaultMuralAcePage() {

  document
    .querySelectorAll(
      ".tab"
    )
    .forEach(
      x =>
        x.classList.toggle(
          "active",
          x.dataset.page ===
            "muralAce"
        )
    );


  document
    .querySelectorAll(
      ".page"
    )
    .forEach(
      x =>
        x.classList.remove(
          "active"
        )
    );


  const muralPage =
    document.getElementById(
      "muralAce"
    );


  if (muralPage) {
    muralPage.classList.add(
      "active"
    );
  }

}


function nav() {

  document
    .querySelectorAll(
      ".tab,.home-card"
    )
    .forEach(
      b =>
        b.addEventListener(
          "click",
          () => {

            const page =
              b.dataset.page;


            document
              .querySelectorAll(
                ".tab"
              )
              .forEach(
                x =>
                  x.classList.toggle(
                    "active",
                    x.dataset.page === page
                  )
              );


            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                x =>
                  x.classList.remove(
                    "active"
                  )
              );


            const target =
              document.getElementById(
                page
              );


            if (target) {
              target.classList.add(
                "active"
              );
            }


            window.scrollTo({
              top: 0,
              behavior: "smooth"
            });

          }
        )
    );


  const menu =
    document.getElementById(
      "menuButton"
    );


  if (menu) {

    menu.addEventListener(
      "click",
      () => {

        const tabs =
          document.querySelector(
            ".ace-tabs"
          );


        if (tabs) {
          tabs.classList.toggle(
            "menu-open"
          );
        }

      }
    );

  }

}


// ============================================================
// 19. EVENTOS DO APLICATIVO
// ============================================================

function bindEvents() {

  const entryForm = document.getElementById("entryForm");

  if (entryForm) {
    entryForm.addEventListener("submit", async e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const date = f.get("date");
      const originId = f.get("origin");
      const foodId = f.get("foodId");
      const qty = Number(f.get("qty"));
      const note = String(f.get("note") || "").trim();

      if (!date || !originId || !foodId || !Number.isFinite(qty) || qty <= 0) {
        toast("Preencha os dados da entrada corretamente.");
        return;
      }

      const submit = e.target.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;

      try {
        await insertEntry({ date, originId, foodId, qty, note });
        await reloadFromSupabase();
        e.target.reset();
        document.getElementById("entryDate").value = isoToday();
        renderEntries();
        showAceSuccess("Entrada registrada com sucesso!");
      } catch (error) {
        console.error(error);
        toast("Erro na entrada: " + (error?.message || "verifique o Supabase."));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }


  const movementForm = document.getElementById("movementForm");

  if (movementForm) {
    movementForm.addEventListener("submit", async e => {
      e.preventDefault();

      const f = new FormData(e.target);
      const date = f.get("date");
      const type = f.get("type");
      const originId = f.get("origin");
      const foodId = f.get("foodId");
      const qty = Number(f.get("qty"));
      const reasonId = f.get("reasonId");
      const note = String(f.get("note") || "").trim();

      if (!date || !type || !originId || !foodId || !Number.isFinite(qty) || qty <= 0) {
        toast("Preencha os dados da movimentação corretamente.");
        return;
      }

      const st = calcStock();
      const available = Number(st[originId]?.[foodId] || 0);

      if (qty > available) {
        toast(`Saldo insuficiente. Disponível em ${getName(db.origins, originId)}: ${fmt(available)}.`);
        return;
      }

      if (type === "perda" && !reasonId) {
        toast("Selecione o motivo da perda.");
        return;
      }

      const submit = e.target.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;

      try {
        await insertMovement({ date, type, originId, foodId, qty, reasonId, note });
        await reloadFromSupabase();
        e.target.reset();
        document.getElementById("movementDate").value = isoToday();
        renderAll();
        showAceSuccess(type === "perda" ? "Perda registrada com sucesso!" : "Saída registrada com sucesso!");
      } catch (error) {
        console.error(error);
        toast("Erro na movimentação: " + (error?.message || "verifique o Supabase."));
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }


  const dashboardDate = document.getElementById("dashboardDate");
  if (dashboardDate) dashboardDate.addEventListener("change", renderDashboard);

  const entryDate = document.getElementById("entryDate");
  if (entryDate) entryDate.addEventListener("change", renderEntries);

  const attendanceDate = document.getElementById("attendanceDate");
  if (attendanceDate) {
    // Atualiza imediatamente ao escolher uma nova data.
    attendanceDate.addEventListener("change", renderAttendance);
    attendanceDate.addEventListener("input", renderAttendance);
  }

  const attendanceSearch = document.getElementById("attendanceSearch");
  if (attendanceSearch) attendanceSearch.addEventListener("input", renderAttendance);

  const refreshStock = document.getElementById("refreshStock");
  if (refreshStock) {
    refreshStock.addEventListener("click", async () => {
      try {
        await reloadFromSupabase();
        toast("Estoque atualizado.");
      } catch (error) {
        console.error(error);
        toast("Não foi possível atualizar o estoque.");
      }
    });
  }

  const generateReport = document.getElementById("generateReport");
  if (generateReport) generateReport.addEventListener("click", renderReport);

  const exportCSVButton = document.getElementById("exportCSV");
  if (exportCSVButton) exportCSVButton.addEventListener("click", exportCSV);


  ensurePersonExtraFields();

  const personForm = document.getElementById("personForm");
  if (personForm) {
    personForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();
      const registration = String(f.get("registration") || "").trim();
      const ede = String(f.get("ede") || "").trim();
      const studyDay = String(f.get("studyDay") || "").trim();
      const studyTime = String(f.get("studyTime") || "").trim();
      const sede = String(f.get("sede") || "").trim();

      if (!name || !registration) {
        toast("Informe nome e matrícula.");
        return;
      }

      try {
        await insertPerson({
          name,
          registration,
          ede,
          studyDay,
          studyTime,
          sede
        });
        await reloadFromSupabase();
        e.target.reset();
        showAceSuccess("Pessoa cadastrada com sucesso.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar pessoa: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  const foodForm = document.getElementById("foodForm");
  if (foodForm) {
    foodForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o nome do alimento.");
        return;
      }

      try {
        await insertFood(name);
        await reloadFromSupabase();
        e.target.reset();
        toast("Alimento cadastrado no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar alimento: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  const originForm = document.getElementById("originForm");
  if (originForm) {
    originForm.addEventListener("submit", async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o nome da origem.");
        return;
      }

      try {
        await insertOrigin(name);
        await reloadFromSupabase();
        e.target.reset();
        toast("Origem cadastrada no Supabase.");
      } catch (error) {
        console.error(error);
        toast("Erro ao cadastrar origem: " + (error?.message || "verifique o Supabase."));
      }
    });
  }


  // Motivos continuam sendo os quatro padrões do aplicativo.
  // Não há tabela de motivos no esquema utilizado pelo app_corrigido.
  const reasonForm = document.getElementById("reasonForm");
  if (reasonForm) {
    reasonForm.addEventListener("submit", e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();

      if (!name) {
        toast("Informe o motivo.");
        return;
      }

      if (db.reasons.some(r => r.name.toLowerCase() === name.toLowerCase())) {
        toast("Esse motivo já existe.");
        return;
      }

      db.reasons.push({ id: name, name });
      saveLocalReasons();
      e.target.reset();
      renderAll();
      toast("Motivo adicionado nesta sessão.");
    });
  }


  const backupBtn = document.getElementById("backupBtn");
  if (backupBtn) {
    backupBtn.addEventListener("click", () => {
      download(
        new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
        `backup_controle_alimentos_${isoToday()}.json`
      );
    });
  }


  const restoreFile = document.getElementById("restoreFile");
  if (restoreFile) {
    restoreFile.addEventListener("change", async e => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const obj = JSON.parse(await file.text());
        await restoreCloudBackup(obj);
        await reloadFromSupabase();
        toast("Backup restaurado no Supabase.");
      } catch (error) {
        console.error(error);
        await showAceConfirm(
          "Não foi possível restaurar este arquivo no Supabase.\n\n" +
          (error?.message || "Verifique o backup e as permissões."),
          "❌ Erro"
        );
      }

      e.target.value = "";
    });
  }


  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (!(await showAceConfirm(
          "Atualizar os dados deste aparelho com o conteúdo atual do Supabase?",
          "Atualizar dados"
        ))) return;

      try {
        await reloadFromSupabase(true);
      } catch (error) {
        console.error(error);
        toast("Não foi possível atualizar os dados.");
      }
    });
  }

}


async function restoreCloudBackup(obj) {
  if (!obj || !obj.foods || !obj.origins || !obj.entries) {
    throw new Error("Arquivo de backup inválido.");
  }

  const userId = getCurrentUserId();

  // O backup usa o mesmo formato interno que o aplicativo exibe.
  if (Array.isArray(obj.people) && obj.people.length) {
    const rows = obj.people.map(p => ({
      id: Number.isSafeInteger(Number(p.id)) ? Number(p.id) : newNumericId(),
      nome: p.name,
      "matrícula": p.registration,
      ede: p.ede || "",
      dia_estudo: p.studyDay || "",
      horario: p.studyTime || "",
      sede: p.sede || "",
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("Pessoas").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.foods) && obj.foods.length) {
    const rows = obj.foods.map(f => ({
      id: Number.isSafeInteger(Number(f.id)) ? Number(f.id) : newNumericId(),
      nome: f.name,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("Alimentos").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.origins) && obj.origins.length) {
    const rows = obj.origins.map(o => ({
      id: Number.isSafeInteger(Number(o.id)) ? Number(o.id) : newNumericId(),
      nome: o.name,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("origens").upsert(rows);
    if (error) throw error;
  }

  if (Array.isArray(obj.entries) && obj.entries.length) {
    const rows = obj.entries.map(e => ({
      id: Number.isSafeInteger(Number(e.id)) ? Number(e.id) : newNumericId(),
      data_entrada: e.date,
      alimento_id: e.foodId,
      quantidade: Number(e.qty || 0),
      origem_id: e.originId,
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("entradas").upsert(rows);
    if (error) throw error;
  }

  const outputs = (obj.movements || []).filter(m => m.type === "saida");
  if (outputs.length) {
    const rows = outputs.map(m => ({
      id: Number.isSafeInteger(Number(m.rawId)) ? Number(m.rawId) : newNumericId(),
      data_saida: m.date,
      alimento_id: m.foodId,
      quantidade: Number(m.qty || 0),
      origem_id: m.originId,
      destino: m.note || "",
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("saídas").upsert(rows);
    if (error) throw error;
  }

  const losses = (obj.movements || []).filter(m => m.type === "perda");
  if (losses.length) {
    const rows = losses.map(m => ({
      id: Number.isSafeInteger(Number(m.rawId)) ? Number(m.rawId) : newNumericId(),
      data_perda: m.date,
      alimento_id: m.foodId,
      quantidade: Number(m.qty || 0),
      origem_id: m.originId,
      motivo: db.reasons.find(r => r.id === m.reasonId)?.name || m.reasonId || "Outro",
      usuario_id: userId
    }));
    const { error } = await supabaseClient.from("perdas").upsert(rows);
    if (error) throw error;
  }

  // Presença é restaurada sem depender de uma chave composta.
  for (const [date, peopleIds] of Object.entries(obj.attendance || {})) {
    for (const personId of peopleIds || []) {
      await setAttendance(date, personId, true);
    }
  }
}



// ============================================================
// 19.9 MÓDULO DE CESTAS - INTERFACE E EDIÇÃO
// Nesta etapa:
// - NÃO altera o formulário atual de Saída/Perda.
// - Mostra as 3 cestas dentro da página de Saída/Perda.
// - Origem é fixa: Água Fria.
// - Destino: Messejana / Praia do Futuro / Comunidade.
// - Comunidade exibe o campo "Nome da pessoa que recebeu".
// - Permite editar a composição da cesta e salvar no Supabase.
// - O botão "Registrar saída" fica preparado para a próxima etapa.
// ============================================================

function normalizeAceText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}


// ============================================================
// IMAGENS DAS CESTAS
// ============================================================

function getBasketImagePath(basket) {

  const name =
    normalizeAceText(
      basket?.name
    );

  if (name === "vinha de luz") {
    return "cesta-vinha-de-luz.png";
  }

  if (name === "cesta do sopao") {
    return "cesta-sopao.png";
  }

  if (name === "cesta dos funcionarios") {
    return "cesta-funcionarios.png";
  }

  return basket?.image || "";
}


function makeBasketBlackBackgroundTransparent(img) {

  if (
    !img ||
    img.dataset.aceTransparentDone === "1"
  ) {
    return;
  }

  img.dataset.aceTransparentDone = "1";

  try {

    const width = img.naturalWidth;
    const height = img.naturalHeight;

    if (!width || !height) {
      return;
    }

    const canvas =
      document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx =
      canvas.getContext(
        "2d",
        {
          willReadFrequently: true
        }
      );

    if (!ctx) {
      return;
    }

    ctx.drawImage(
      img,
      0,
      0,
      width,
      height
    );

    const imageData =
      ctx.getImageData(
        0,
        0,
        width,
        height
      );

    const data =
      imageData.data;

    const total =
      width * height;

    const visited =
      new Uint8Array(total);

    const queue =
      new Int32Array(total);

    let head = 0;
    let tail = 0;

    const isBackgroundBlack =
      index => {

        const p =
          index * 4;

        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const a = data[p + 3];

        return (
          a > 0 &&
          r <= 35 &&
          g <= 35 &&
          b <= 35
        );

      };


    const add =
      index => {

        if (
          index < 0 ||
          index >= total ||
          visited[index] ||
          !isBackgroundBlack(index)
        ) {
          return;
        }

        visited[index] = 1;
        queue[tail++] = index;

      };


    for (
      let x = 0;
      x < width;
      x++
    ) {

      add(x);

      add(
        (height - 1) *
        width +
        x
      );

    }

    for (
      let y = 0;
      y < height;
      y++
    ) {

      add(
        y * width
      );

      add(
        y * width +
        (width - 1)
      );

    }


    while (
      head < tail
    ) {

      const index =
        queue[head++];

      const x =
        index % width;

      const y =
        Math.floor(
          index / width
        );

      const p =
        index * 4;

      data[p + 3] = 0;

      if (x > 0) {
        add(index - 1);
      }

      if (x < width - 1) {
        add(index + 1);
      }

      if (y > 0) {
        add(index - width);
      }

      if (y < height - 1) {
        add(index + width);
      }

    }


    ctx.putImageData(
      imageData,
      0,
      0
    );

    img.src =
      canvas.toDataURL(
        "image/png"
      );

  } catch (error) {

    console.warn(
      "ACE: não foi possível tornar o fundo da cesta transparente:",
      error
    );

  }

}


function getAguaFriaOrigin() {
  return (db?.origins || []).find(
    origin =>
      normalizeAceText(origin.name) ===
      "agua fria"
  ) || null;
}


function getBasketItems(basketId) {
  return (db?.basketItems || [])
    .filter(
      item =>
        Number(item.basketId) ===
        Number(basketId)
    )
    .map(item => ({
      ...item,
      foodName:
        getName(
          db.foods,
          Number(item.foodId)
        )
    }))
    .sort(
      (a, b) =>
        String(a.foodName).localeCompare(
          String(b.foodName),
          "pt-BR"
        )
    );
}


function ensureBasketStyles() {

  if (
    document.getElementById(
      "aceBasketModuleStyle"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "aceBasketModuleStyle";

  style.textContent = `

    #aceBasketModule{
      margin-top:22px;
      margin-bottom:22px;
      padding:24px;
      border:1px solid #d8e2ea;
      border-radius:18px;
      background:#fff;
      box-shadow:0 8px 24px rgba(16,42,67,.06);
    }

    .ace-basket-module-title{
      margin:0;
      color:#0b3a63;
      font-size:26px;
      font-weight:900;
    }

    .ace-basket-module-subtitle{
      margin:6px 0 18px;
      color:#667085;
      font-size:14px;
    }

    .ace-basket-fixed-origin{
      display:flex;
      align-items:center;
      flex-wrap:wrap;
      gap:8px;
      margin-bottom:20px;
      padding:13px 15px;
      border:1px solid #cfe0ed;
      border-radius:12px;
      background:#f4f9fd;
      color:#17324d;
    }

    .ace-basket-fixed-origin strong{
      color:#0b3a63;
    }

    .ace-basket-grid{
      display:grid;
      grid-template-columns:
        repeat(3,minmax(0,1fr));
      gap:18px;
    }

    .ace-basket-card{
      display:flex;
      flex-direction:column;
      min-width:0;
      overflow:hidden;
      border:1px solid #d8e2ea;
      border-radius:16px;
      background:#fff;
      box-shadow:0 8px 20px rgba(16,42,67,.07);
    }

    .ace-basket-name{
      padding:16px 16px 10px;
      color:#0b3a63;
      text-align:center;
      font-size:20px;
      font-weight:900;
    }

    .ace-basket-image-wrap{
      position:relative;
      display:flex;
      align-items:center;
      justify-content:center;
      height:260px;
      margin:0 16px;
      overflow:hidden;
      border-radius:14px;
      background:transparent;
    }

    .ace-basket-image{
      width:100%;
      height:100%;
      object-fit:contain;
      background:transparent;
    }

    .ace-basket-image-fallback{
      display:none;
      align-items:center;
      justify-content:center;
      width:100%;
      height:100%;
      padding:20px;
      box-sizing:border-box;
      text-align:center;
      color:#667085;
      font-weight:800;
    }

    .ace-basket-body{
      display:flex;
      flex:1;
      flex-direction:column;
      padding:16px;
    }

    .ace-basket-composition-title{
      margin-bottom:8px;
      color:#344054;
      font-size:13px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.03em;
    }

    .ace-basket-composition{
      display:grid;
      gap:7px;
      margin-bottom:14px;
    }

    .ace-basket-composition-row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding:8px 10px;
      border-radius:9px;
      background:#f7f9fb;
      color:#344054;
      font-size:14px;
    }

    .ace-basket-composition-row b{
      color:#0b3a63;
    }

    .ace-basket-edit{
      width:100%;
      margin-bottom:16px;
      padding:10px 12px;
      border:1px solid #0b4b7a;
      border-radius:10px;
      background:#fff;
      color:#0b4b7a;
      font-weight:900;
      cursor:pointer;
    }

    .ace-basket-fields{
      display:grid;
      gap:11px;
      margin-top:auto;
    }

    .ace-basket-field{
      display:flex;
      flex-direction:column;
      gap:6px;
      color:#344054;
      font-size:13px;
      font-weight:900;
    }

    .ace-basket-field input,
    .ace-basket-field select{
      width:100%;
      box-sizing:border-box;
      padding:11px 12px;
      border:1px solid #d3dde5;
      border-radius:10px;
      background:#fff;
      color:#172b3a;
      font-size:15px;
      outline:none;
    }

    .ace-basket-received{
      display:none;
    }

    .ace-basket-received.show{
      display:flex;
    }

    .ace-basket-register{
      width:100%;
      margin-top:13px;
      padding:12px 14px;
      border:0;
      border-radius:10px;
      background:#0b4b7a;
      color:#fff;
      font-size:15px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-basket-register:hover{
      filter:brightness(1.07);
    }

    .ace-basket-note{
      margin-top:12px;
      color:#667085;
      font-size:12px;
      line-height:1.45;
      text-align:center;
    }

    #aceBasketEditModal{
      position:fixed;
      inset:0;
      z-index:1000005;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,35,70,.62);
      backdrop-filter:blur(3px);
    }

    .ace-basket-edit-box{
      width:min(650px,calc(100vw - 34px));
      max-height:88vh;
      overflow:auto;
      box-sizing:border-box;
      padding:24px;
      border-radius:18px;
      background:#fff;
      color:#172b3a;
      box-shadow:0 20px 60px rgba(0,0,0,.30);
    }

    .ace-basket-edit-title{
      margin-bottom:18px;
      color:#0b3a63;
      text-align:center;
      font-size:24px;
      font-weight:900;
    }

    .ace-basket-edit-list{
      display:grid;
      gap:10px;
    }

    .ace-basket-edit-row{
      display:grid;
      grid-template-columns:1fr auto auto auto;
      gap:8px;
      align-items:center;
      padding:10px;
      border:1px solid #e0e7ee;
      border-radius:10px;
      background:#f8fafc;
    }

    .ace-basket-edit-food{
      min-width:0;
      font-weight:800;
    }

    .ace-basket-edit-qty{
      min-width:36px;
      text-align:center;
      font-weight:900;
      color:#0b3a63;
    }

    .ace-basket-small-btn{
      width:34px;
      height:34px;
      border:1px solid #b8c7d3;
      border-radius:8px;
      background:#fff;
      color:#0b3a63;
      font-size:18px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-basket-remove-btn{
      width:34px;
      height:34px;
      border:1px solid #efb5b0;
      border-radius:8px;
      background:#fff3f2;
      color:#b42318;
      font-weight:900;
      cursor:pointer;
    }

    .ace-basket-add-row{
      display:grid;
      grid-template-columns:1fr auto;
      gap:10px;
      margin-top:16px;
    }

    .ace-basket-add-row select{
      min-width:0;
      padding:11px;
      border:1px solid #d3dde5;
      border-radius:10px;
      background:#fff;
    }

    .ace-basket-modal-actions{
      display:flex;
      justify-content:center;
      gap:10px;
      margin-top:20px;
    }

    .ace-basket-modal-actions button{
      min-width:120px;
      padding:11px 15px;
      border-radius:10px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-manual-basket{
      margin-top:28px;
      padding:22px;
      border:1px solid #cfe0ed;
      border-radius:16px;
      background:#f8fbfd;
    }

    .ace-manual-basket-title{
      margin:0;
      color:#0b3a63;
      font-size:23px;
      font-weight:900;
    }

    .ace-manual-basket-subtitle{
      margin:5px 0 18px;
      color:#667085;
      font-size:14px;
      line-height:1.45;
    }

    .ace-manual-basket-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:14px;
    }

    .ace-manual-basket-field{
      display:flex;
      flex-direction:column;
      gap:6px;
      color:#344054;
      font-size:13px;
      font-weight:900;
    }

    .ace-manual-basket-field.full{
      grid-column:1/-1;
    }

    .ace-manual-basket-field input,
    .ace-manual-basket-field select{
      width:100%;
      min-height:44px;
      box-sizing:border-box;
      padding:10px 12px;
      border:1px solid #cfdbe5;
      border-radius:10px;
      background:#fff;
      color:#17324d;
      font:inherit;
    }

    .ace-manual-items-box{
      grid-column:1/-1;
      padding:15px;
      border:1px solid #d8e2ea;
      border-radius:12px;
      background:#fff;
    }

    .ace-manual-items-title{
      margin-bottom:10px;
      color:#0b3a63;
      font-size:15px;
      font-weight:900;
    }

    .ace-manual-item-add{
      display:grid;
      grid-template-columns:1fr 150px auto;
      gap:9px;
      align-items:end;
    }

    .ace-manual-add-btn{
      min-height:44px;
      padding:9px 14px;
      border:0;
      border-radius:9px;
      background:#0b4b7a;
      color:#fff;
      font-weight:900;
      cursor:pointer;
    }

    .ace-manual-items-list{
      display:grid;
      gap:8px;
      margin-top:13px;
    }

    .ace-manual-item-row{
      display:grid;
      grid-template-columns:1fr auto auto;
      gap:10px;
      align-items:center;
      padding:9px 11px;
      border-radius:9px;
      background:#f4f7f9;
    }

    .ace-manual-item-name{
      color:#17324d;
      font-weight:800;
    }

    .ace-manual-item-qty{
      min-width:72px;
      color:#0b3a63;
      text-align:right;
      font-weight:900;
    }

    .ace-manual-remove{
      border:1px solid #dc2626;
      border-radius:8px;
      background:#fff;
      color:#dc2626;
      padding:6px 9px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-manual-empty{
      padding:13px;
      border:1px dashed #ccd8e2;
      border-radius:9px;
      color:#667085;
      text-align:center;
      font-size:13px;
    }

    .ace-manual-register{
      width:100%;
      margin-top:16px;
      padding:13px 15px;
      border:0;
      border-radius:10px;
      background:#0b4b7a;
      color:#fff;
      font-size:15px;
      font-weight:900;
      cursor:pointer;
    }

    .ace-manual-register:disabled{
      opacity:.62;
      cursor:wait;
    }

    .ace-basket-history{
      margin-top:28px;
      padding-top:22px;
      border-top:1px solid #e3eaf0;
    }

    .ace-basket-history-title{
      margin:0 0 14px;
      color:#0b3a63;
      font-size:22px;
      font-weight:900;
    }

    .ace-basket-history-toolbar{
      display:flex;
      align-items:flex-end;
      flex-wrap:wrap;
      gap:10px;
      margin:0 0 14px;
    }

    .ace-basket-history-filter{
      display:flex;
      flex-direction:column;
      gap:5px;
      color:#344054;
      font-size:13px;
      font-weight:900;
    }

    .ace-basket-history-filter input{
      min-width:190px;
      padding:10px 12px;
      border:1px solid #cfdbe5;
      border-radius:9px;
      background:#fff;
      color:#17324d;
      font:inherit;
    }

    .ace-basket-history-action{
      padding:10px 14px;
      border-radius:9px;
      background:#fff;
      font-weight:900;
      cursor:pointer;
    }

    .ace-basket-history-clear{
      border:1px solid #0b4b7a;
      color:#0b4b7a;
    }

    .ace-basket-history-delete-all{
      border:1px solid #dc2626;
      color:#dc2626;
    }

    .ace-basket-history-list{
      display:grid;
      gap:12px;
      padding-right:6px;
    }

    .ace-basket-history-row{
      display:grid;
      grid-template-columns:90px 1fr auto;
      gap:14px;
      align-items:center;
      padding:12px;
      border:1px solid #dfe7ee;
      border-radius:13px;
      background:#fbfcfd;
    }

    .ace-basket-history-image{
      width:90px;
      height:90px;
      object-fit:contain;
      border-radius:10px;
      background:transparent;
    }

    .ace-basket-history-main{
      min-width:0;
    }

    .ace-basket-history-name{
      color:#0b3a63;
      font-size:17px;
      font-weight:900;
    }

    .ace-basket-history-meta{
      margin-top:4px;
      color:#667085;
      font-size:13px;
      line-height:1.45;
    }

    .ace-basket-history-qty{
      min-width:90px;
      text-align:right;
      color:#0b3a63;
      font-size:18px;
      font-weight:900;
    }

    .ace-basket-history-side{
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:9px;
    }

    .ace-basket-history-reverse{
      padding:8px 11px;
      border:1px solid #dc2626;
      border-radius:8px;
      background:#fff;
      color:#dc2626;
      font-size:13px;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
    }


    .ace-basket-save-btn{
      border:1px solid #0b4b7a;
      background:#0b4b7a;
      color:#fff;
    }

    .ace-basket-cancel-btn{
      border:1px solid #0b4b7a;
      background:#fff;
      color:#0b4b7a;
    }

    @media(max-width:1050px){
      .ace-basket-grid{
        grid-template-columns:1fr 1fr;
      }
    }

    @media(max-width:700px){
      #aceBasketModule{
        padding:16px;
      }

      .ace-basket-grid{
        grid-template-columns:1fr;
      }

      .ace-basket-image-wrap{
        height:230px;
      }

      .ace-basket-edit-row{
        grid-template-columns:1fr auto auto auto;
      }

      .ace-manual-basket-grid{
        grid-template-columns:1fr;
      }

      .ace-manual-basket-field.full,
      .ace-manual-items-box{
        grid-column:auto;
      }

      .ace-manual-item-add{
        grid-template-columns:1fr;
      }
    }

  `;

  document.head.appendChild(style);
}


function createBasketModuleContainer() {

  let module =
    document.getElementById(
      "aceBasketModule"
    );

  if (module) {
    return module;
  }

  const movementForm =
    document.getElementById(
      "movementForm"
    );

  if (!movementForm) {
    return null;
  }

  module =
    document.createElement("section");

  module.id =
    "aceBasketModule";

  const movementsTable =
    document.getElementById(
      "movementsTable"
    );

  const movementsContainer =
    movementsTable?.closest(
      ".panel,.box,.section,.card"
    );

  const page =
    movementForm.closest(".page") ||
    movementForm.parentElement;

  if (
    page &&
    movementsContainer &&
    movementsContainer.parentElement === page
  ) {
    page.insertBefore(
      module,
      movementsContainer
    );
  } else {
    const formContainer =
      movementForm.closest(
        ".panel,.box,.section,.card"
      ) ||
      movementForm;

    formContainer.insertAdjacentElement(
      "afterend",
      module
    );
  }

  return module;
}


function renderBasketModule() {

  ensureBasketStyles();

  const module =
    createBasketModuleContainer();

  if (!module) {
    return;
  }

  const baskets =
    (db?.baskets || [])
      .filter(x => x.active !== false);

  const aguaFria =
    getAguaFriaOrigin();

  module.innerHTML = `

    <h2 class="ace-basket-module-title">
      🧺 Saída por Cestas
    </h2>

    <div class="ace-basket-module-subtitle">
      Escolha a cesta, informe o destino e a quantidade.
      A origem do estoque é fixa em Água Fria.
    </div>

    <div class="ace-basket-fixed-origin">
      <strong>📍 Origem do estoque:</strong>
      <span>
        ${aguaFria ? esc(aguaFria.name) : "Água Fria não encontrada"}
      </span>
    </div>

    <div class="ace-basket-grid">

      ${
        baskets.length
          ? baskets.map(basket => {

              const items =
                getBasketItems(
                  basket.id
                );

              const composition =
                items.length
                  ? items.map(item => `
                      <div class="ace-basket-composition-row">
                        <span>${esc(item.foodName)}</span>
                        <b>${fmt(item.qty)}</b>
                      </div>
                    `).join("")
                  : `
                    <div class="empty">
                      Nenhum alimento configurado.
                    </div>
                  `;

              return `

                <article
                  class="ace-basket-card"
                  data-basket-card="${basket.id}"
                >

                  <div class="ace-basket-name">
                    ${esc(basket.name)}
                  </div>

                  <div class="ace-basket-image-wrap">

                    <img
                      class="ace-basket-image"
                      src="${esc(getBasketImagePath(basket))}"
                      alt="${esc(basket.name)}"
                      onload="
                        makeBasketBlackBackgroundTransparent(this);
                      "
                      onerror="
                        this.style.display='none';
                        this.nextElementSibling.style.display='flex';
                      "
                    >

                    <div class="ace-basket-image-fallback">
                      🧺 Imagem da cesta<br>
                      ${esc(getBasketImagePath(basket))}
                    </div>

                  </div>

                  <div class="ace-basket-body">

                    <div class="ace-basket-composition-title">
                      Composição atual
                    </div>

                    <div class="ace-basket-composition">
                      ${composition}
                    </div>

                    <button
                      type="button"
                      class="ace-basket-edit"
                      data-edit-basket="${basket.id}"
                    >
                      ✏️ Editar cesta
                    </button>

                    <div class="ace-basket-fields">

                      <label class="ace-basket-field">
                        Destino
                        <select
                          data-basket-destination="${basket.id}"
                        >
                          <option value="">
                            Selecione...
                          </option>
                          <option value="Messejana">
                            Messejana
                          </option>
                          <option value="Praia do Futuro">
                            Praia do Futuro
                          </option>
                          <option value="Comunidade">
                            Comunidade
                          </option>
                        </select>
                      </label>

                      <label
                        class="ace-basket-field ace-basket-received"
                        data-basket-received-wrap="${basket.id}"
                      >
                        Nome da pessoa que recebeu
                        <input
                          type="text"
                          data-basket-received="${basket.id}"
                          placeholder="Digite o nome de quem recebeu"
                        >
                      </label>

                      <label class="ace-basket-field">
                        Quantidade de cestas
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value="1"
                          data-basket-qty="${basket.id}"
                        >
                      </label>

                    </div>

                    <button
                      type="button"
                      class="ace-basket-register"
                      data-register-basket="${basket.id}"
                    >
                      🧺 Registrar saída
                    </button>

                    <div class="ace-basket-note">
                      Ao registrar, os alimentos da cesta são
                      debitados automaticamente do estoque de Água Fria.
                    </div>

                  </div>

                </article>

              `;

            }).join("")
          : `
            <div class="empty">
              Nenhuma cesta cadastrada no Supabase.
            </div>
          `
      }

    </div>

    <div class="ace-manual-basket">

      <h3 class="ace-manual-basket-title">
        🧺 Montar cesta manualmente
      </h3>

      <div class="ace-manual-basket-subtitle">
        Monte uma cesta exclusiva para esta saída.
        Informe o nome, os alimentos, as quantidades e o destino.
        Os itens serão debitados do estoque de Água Fria.
      </div>

      <div class="ace-manual-basket-grid">

        <label class="ace-manual-basket-field">
          Nome da cesta
          <input
            id="manualBasketName"
            type="text"
            placeholder="Ex.: Cesta Emergencial"
          >
        </label>

        <label class="ace-manual-basket-field">
          Quantidade de cestas
          <input
            id="manualBasketQty"
            type="number"
            min="1"
            step="1"
            value="1"
          >
        </label>

        <label class="ace-manual-basket-field">
          Destino
          <select id="manualBasketDestination">
            <option value="">Selecione...</option>
            <option value="Messejana">Messejana</option>
            <option value="Praia do Futuro">Praia do Futuro</option>
            <option value="Comunidade">Comunidade</option>
          </select>
        </label>

        <label
          id="manualBasketReceivedWrap"
          class="ace-manual-basket-field"
          style="display:none"
        >
          Nome da pessoa que recebeu
          <input
            id="manualBasketReceivedBy"
            type="text"
            placeholder="Digite o nome de quem recebeu"
          >
        </label>

        <div class="ace-manual-items-box">

          <div class="ace-manual-items-title">
            Alimentos da cesta
          </div>

          <div class="ace-manual-item-add">

            <label class="ace-manual-basket-field">
              Alimento
              <select id="manualBasketFood">
                <option value="">Selecione...</option>
                ${
                  (db.foods || [])
                    .slice()
                    .sort(
                      (a,b) =>
                        String(a.name).localeCompare(
                          String(b.name),
                          "pt-BR"
                        )
                    )
                    .map(
                      food => `
                        <option value="${food.id}">
                          ${esc(food.name)}
                        </option>
                      `
                    )
                    .join("")
                }
              </select>
            </label>

            <label class="ace-manual-basket-field">
              Qtd. por cesta
              <input
                id="manualBasketFoodQty"
                type="number"
                min="1"
                step="1"
                value="1"
              >
            </label>

            <button
              id="manualBasketAddFood"
              type="button"
              class="ace-manual-add-btn"
            >
              + Adicionar
            </button>

          </div>

          <div
            id="manualBasketItemsList"
            class="ace-manual-items-list"
          ></div>

        </div>

      </div>

      <button
        id="manualBasketRegister"
        type="button"
        class="ace-manual-register"
      >
        🧺 Registrar saída da cesta manual
      </button>

    </div>


    <div class="ace-basket-history">

      <h3 class="ace-basket-history-title">
        📋 Histórico de saída de cestas
      </h3>

      <div class="ace-basket-history-toolbar">
        <label class="ace-basket-history-filter">
          Filtrar por data
          <input
            id="basketHistoryDateFilter"
            type="date"
            value="${esc(window.aceBasketHistoryDateFilter || "")}"
          >
        </label>

        <button
          type="button"
          id="basketHistoryClearFilter"
          class="ace-basket-history-action ace-basket-history-clear"
        >
          Limpar filtro
        </button>

        <button
          type="button"
          id="basketHistoryDeleteAll"
          class="ace-basket-history-action ace-basket-history-delete-all"
        >
          🗑️ Excluir Histórico
        </button>
      </div>

      <div class="ace-basket-history-list">
        ${renderBasketHistoryRows()}
      </div>

    </div>

  `;

  // Mostra no máximo 10 linhas no Histórico de saída de cestas.
  requestAnimationFrame(() => {
    applyTenVisibleRows(
      module.querySelector(".ace-basket-history-list"),
      ".ace-basket-history-row",
      "1460px"
    );
  });


  module
    .querySelectorAll(
      "[data-basket-destination]"
    )
    .forEach(select => {

      select.addEventListener(
        "change",
        () => {

          const basketId =
            select.dataset
              .basketDestination;

          const wrap =
            module.querySelector(
              `[data-basket-received-wrap="${basketId}"]`
            );

          const input =
            module.querySelector(
              `[data-basket-received="${basketId}"]`
            );

          const community =
            select.value ===
            "Comunidade";

          if (wrap) {
            wrap.classList.toggle(
              "show",
              community
            );
          }

          if (
            input &&
            !community
          ) {
            input.value = "";
          }

        }
      );

    });


  module
    .querySelectorAll(
      "[data-edit-basket]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          openBasketEditModal(
            Number(
              button.dataset
                .editBasket
            )
          );

        }
      );

    });


  module
    .querySelectorAll(
      "[data-register-basket]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const basketId =
            Number(
              button.dataset
                .registerBasket
            );

          const basket =
            (db.baskets || [])
              .find(
                x =>
                  Number(x.id) ===
                  basketId
              );

          const destination =
            module.querySelector(
              `[data-basket-destination="${basketId}"]`
            )?.value || "";

          const qty =
            Number(
              module.querySelector(
                `[data-basket-qty="${basketId}"]`
              )?.value || 0
            );

          const receivedBy =
            module.querySelector(
              `[data-basket-received="${basketId}"]`
            )?.value
              ?.trim() || "";

          if (!destination) {
            toast(
              "Selecione o destino da cesta."
            );
            return;
          }

          if (
            destination === "Comunidade" &&
            !receivedBy
          ) {
            toast(
              "Informe o nome da pessoa que recebeu a cesta."
            );
            return;
          }

          if (
            !Number.isInteger(qty) ||
            qty <= 0
          ) {
            toast(
              "Informe uma quantidade válida de cestas."
            );
            return;
          }

          const confirmed =
            await showAceConfirm(
              `Confirmar saída de ${qty} cesta(s) ${basket?.name || ""}?\n\n` +
              `Origem: Água Fria\n` +
              `Destino: ${destination}` +
              (
                destination === "Comunidade"
                  ? `\nRecebido por: ${receivedBy}`
                  : ""
              ),
              "🧺 Confirmar saída"
            );

          // showAceConfirm do sistema pode não retornar boolean.
          // Se não retornar false explicitamente, seguimos com o registro.
          if (confirmed === false) {
            return;
          }

          button.disabled = true;
          const originalText = button.textContent;
          button.textContent = "Registrando...";

          try {

            await registerBasketOutput({
              basketId,
              basketQty: qty,
              destination,
              receivedBy
            });

            db =
              await loadFromSupabase();

            renderAll();

            showAceSuccess(
              `${qty} cesta(s) ${basket?.name || ""} registrada(s) com sucesso!`
            );

          } catch (error) {

            console.error(
              "ACE - ERRO NA SAÍDA DE CESTA:",
              error
            );

            if (
              error?.code ===
              "ACE_BASKET_STOCK_INSUFFICIENT"
            ) {

              showBasketStockError({
                basketName:
                  error.basketName ||
                  basket?.name ||
                  "",
                basketQty:
                  error.basketQty ||
                  qty,
                shortages:
                  error.shortages ||
                  []
              });

            } else {

              toast(
                "Erro na saída da cesta: " +
                (
                  error?.message ||
                  "verifique o Supabase."
                )
              );

            }

          } finally {

            button.disabled = false;
            button.textContent = originalText;

          }

        }
      );

    });


  // ========================================================
  // CESTA MANUAL
  // ========================================================

  let manualBasketItems =
    [];


  const manualDestination =
    module.querySelector(
      "#manualBasketDestination"
    );

  const manualReceivedWrap =
    module.querySelector(
      "#manualBasketReceivedWrap"
    );

  const manualReceivedInput =
    module.querySelector(
      "#manualBasketReceivedBy"
    );


  manualDestination
    ?.addEventListener(
      "change",
      () => {

        const community =
          manualDestination.value ===
          "Comunidade";

        if (manualReceivedWrap) {
          manualReceivedWrap.style.display =
            community
              ? ""
              : "none";
        }

        if (
          !community &&
          manualReceivedInput
        ) {
          manualReceivedInput.value =
            "";
        }

      }
    );


  const renderManualBasketItems =
    () => {

      const list =
        module.querySelector(
          "#manualBasketItemsList"
        );

      if (!list) {
        return;
      }


      if (!manualBasketItems.length) {

        list.innerHTML = `
          <div class="ace-manual-empty">
            Nenhum alimento adicionado à cesta.
          </div>
        `;

        return;
      }


      list.innerHTML =
        manualBasketItems
          .map(
            item => `

              <div
                class="ace-manual-item-row"
                data-manual-food-row="${item.foodId}"
              >

                <div class="ace-manual-item-name">
                  ${esc(
                    getName(
                      db.foods,
                      item.foodId
                    )
                  )}
                </div>

                <div class="ace-manual-item-qty">
                  ${fmt(item.qty)} por cesta
                </div>

                <button
                  type="button"
                  class="ace-manual-remove"
                  data-manual-remove-food="${item.foodId}"
                >
                  ×
                </button>

              </div>

            `
          )
          .join("");


      list
        .querySelectorAll(
          "[data-manual-remove-food]"
        )
        .forEach(
          button => {

            button.onclick =
              () => {

                const foodId =
                  Number(
                    button.dataset
                      .manualRemoveFood
                  );

                manualBasketItems =
                  manualBasketItems
                    .filter(
                      item =>
                        Number(
                          item.foodId
                        ) !==
                        foodId
                    );

                renderManualBasketItems();

              };

          }
        );

    };


  renderManualBasketItems();


  module
    .querySelector(
      "#manualBasketAddFood"
    )
    ?.addEventListener(
      "click",
      () => {

        const foodId =
          Number(
            module.querySelector(
              "#manualBasketFood"
            )?.value || 0
          );

        const qty =
          Number(
            module.querySelector(
              "#manualBasketFoodQty"
            )?.value || 0
          );


        if (!foodId) {
          toast(
            "Selecione um alimento."
          );
          return;
        }


        if (
          !Number.isFinite(qty) ||
          qty <= 0
        ) {
          toast(
            "Informe uma quantidade válida."
          );
          return;
        }


        const existing =
          manualBasketItems.find(
            item =>
              Number(item.foodId) ===
              foodId
          );


        if (existing) {
          existing.qty =
            qty;
        } else {
          manualBasketItems.push({
            foodId,
            qty
          });
        }


        const foodSelect =
          module.querySelector(
            "#manualBasketFood"
          );

        const foodQty =
          module.querySelector(
            "#manualBasketFoodQty"
          );

        if (foodSelect) {
          foodSelect.value = "";
        }

        if (foodQty) {
          foodQty.value = "1";
        }


        renderManualBasketItems();

      }
    );


  module
    .querySelector(
      "#manualBasketRegister"
    )
    ?.addEventListener(
      "click",
      async event => {

        const button =
          event.currentTarget;

        const name =
          module.querySelector(
            "#manualBasketName"
          )?.value
            ?.trim() || "";

        const basketQty =
          Number(
            module.querySelector(
              "#manualBasketQty"
            )?.value || 0
          );

        const destination =
          module.querySelector(
            "#manualBasketDestination"
          )?.value || "";

        const receivedBy =
          module.querySelector(
            "#manualBasketReceivedBy"
          )?.value
            ?.trim() || "";


        if (!name) {
          toast(
            "Informe o nome da cesta."
          );
          return;
        }


        if (
          !Number.isInteger(basketQty) ||
          basketQty <= 0
        ) {
          toast(
            "Informe uma quantidade válida de cestas."
          );
          return;
        }


        if (!destination) {
          toast(
            "Selecione o destino."
          );
          return;
        }


        if (
          destination ===
            "Comunidade" &&
          !receivedBy
        ) {
          toast(
            "Informe o nome da pessoa que recebeu."
          );
          return;
        }


        if (
          !manualBasketItems.length
        ) {
          toast(
            "Adicione pelo menos um alimento à cesta."
          );
          return;
        }


        const confirmed =
          await showAceConfirm(
            `Confirmar saída de ${basketQty} cesta(s) "${name}"?\n\n` +
            `Origem: Água Fria\n` +
            `Destino: ${destination}\n` +
            `Itens diferentes: ${manualBasketItems.length}` +
            (
              destination ===
                "Comunidade"
                ? `\nRecebido por: ${receivedBy}`
                : ""
            ),
            "🧺 Confirmar cesta manual"
          );


        if (confirmed === false) {
          return;
        }


        button.disabled = true;
        const originalText =
          button.textContent;
        button.textContent =
          "Registrando...";


        try {

          await registerManualBasketOutput({
            name,
            basketQty,
            destination,
            receivedBy,
            items:
              manualBasketItems
          });


          db =
            await loadFromSupabase();

          renderAll();


          showAceSuccess(
            `${basketQty} cesta(s) "${name}" registrada(s) com sucesso!`
          );


        } catch (error) {

          console.error(
            "ACE - ERRO NA CESTA MANUAL:",
            error
          );


          if (
            error?.code ===
              "ACE_BASKET_STOCK_INSUFFICIENT"
          ) {

            showBasketStockError({
              basketName:
                error.basketName ||
                name,
              basketQty:
                error.basketQty ||
                basketQty,
              shortages:
                error.shortages ||
                []
            });

          } else {

            await showAceConfirm(
              "Não foi possível registrar a cesta manual.\n\n" +
              (
                error?.message ||
                "Verifique o Supabase."
              ),
              "❌ Erro"
            );

          }


        } finally {

          button.disabled =
            false;
          button.textContent =
            originalText;

        }

      }
    );


  const basketHistoryDateFilter =
    module.querySelector("#basketHistoryDateFilter");

  if (basketHistoryDateFilter) {
    basketHistoryDateFilter.addEventListener("change", () => {
      window.aceBasketHistoryDateFilter = basketHistoryDateFilter.value || "";
      renderBasketModule();
    });
  }

  const basketHistoryClearFilter =
    module.querySelector("#basketHistoryClearFilter");

  if (basketHistoryClearFilter) {
    basketHistoryClearFilter.addEventListener("click", () => {
      window.aceBasketHistoryDateFilter = "";
      renderBasketModule();
    });
  }

  const basketHistoryDeleteAll =
    module.querySelector("#basketHistoryDeleteAll");

  if (basketHistoryDeleteAll) {
    basketHistoryDeleteAll.addEventListener(
      "click",
      deleteAllBasketHistoryWithoutReversal
    );
  }

  module
    .querySelectorAll("[data-reverse-basket-output]")
    .forEach(button => {
      button.addEventListener("click", () => {
        reverseBasketHistoryGroup(
          decodeURIComponent(button.dataset.reverseBasketOutput || "")
        );
      });
    });

}


async function deleteAllBasketHistoryWithoutReversal() {

  if (!(db?.basketOutputs || []).length) {
    toast("Não há histórico de saída de cestas para excluir.");
    return;
  }

  const confirmed = await showAceConfirm(
    "Excluir TODO o histórico de saída de cestas?\n\nOs alimentos NÃO retornarão ao estoque. Somente os registros do histórico de cestas serão apagados.",
    "🗑️ Excluir histórico de cestas"
  );

  if (confirmed === false) return;

  try {
    const { error } = await supabaseClient
      .from("cestas_saidas")
      .delete()
      .not("id", "is", null);

    if (error) throw error;

    await reloadFromSupabase();
    renderAll();
    showAceSuccess(
      "Histórico de saída de cestas excluído. O estoque não foi alterado."
    );
  } catch (error) {
    console.error("ACE - erro ao excluir histórico de cestas:", error);
    toast(
      "Não foi possível excluir o histórico de cestas: " +
      (error?.message || "verifique o Supabase.")
    );
  }
}


function getBasketHistoryGroupKey(row) {
  return [
    row.date || "",
    row.usuarioId || "",
    row.basketId || "",
    row.originId || "",
    row.destination || "",
    normalizeAceText(row.receivedBy || "")
  ].join("||");
}


async function removeBasketHistoryAuditRecords({
  date,
  originId,
  userId,
  basketName,
  composition,
  basketQty
}) {

  for (const item of composition || []) {
    const foodId = Number(item.alimento_id ?? item.foodId);
    const perBasket = Number(
      item.quantidade_por_cesta ?? item.qty ?? 0
    );
    let qtyToRemove = perBasket * Number(basketQty || 0);

    if (!foodId || qtyToRemove <= 0) continue;

    let query = supabaseClient
      .from("historico_movimentacoes")
      .select("id, quantidade")
      .eq("data", date)
      .eq("tipo", "saida")
      .eq("origem_id", Number(originId))
      .eq("alimento_id", foodId)
      .eq("motivo", "Cesta")
      .eq("tipo_cesta", basketName)
      .order("created_at", { ascending: false });

    if (userId) query = query.eq("usuario_id", userId);

    const { data, error } = await query;
    if (error) {
      console.warn("ACE - falha ao localizar auditoria da cesta:", error);
      continue;
    }

    for (const historyRow of data || []) {
      if (qtyToRemove <= 0) break;
      const rowQty = Number(historyRow.quantidade || 0);

      if (rowQty <= qtyToRemove + 0.0000001) {
        const { error: delError } = await supabaseClient
          .from("historico_movimentacoes")
          .delete()
          .eq("id", historyRow.id);
        if (delError) throw delError;
        qtyToRemove -= rowQty;
      } else {
        const { error: updError } = await supabaseClient
          .from("historico_movimentacoes")
          .update({ quantidade: rowQty - qtyToRemove })
          .eq("id", historyRow.id);
        if (updError) throw updError;
        qtyToRemove = 0;
      }
    }
  }
}


async function reverseBasketHistoryGroup(groupKey) {

  const groupRows = (db?.basketOutputs || []).filter(
    row => getBasketHistoryGroupKey(row) === groupKey
  );

  if (!groupRows.length) {
    toast("Saída de cesta não encontrada.");
    return;
  }

  const first = groupRows[0];
  const basketQty = groupRows.reduce(
    (sum, row) => sum + Number(row.basketQty || 0),
    0
  );
  const composition =
    (first.composition && first.composition.length)
      ? first.composition
      : getBasketItems(first.basketId).map(item => ({
          alimento_id: Number(item.foodId),
          alimento: item.foodName,
          quantidade_por_cesta: Number(item.qty)
        }));

  const confirmed = await showAceConfirm(
    `Estornar ${fmt(basketQty)} cesta(s) ${first.basketName || ""}?\n\nOs alimentos que compõem essa saída retornarão automaticamente ao estoque.`,
    "↩️ Estornar saída de cesta"
  );

  if (confirmed === false) return;

  const movementNote =
    `Cesta: ${first.basketName} | ${first.destination}` +
    (
      first.destination === "Comunidade" && first.receivedBy
        ? ` | Recebido por: ${first.receivedBy}`
        : ""
    );

  try {
    for (const item of composition) {
      const foodId = Number(item.alimento_id ?? item.foodId);
      const qtyToRemove =
        Number(item.quantidade_por_cesta ?? item.qty ?? 0) * basketQty;

      if (!foodId || qtyToRemove <= 0) continue;

      let query = supabaseClient
        .from("saídas")
        .select("id, quantidade")
        .eq("data_saida", first.date)
        .eq("alimento_id", foodId)
        .eq("origem_id", Number(first.originId))
        .eq("destino", movementNote)
        .eq("motivo", "Montagem de cesta")
        .order("id", { ascending: true });

      if (first.usuarioId) query = query.eq("usuario_id", first.usuarioId);

      const { data: movementRows, error: findError } = await query;
      if (findError) throw findError;

      let remaining = qtyToRemove;
      for (const movementRow of movementRows || []) {
        if (remaining <= 0) break;
        const rowQty = Number(movementRow.quantidade || 0);

        if (rowQty <= remaining + 0.0000001) {
          const { error: delError } = await supabaseClient
            .from("saídas")
            .delete()
            .eq("id", movementRow.id);
          if (delError) throw delError;
          remaining -= rowQty;
        } else {
          const { error: updError } = await supabaseClient
            .from("saídas")
            .update({ quantidade: rowQty - remaining })
            .eq("id", movementRow.id);
          if (updError) throw updError;
          remaining = 0;
        }
      }
    }

    await removeBasketHistoryAuditRecords({
      date: first.date,
      originId: first.originId,
      userId: first.usuarioId,
      basketName: first.basketName,
      composition,
      basketQty
    });

    const ids = groupRows.map(row => Number(row.id)).filter(Number.isFinite);
    if (ids.length) {
      const { error: basketDeleteError } = await supabaseClient
        .from("cestas_saidas")
        .delete()
        .in("id", ids);
      if (basketDeleteError) throw basketDeleteError;
    }

    await reloadFromSupabase();
    renderAll();
    showAceSuccess(
      `${fmt(basketQty)} cesta(s) estornada(s) com sucesso. Itens devolvidos ao estoque.`
    );
  } catch (error) {
    console.error("ACE - erro ao estornar saída de cesta:", error);
    toast(
      "Não foi possível estornar a saída da cesta: " +
      (error?.message || "verifique o Supabase.")
    );
  }
}


function renderBasketHistoryRows() {

  const sourceRows =
    (db?.basketOutputs || [])
      .slice()
      .sort((a, b) => {
        const da =
          String(
            a.createdAt ||
            a.date ||
            ""
          );

        const dbb =
          String(
            b.createdAt ||
            b.date ||
            ""
          );

        return dbb.localeCompare(da);
      });


  // ========================================================
  // AGRUPA SAÍDAS IGUAIS DA MESMA CESTA
  //
  // Incrementa quando forem iguais:
  // - data
  // - usuário
  // - cesta
  // - origem
  // - destino
  // - recebido por (quando Comunidade)
  //
  // Isso também consolida visualmente registros antigos
  // que já haviam sido gravados separadamente.
  // ========================================================

  const groupedMap =
    new Map();

  sourceRows.forEach(row => {

    const key =
      getBasketHistoryGroupKey(row);


    if (!groupedMap.has(key)) {

      groupedMap.set(
        key,
        {
          ...row,
          basketQty:
            Number(
              row.basketQty || 0
            )
        }
      );

      return;
    }


    const current =
      groupedMap.get(key);

    current.basketQty +=
      Number(
        row.basketQty || 0
      );


    if (
      String(
        row.createdAt || ""
      ) >
      String(
        current.createdAt || ""
      )
    ) {

      current.createdAt =
        row.createdAt;

    }

  });


  let rows =
    [...groupedMap.values()]
      .sort((a, b) => {

        const da =
          String(
            a.createdAt ||
            a.date ||
            ""
          );

        const dbb =
          String(
            b.createdAt ||
            b.date ||
            ""
          );

        return dbb.localeCompare(da);

      });

  const filterDate =
    window.aceBasketHistoryDateFilter || "";

  if (filterDate) {
    rows = rows.filter(row => row.date === filterDate);
  }


  if (!rows.length) {

    return `
      <div class="empty">
        Nenhuma saída de cesta registrada.
      </div>
    `;

  }


  return rows.map(row => {

    const userName =
      getMovementUserName({
        usuarioId:
          row.usuarioId,
        usuarioNome:
          row.usuarioNome
      });


    const communityText =
      row.destination ===
        "Comunidade" &&
      row.receivedBy
        ? ` · Recebido por: ${esc(row.receivedBy)}`
        : "";


    return `

      <div class="ace-basket-history-row">

        <img
          class="ace-basket-history-image"
          src="${esc(
            getBasketImagePath({
              name:
                row.basketName,
              image:
                row.basketImage
            })
          )}"
          alt="${esc(row.basketName || "Cesta")}"
          onerror="this.style.visibility='hidden'"
        >

        <div class="ace-basket-history-main">

          <div class="ace-basket-history-name">
            🧺 ${esc(row.basketName || "Cesta")}
          </div>

          <div class="ace-basket-history-meta">
            ${fmtDate(row.date)}
            · Origem: Água Fria
            · Destino: ${esc(row.destination || "—")}
            ${communityText}
            · 👤 ${esc(userName)}
          </div>

        </div>

        <div class="ace-basket-history-side">
          <div class="ace-basket-history-qty">
            ${fmt(row.basketQty)} cesta(s)
          </div>

          <button
            type="button"
            class="ace-basket-history-reverse"
            data-reverse-basket-output="${encodeURIComponent(getBasketHistoryGroupKey(row))}"
          >
            ↩️ Estorno
          </button>
        </div>

      </div>

    `;

  }).join("");

}

function showBasketStockError({
  basketName,
  basketQty,
  shortages
}) {

  const old =
    document.getElementById(
      "aceBasketStockErrorModal"
    );

  if (old) {
    old.remove();
  }


  if (
    !document.getElementById(
      "aceBasketStockErrorStyle"
    )
  ) {

    const style =
      document.createElement("style");

    style.id =
      "aceBasketStockErrorStyle";

    style.textContent = `

      #aceBasketStockErrorModal{
        position:fixed;
        inset:0;
        z-index:1000010;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(18,24,40,.62);
        backdrop-filter:blur(4px);
      }

      .ace-stock-error-box{
        width:min(560px,calc(100vw - 34px));
        max-height:86vh;
        overflow:auto;
        box-sizing:border-box;
        padding:26px;
        border:2px solid #d92d20;
        border-radius:18px;
        background:#fff;
        box-shadow:0 22px 70px rgba(0,0,0,.32);
      }

      .ace-stock-error-title{
        margin:0 0 10px;
        text-align:center;
        color:#b42318;
        font-size:25px;
        font-weight:900;
      }

      .ace-stock-error-text{
        margin-bottom:18px;
        color:#475467;
        font-size:15px;
        line-height:1.5;
        text-align:center;
      }

      .ace-stock-error-list{
        display:grid;
        gap:9px;
        margin:14px 0 22px;
      }

      .ace-stock-error-item{
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:center;
        padding:11px 12px;
        border:1px solid #f3b7b2;
        border-radius:10px;
        background:#fff4f3;
      }

      .ace-stock-error-food{
        color:#912018;
        font-weight:900;
      }

      .ace-stock-error-values{
        color:#b42318;
        font-size:13px;
        font-weight:800;
        text-align:right;
      }

      .ace-stock-error-ok{
        display:block;
        min-width:130px;
        margin:0 auto;
        padding:12px 22px;
        border:0;
        border-radius:10px;
        background:#d92d20;
        color:#fff;
        font-size:16px;
        font-weight:900;
        cursor:pointer;
      }

      .ace-stock-error-ok:hover{
        filter:brightness(.96);
      }

    `;

    document.head.appendChild(style);

  }


  const modal =
    document.createElement("div");

  modal.id =
    "aceBasketStockErrorModal";

  const itemsHtml =
    (shortages || [])
      .map(item => `

        <div class="ace-stock-error-item">

          <div class="ace-stock-error-food">
            🔴 ${esc(item.foodName)}
          </div>

          <div class="ace-stock-error-values">
            Necessário: ${fmt(item.required)}
            &nbsp;|&nbsp;
            Disponível: ${fmt(item.available)}
          </div>

        </div>

      `)
      .join("");


  modal.innerHTML = `

    <div class="ace-stock-error-box">

      <div class="ace-stock-error-title">
        ⚠️ Estoque insuficiente
      </div>

      <div class="ace-stock-error-text">
        Não há alimentos suficientes no estoque de
        <strong>Água Fria</strong> para montar
        <strong>${fmt(basketQty)} cesta(s) ${esc(basketName || "")}</strong>.
        <br><br>
        Confira os itens em falta:
      </div>

      <div class="ace-stock-error-list">
        ${itemsHtml}
      </div>

      <button
        type="button"
        id="aceBasketStockErrorOk"
        class="ace-stock-error-ok"
      >
        OK
      </button>

    </div>

  `;

  document.body.appendChild(modal);


  document
    .getElementById(
      "aceBasketStockErrorOk"
    )
    .onclick = () => {
      modal.remove();
    };

}



async function registerManualBasketOutput({
  name,
  basketQty,
  destination,
  receivedBy,
  items
}) {

  const aguaFria =
    getAguaFriaOrigin();

  if (!aguaFria) {
    throw new Error(
      "A origem Água Fria não foi encontrada."
    );
  }


  const qtyCestas =
    Number(
      basketQty
    );


  if (
    !Number.isInteger(
      qtyCestas
    ) ||
    qtyCestas <= 0
  ) {
    throw new Error(
      "Quantidade de cestas inválida."
    );
  }


  const normalizedItems =
    (items || [])
      .map(
        item => ({
          foodId:
            Number(
              item.foodId
            ),
          qty:
            Number(
              item.qty
            ),
          foodName:
            getName(
              db.foods,
              Number(
                item.foodId
              )
            )
        })
      )
      .filter(
        item =>
          item.foodId &&
          item.qty > 0
      );


  if (!normalizedItems.length) {
    throw new Error(
      "A cesta precisa ter pelo menos um alimento."
    );
  }


  // --------------------------------------------------------
  // Verifica TODO o estoque antes de criar qualquer registro.
  // --------------------------------------------------------

  const stock =
    calcStock();

  const shortages =
    [];


  normalizedItems.forEach(
    item => {

      const required =
        Number(item.qty) *
        qtyCestas;

      const available =
        Number(
          stock?.[aguaFria.id]?.[
            item.foodId
          ] ||
          stock?.[
            String(
              aguaFria.id
            )
          ]?.[
            String(
              item.foodId
            )
          ] ||
          0
        );


      if (
        required >
        available
      ) {

        shortages.push({
          foodName:
            item.foodName,
          required,
          available
        });

      }

    }
  );


  if (shortages.length) {

    const error =
      new Error(
        "Estoque insuficiente em Água Fria."
      );

    error.code =
      "ACE_BASKET_STOCK_INSUFFICIENT";

    error.shortages =
      shortages;

    error.basketName =
      name;

    error.basketQty =
      qtyCestas;

    throw error;

  }


  const manualBasketId =
    newNumericId();


  // --------------------------------------------------------
  // Cria uma cesta técnica INATIVA.
  // Ela serve apenas para manter a integridade do histórico
  // e não aparece junto às cestas fixas da tela.
  // --------------------------------------------------------

  const {
    error: basketError
  } =
    await supabaseClient
      .from(
        "cestas"
      )
      .insert({
        id:
          manualBasketId,
        nome:
          name,
        imagem:
          "",
        ativo:
          false
      });


  if (basketError) {
    throw basketError;
  }


  const basketItemRows =
    normalizedItems.map(
      item => ({
        cesta_id:
          manualBasketId,
        alimento_id:
          item.foodId,
        quantidade:
          item.qty
      })
    );


  const {
    error: basketItemsError
  } =
    await supabaseClient
      .from(
        "cestas_itens"
      )
      .insert(
        basketItemRows
      );


  if (basketItemsError) {

    await supabaseClient
      .from(
        "cestas"
      )
      .delete()
      .eq(
        "id",
        manualBasketId
      );

    throw basketItemsError;

  }


  // --------------------------------------------------------
  // Coloca a cesta técnica apenas na memória para aproveitar
  // toda a lógica segura já existente de saída, estoque,
  // histórico e estorno.
  // --------------------------------------------------------

  db.baskets =
    db.baskets || [];

  db.basketItems =
    db.basketItems || [];


  db.baskets.push({
    id:
      manualBasketId,
    name:
      name,
    image:
      "",
    active:
      false
  });


  normalizedItems.forEach(
    item => {

      db.basketItems.push({
        id:
          newNumericId(),
        basketId:
          manualBasketId,
        foodId:
          item.foodId,
        qty:
          item.qty
      });

    }
  );


  try {

    await registerBasketOutput({
      basketId:
        manualBasketId,
      basketQty:
        qtyCestas,
      destination,
      receivedBy
    });


  } catch (error) {

    // Se a saída falhar antes de gerar histórico,
    // tenta limpar a cesta técnica criada.
    try {

      await supabaseClient
        .from(
          "cestas_itens"
        )
        .delete()
        .eq(
          "cesta_id",
          manualBasketId
        );


      await supabaseClient
        .from(
          "cestas"
        )
        .delete()
        .eq(
          "id",
          manualBasketId
        );

    } catch {
      // limpeza auxiliar
    }


    throw error;

  }

}


async function registerBasketOutput({
  basketId,
  basketQty,
  destination,
  receivedBy
}) {

  const basket =
    (db?.baskets || []).find(
      x =>
        Number(x.id) ===
        Number(basketId)
    );

  if (!basket) {
    throw new Error("Cesta não encontrada.");
  }

  const aguaFria =
    getAguaFriaOrigin();

  if (!aguaFria) {
    throw new Error(
      "A origem Água Fria não foi encontrada."
    );
  }

  const items =
    getBasketItems(basketId);

  if (!items.length) {
    throw new Error(
      "A cesta não possui alimentos configurados."
    );
  }

  const qtyCestas =
    Number(basketQty);

  if (
    !Number.isInteger(qtyCestas) ||
    qtyCestas <= 0
  ) {
    throw new Error(
      "Quantidade de cestas inválida."
    );
  }

  // Verifica o estoque de TODOS os alimentos antes de registrar.
  const stock =
    calcStock();

  const shortages = [];

  items.forEach(item => {

    const required =
      Number(item.qty) *
      qtyCestas;

    const available =
      Number(
        stock?.[aguaFria.id]?.[item.foodId] ||
        stock?.[String(aguaFria.id)]?.[String(item.foodId)] ||
        0
      );

    if (required > available) {
      shortages.push({
        foodName: item.foodName,
        required,
        available
      });
    }

  });

  if (shortages.length) {

    const error =
      new Error(
        "Estoque insuficiente em Água Fria."
      );

    error.code =
      "ACE_BASKET_STOCK_INSUFFICIENT";

    error.shortages =
      shortages;

    error.basketName =
      basket.name;

    error.basketQty =
      qtyCestas;

    throw error;

  }

  const userId =
    getCurrentUserId();

  const today =
    isoToday();

  const composition =
    items.map(item => ({
      alimento_id:
        Number(item.foodId),
      alimento:
        item.foodName,
      quantidade_por_cesta:
        Number(item.qty),
      quantidade_total:
        Number(item.qty) *
        qtyCestas
    }));

  // ========================================================
  // HISTÓRICO DA CESTA
  //
  // Se o MESMO usuário registrar novamente a MESMA cesta,
  // no MESMO dia, para o MESMO destino, incrementa a
  // quantidade_cestas em vez de criar outra linha.
  // ========================================================

  let basketHistoryQuery =
    supabaseClient
      .from("cestas_saidas")
      .select(
        "id, quantidade_cestas"
      )
      .eq(
        "cesta_id",
        Number(basket.id)
      )
      .eq(
        "origem_id",
        Number(aguaFria.id)
      )
      .eq(
        "destino",
        destination
      )
      .eq(
        "data_saida",
        today
      )
      .eq(
        "usuario_id",
        userId
      );


  if (
    destination === "Comunidade"
  ) {

    basketHistoryQuery =
      basketHistoryQuery.eq(
        "recebido_por",
        receivedBy
      );

  } else {

    basketHistoryQuery =
      basketHistoryQuery.is(
        "recebido_por",
        null
      );

  }


  const {
    data: existingBasketRows,
    error: basketFindError
  } =
    await basketHistoryQuery
      .order(
        "id",
        {
          ascending: true
        }
      );


  if (basketFindError) {
    throw basketFindError;
  }


  let basketOutputData =
    null;

  let basketWasInserted =
    false;

  let basketPreviousQty =
    0;


  if (
    existingBasketRows?.length
  ) {

    const mainBasketRow =
      existingBasketRows[0];

    basketPreviousQty =
      existingBasketRows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.quantidade_cestas ||
            0
          ),
        0
      );


    const newBasketQty =
      basketPreviousQty +
      qtyCestas;


    const {
      error: basketUpdateError
    } =
      await supabaseClient
        .from("cestas_saidas")
        .update({
          quantidade_cestas:
            newBasketQty,
          cesta_nome:
            basket.name,
          cesta_imagem:
            getBasketImagePath(
              basket
            ),
          composicao:
            composition
        })
        .eq(
          "id",
          mainBasketRow.id
        );


    if (basketUpdateError) {
      throw basketUpdateError;
    }


    // Remove duplicidades antigas do mesmo grupo,
    // mantendo somente a primeira linha já incrementada.
    const extraIds =
      existingBasketRows
        .slice(1)
        .map(
          row => row.id
        );


    if (extraIds.length) {

      const {
        error: basketDuplicatesError
      } =
        await supabaseClient
          .from("cestas_saidas")
          .delete()
          .in(
            "id",
            extraIds
          );


      if (basketDuplicatesError) {
        throw basketDuplicatesError;
      }

    }


    basketOutputData = {
      id:
        mainBasketRow.id
    };

  } else {

    const {
      data: insertedBasket,
      error: basketInsertError
    } =
      await supabaseClient
        .from("cestas_saidas")
        .insert({
          cesta_id:
            Number(basket.id),
          cesta_nome:
            basket.name,
          cesta_imagem:
            getBasketImagePath(
              basket
            ),
          quantidade_cestas:
            qtyCestas,
          origem_id:
            Number(aguaFria.id),
          destino:
            destination,
          recebido_por:
            destination ===
              "Comunidade"
              ? receivedBy
              : null,
          data_saida:
            today,
          usuario_id:
            userId,
          composicao:
            composition
        })
        .select("id")
        .single();


    if (basketInsertError) {
      throw basketInsertError;
    }


    basketOutputData =
      insertedBasket;

    basketWasInserted =
      true;

  }

  // ========================================================
  // MOVIMENTAÇÕES DOS ALIMENTOS
  //
  // Para cada alimento:
  // se já existir uma movimentação da mesma cesta,
  // usuário, dia e destino, INCREMENTA a quantidade.
  // Não cria linhas repetidas.
  // ========================================================

  const movementNote =
    `Cesta: ${basket.name} | ${destination}` +
    (
      destination === "Comunidade" &&
      receivedBy
        ? ` | Recebido por: ${receivedBy}`
        : ""
    );


  try {

    for (
      const item of items
    ) {

      const qtyToAdd =
        Number(item.qty) *
        qtyCestas;


      const {
        data: existingMovementRows,
        error: movementFindError
      } =
        await supabaseClient
          .from("saídas")
          .select(
            "id, quantidade"
          )
          .eq(
            "data_saida",
            today
          )
          .eq(
            "alimento_id",
            Number(item.foodId)
          )
          .eq(
            "origem_id",
            Number(aguaFria.id)
          )
          .eq(
            "usuario_id",
            userId
          )
          .eq(
            "destino",
            movementNote
          )
          .eq(
            "motivo",
            "Montagem de cesta"
          )
          .order(
            "id",
            {
              ascending: true
            }
          );


      if (movementFindError) {
        throw movementFindError;
      }


      if (
        existingMovementRows?.length
      ) {

        const mainMovement =
          existingMovementRows[0];


        const existingQty =
          existingMovementRows.reduce(
            (sum, row) =>
              sum +
              Number(
                row.quantidade ||
                0
              ),
            0
          );


        const {
          error: movementUpdateError
        } =
          await supabaseClient
            .from("saídas")
            .update({
              quantidade:
                existingQty +
                qtyToAdd
            })
            .eq(
              "id",
              mainMovement.id
            );


        if (movementUpdateError) {
          throw movementUpdateError;
        }


        // Limpa duplicidades antigas desse mesmo alimento/cesta.
        const extraMovementIds =
          existingMovementRows
            .slice(1)
            .map(
              row => row.id
            );


        if (
          extraMovementIds.length
        ) {

          const {
            error: movementDuplicatesError
          } =
            await supabaseClient
              .from("saídas")
              .delete()
              .in(
                "id",
                extraMovementIds
              );


          if (movementDuplicatesError) {
            throw movementDuplicatesError;
          }

        }

      } else {

        const {
          error: movementInsertError
        } =
          await supabaseClient
            .from("saídas")
            .insert({
              id:
                newNumericId(),
              data_saida:
                today,
              alimento_id:
                Number(item.foodId),
              quantidade:
                qtyToAdd,
              origem_id:
                Number(aguaFria.id),
              destino:
                movementNote,
              motivo:
                "Montagem de cesta",
              usuario_id:
                userId
            });


        if (movementInsertError) {
          throw movementInsertError;
        }

      }

      await insertHistoryRecord({
        date: today,
        type: "saida",
        originId:
          aguaFria.id,
        foodId:
          item.foodId,
        qty:
          qtyToAdd,
        reason:
          "Cesta",
        basketType:
          basket.name,
        note:
          movementNote
      });

    }

  } catch (movementsError) {

    // --------------------------------------------------------
    // Tenta restaurar o histórico da cesta caso haja falha
    // nas movimentações, evitando deixar a contagem da cesta
    // maior sem o correspondente débito dos alimentos.
    // --------------------------------------------------------

    if (
      basketOutputData?.id
    ) {

      if (basketWasInserted) {

        await supabaseClient
          .from("cestas_saidas")
          .delete()
          .eq(
            "id",
            basketOutputData.id
          );

      } else {

        await supabaseClient
          .from("cestas_saidas")
          .update({
            quantidade_cestas:
              basketPreviousQty
          })
          .eq(
            "id",
            basketOutputData.id
          );

      }

    }


    throw movementsError;

  }

}


function closeBasketEditModal() {

  const modal =
    document.getElementById(
      "aceBasketEditModal"
    );

  if (modal) {
    modal.remove();
  }

}


function openBasketEditModal(basketId) {

  closeBasketEditModal();

  const basket =
    (db?.baskets || []).find(
      item =>
        Number(item.id) ===
        Number(basketId)
    );

  if (!basket) {
    toast("Cesta não encontrada.");
    return;
  }

  const sourceItems =
    getBasketItems(basketId)
      .map(item => ({
        foodId:
          Number(item.foodId),
        qty:
          Number(item.qty)
      }));

  let draftItems =
    sourceItems.map(
      item => ({ ...item })
    );

  const modal =
    document.createElement("div");

  modal.id =
    "aceBasketEditModal";

  modal.innerHTML = `
    <div class="ace-basket-edit-box">

      <div class="ace-basket-edit-title">
        ✏️ Editar ${esc(basket.name)}
      </div>

      <div
        id="aceBasketEditList"
        class="ace-basket-edit-list"
      ></div>

      <div class="ace-basket-add-row">

        <select id="aceBasketAddFood">
          <option value="">
            + Adicionar alimento...
          </option>
        </select>

        <button
          type="button"
          id="aceBasketAddFoodButton"
          class="ace-basket-save-btn"
        >
          Adicionar
        </button>

      </div>

      <div class="ace-basket-modal-actions">

        <button
          type="button"
          id="aceBasketSaveEdit"
          class="ace-basket-save-btn"
        >
          💾 Salvar
        </button>

        <button
          type="button"
          id="aceBasketCancelEdit"
          class="ace-basket-cancel-btn"
        >
          Cancelar
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(modal);


  const renderDraft = () => {

    const list =
      document.getElementById(
        "aceBasketEditList"
      );

    if (!list) return;

    list.innerHTML =
      draftItems.length
        ? draftItems
            .sort(
              (a, b) =>
                getName(
                  db.foods,
                  a.foodId
                ).localeCompare(
                  getName(
                    db.foods,
                    b.foodId
                  ),
                  "pt-BR"
                )
            )
            .map(item => `

              <div
                class="ace-basket-edit-row"
                data-draft-food="${item.foodId}"
              >

                <div class="ace-basket-edit-food">
                  ${esc(
                    getName(
                      db.foods,
                      item.foodId
                    )
                  )}
                </div>

                <button
                  type="button"
                  class="ace-basket-small-btn"
                  data-draft-minus="${item.foodId}"
                >
                  −
                </button>

                <div class="ace-basket-edit-qty">
                  ${fmt(item.qty)}
                </div>

                <div style="display:flex;gap:6px;">

                  <button
                    type="button"
                    class="ace-basket-small-btn"
                    data-draft-plus="${item.foodId}"
                  >
                    +
                  </button>

                  <button
                    type="button"
                    class="ace-basket-remove-btn"
                    data-draft-remove="${item.foodId}"
                    title="Remover alimento"
                  >
                    ×
                  </button>

                </div>

              </div>

            `).join("")
        : `
          <div class="empty">
            Nenhum alimento nesta cesta.
          </div>
        `;


    list
      .querySelectorAll(
        "[data-draft-minus]"
      )
      .forEach(button => {

        button.onclick = () => {

          const foodId =
            Number(
              button.dataset
                .draftMinus
            );

          const item =
            draftItems.find(
              x =>
                Number(x.foodId) ===
                foodId
            );

          if (!item) return;

          item.qty =
            Math.max(
              1,
              Number(item.qty) - 1
            );

          renderDraft();

        };

      });


    list
      .querySelectorAll(
        "[data-draft-plus]"
      )
      .forEach(button => {

        button.onclick = () => {

          const foodId =
            Number(
              button.dataset
                .draftPlus
            );

          const item =
            draftItems.find(
              x =>
                Number(x.foodId) ===
                foodId
            );

          if (!item) return;

          item.qty =
            Number(item.qty) + 1;

          renderDraft();

        };

      });


    list
      .querySelectorAll(
        "[data-draft-remove]"
      )
      .forEach(button => {

        button.onclick = () => {

          const foodId =
            Number(
              button.dataset
                .draftRemove
            );

          draftItems =
            draftItems.filter(
              x =>
                Number(x.foodId) !==
                foodId
            );

          renderDraft();
          refreshAddFoodSelect();

        };

      });

  };


  const refreshAddFoodSelect = () => {

    const select =
      document.getElementById(
        "aceBasketAddFood"
      );

    if (!select) return;

    const selected =
      new Set(
        draftItems.map(
          item =>
            Number(item.foodId)
        )
      );

    const available =
      (db.foods || [])
        .filter(
          food =>
            !selected.has(
              Number(food.id)
            )
        )
        .slice()
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "pt-BR"
            )
        );

    select.innerHTML =
      `
        <option value="">
          + Adicionar alimento...
        </option>
      ` +
      available
        .map(
          food => `
            <option value="${food.id}">
              ${esc(food.name)}
            </option>
          `
        )
        .join("");

  };


  renderDraft();
  refreshAddFoodSelect();


  document
    .getElementById(
      "aceBasketAddFoodButton"
    )
    .onclick = () => {

      const select =
        document.getElementById(
          "aceBasketAddFood"
        );

      const foodId =
        Number(select?.value || 0);

      if (!foodId) {
        toast(
          "Selecione um alimento para adicionar."
        );
        return;
      }

      if (
        draftItems.some(
          x =>
            Number(x.foodId) ===
            foodId
        )
      ) {
        toast(
          "Esse alimento já faz parte da cesta."
        );
        return;
      }

      draftItems.push({
        foodId,
        qty: 1
      });

      renderDraft();
      refreshAddFoodSelect();

    };


  document
    .getElementById(
      "aceBasketCancelEdit"
    )
    .onclick =
      closeBasketEditModal;


  document
    .getElementById(
      "aceBasketSaveEdit"
    )
    .onclick =
      async () => {

        const saveButton =
          document.getElementById(
            "aceBasketSaveEdit"
          );

        if (!draftItems.length) {
          toast(
            "A cesta precisa ter pelo menos um alimento."
          );
          return;
        }

        if (saveButton) {
          saveButton.disabled = true;
          saveButton.textContent =
            "Salvando...";
        }

        try {

          // Remove somente a composição desta cesta.
          const {
            error: deleteError
          } =
            await supabaseClient
              .from("cestas_itens")
              .delete()
              .eq(
                "cesta_id",
                Number(basketId)
              );

          if (deleteError) {
            throw deleteError;
          }

          const rows =
            draftItems.map(
              item => ({
                cesta_id:
                  Number(basketId),
                alimento_id:
                  Number(item.foodId),
                quantidade:
                  Number(item.qty)
              })
            );

          const {
            error: insertError
          } =
            await supabaseClient
              .from("cestas_itens")
              .insert(rows);

          if (insertError) {
            throw insertError;
          }

          db =
            await loadFromSupabase();

          closeBasketEditModal();

          renderAll();

          toast(
            "Composição da cesta atualizada."
          );

        } catch (error) {

          console.error(
            "ACE - ERRO AO EDITAR CESTA:",
            error
          );

          toast(
            "Erro ao salvar a cesta: " +
            (
              error?.message ||
              "verifique o Supabase."
            )
          );

          if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent =
              "💾 Salvar";
          }

        }

      };

}


// ============================================================
// 20. PWA
// ============================================================

function setupPWA() {

  window.addEventListener(
    "beforeinstallprompt",
    e => {

      e.preventDefault();

      deferredPrompt = e;


      const button =
        document.getElementById(
          "installBtn"
        );


      if (button) {
        button.classList.remove(
          "hidden"
        );
      }

    }
  );


  const installBtn =
    document.getElementById(
      "installBtn"
    );


  if (installBtn) {

    installBtn.addEventListener(
      "click",
      async () => {

        if (!deferredPrompt) {

          const standalone =
            window.matchMedia?.(
              "(display-mode: standalone)"
            )?.matches ||
            window.navigator.standalone === true;

          if (standalone) {
            toast(
              "O aplicativo já está instalado neste dispositivo."
            );
          } else {
            toast(
              "A instalação será liberada pelo navegador quando o aplicativo estiver pronto para instalar."
            );
          }

          return;
        }


        deferredPrompt.prompt();

        deferredPrompt = null;

        installBtn.classList.add(
          "hidden"
        );

      }
    );

  }


  if (
    "serviceWorker" in navigator
  ) {

    window.addEventListener(
      "load",
      () => {

        navigator.serviceWorker
          .register("sw.js")
          .catch(
            err =>
              console.warn(
                "Service Worker:",
                err
              )
          );

      }
    );

  }

}


// ============================================================
// 21. RENDERIZAÇÃO GERAL
// ============================================================


// ============================================================
// MURAL ACE
// ============================================================

function isMuralAceAdmin() {

  return (
    String(
      currentUser?.email || ""
    )
      .trim()
      .toLowerCase()
    ===
    MURAL_ACE_ADMIN_EMAIL
  );

}


function ensureMuralAceStyles() {

  if (
    document.getElementById(
      "aceMuralStyles"
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );

  style.id =
    "aceMuralStyles";

  style.textContent = `

    #muralAce{
      padding-bottom:34px;
    }

    .ace-mural-header{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:18px;
      margin-bottom:22px;
    }

    .ace-mural-title{
      margin:0;
      color:#073b68;
      font-size:34px;
      font-weight:900;
    }

    .ace-mural-subtitle{
      margin-top:5px;
      color:#667085;
      font-size:16px;
      line-height:1.5;
    }

    .ace-mural-admin-btn{
      border:1px solid #0b4b7a;
      background:#0b4b7a;
      color:#fff;
      border-radius:11px;
      padding:12px 17px;
      font-family:inherit;
      font-size:15px;
      font-weight:900;
      cursor:pointer;
      white-space:nowrap;
    }

    .ace-mural-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:22px;
    }

    .ace-mural-card{
      overflow:hidden;
      border:1px solid #dce6ee;
      border-radius:18px;
      background:#fff;
      box-shadow:0 12px 30px rgba(20,54,82,.08);
    }

    .ace-mural-media{
      width:100%;
      min-height:260px;
      max-height:520px;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      background:#eef4f8;
    }

    .ace-mural-media img,
    .ace-mural-media video{
      display:block;
      width:100%;
      max-height:520px;
      object-fit:contain;
      background:#eef4f8;
    }

    .ace-mural-body{
      padding:19px 20px 20px;
    }

    .ace-mural-meta{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:8px;
      color:#667085;
      font-size:12px;
    }

    .ace-mural-badge{
      display:inline-flex;
      align-items:center;
      padding:5px 9px;
      border-radius:999px;
      background:#edf6ff;
      color:#0756a0;
      font-size:11px;
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:.03em;
    }

    .ace-mural-card-title{
      margin:0;
      color:#073b68;
      font-size:22px;
      line-height:1.25;
      font-weight:900;
    }

    .ace-mural-description{
      margin-top:10px;
      color:#475467;
      font-size:15px;
      line-height:1.55;
      white-space:pre-wrap;
    }

    .ace-mural-card-actions{
      display:flex;
      justify-content:flex-end;
      gap:9px;
      margin-top:16px;
      padding-top:14px;
      border-top:1px solid #edf1f4;
    }

    .ace-mural-card-actions button{
      padding:9px 13px;
      border-radius:9px;
      background:#fff;
      font-family:inherit;
      font-weight:900;
      cursor:pointer;
    }

    .ace-mural-edit{
      border:1px solid #0b4b7a;
      color:#0b4b7a;
    }

    .ace-mural-delete{
      border:1px solid #ef4444;
      color:#d92d20;
    }

    .ace-mural-empty{
      grid-column:1/-1;
      padding:58px 24px;
      border:1px dashed #bccbd7;
      border-radius:17px;
      background:#fff;
      color:#667085;
      text-align:center;
      font-size:17px;
    }

    #aceMuralModal{
      position:fixed;
      inset:0;
      z-index:1000040;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      background:rgba(0,35,70,.62);
      backdrop-filter:blur(3px);
    }

    .ace-mural-modal-box{
      width:min(660px,calc(100vw - 34px));
      max-height:92vh;
      overflow:auto;
      box-sizing:border-box;
      padding:26px;
      border-radius:19px;
      background:#fff;
      box-shadow:0 24px 75px rgba(0,0,0,.34);
    }

    .ace-mural-modal-title{
      margin:0 0 18px;
      color:#073b68;
      font-size:25px;
      font-weight:900;
    }

    .ace-mural-form-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:14px;
    }

    .ace-mural-field{
      display:flex;
      flex-direction:column;
      gap:6px;
      color:#102a43;
      font-weight:900;
    }

    .ace-mural-field.full{
      grid-column:1/-1;
    }

    .ace-mural-field input,
    .ace-mural-field textarea,
    .ace-mural-field select{
      width:100%;
      box-sizing:border-box;
      border:1px solid #cbd8e3;
      border-radius:10px;
      padding:11px 12px;
      background:#fff;
      color:#102a43;
      font:inherit;
    }

    .ace-mural-field textarea{
      min-height:110px;
      resize:vertical;
    }

    .ace-mural-help{
      margin-top:5px;
      color:#667085;
      font-size:12px;
      font-weight:500;
    }

    .ace-mural-modal-actions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:21px;
    }

    .ace-mural-modal-actions button{
      min-height:43px;
      padding:9px 17px;
      border-radius:10px;
      font:inherit;
      font-weight:900;
      cursor:pointer;
    }

    #aceMuralCancel{
      border:1px solid #98a2b3;
      background:#fff;
      color:#344054;
    }

    #aceMuralSave{
      border:1px solid #0756a0;
      background:#0756a0;
      color:#fff;
    }

    .ace-mural-current-file{
      margin-top:7px;
      padding:9px 11px;
      border-radius:8px;
      background:#f4f7f9;
      color:#475467;
      font-size:12px;
      font-weight:600;
      word-break:break-all;
    }

    .ace-mural-ready-status{
      display:none;
      margin-top:9px;
      padding:10px 12px;
      border:1px solid #22a447;
      border-radius:9px;
      background:#eefbf3;
      color:#16803a;
      font-size:13px;
      font-weight:900;
    }

    .ace-mural-ready-status.show{
      display:block;
    }

    .ace-mural-ready-status.error{
      border-color:#ef4444;
      background:#fff1f0;
      color:#d92d20;
    }

    .ace-mural-source-choice{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin-top:3px;
    }

    .ace-mural-source-choice label{
      display:flex;
      align-items:center;
      gap:7px;
      padding:10px 12px;
      border:1px solid #cbd8e3;
      border-radius:10px;
      background:#fff;
      cursor:pointer;
      font-weight:800;
    }

    .ace-mural-media iframe{
      display:block;
      width:100%;
      aspect-ratio:16/9;
      border:0;
      background:#000;
    }

    @media(max-width:850px){

      .ace-mural-grid{
        display:flex;
        overflow-x:auto;
        overflow-y:hidden;
        gap:14px;
        scroll-snap-type:x mandatory;
        scroll-behavior:smooth;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        padding-bottom:6px;
      }

      .ace-mural-grid::-webkit-scrollbar{
        display:none;
      }

      .ace-mural-card{
        flex:0 0 100%;
        scroll-snap-align:start;
        scroll-snap-stop:always;
      }

      .ace-mural-empty{
        flex:0 0 100%;
      }

      .ace-mural-header{
        flex-direction:column;
      }

      .ace-mural-form-grid{
        grid-template-columns:1fr;
      }

      .ace-mural-field.full{
        grid-column:auto;
      }

      .ace-mural-mobile-hint{
        display:block;
      }

    }

    .ace-mural-mobile-hint{
      display:none;
      margin:0 0 10px;
      color:#667085;
      font-size:13px;
      font-weight:700;
    }

  `;


  document.head.appendChild(
    style
  );

}


function setupMuralAcePage() {

  ensureMuralAceStyles();


  const tabs =
    document.querySelector(
      ".tabs"
    );


  if (!tabs) {
    console.warn(
      "ACE: menu .tabs não encontrado para criar Mural ACE."
    );
    return;
  }


  let muralTab =
    tabs.querySelector(
      '[data-page="muralAce"]'
    );


  if (!muralTab) {

    muralTab =
      document.createElement(
        "button"
      );

    muralTab.type =
      "button";

    muralTab.className =
      "tab";

    muralTab.dataset.page =
      "muralAce";

    muralTab.innerHTML =
      "📢 Mural ACE";


    const firstTab =
      tabs.querySelector(
        ".tab"
      );


    if (firstTab) {

      tabs.insertBefore(
        muralTab,
        firstTab
      );

    } else {

      tabs.appendChild(
        muralTab
      );

    }

  }


  let page =
    document.getElementById(
      "muralAce"
    );


  if (!page) {

    page =
      document.createElement(
        "section"
      );

    page.id =
      "muralAce";

    page.className =
      "page";


    const homePage =
      document.getElementById(
        "home"
      ) ||
      document.querySelector(
        ".page"
      );


    if (
      homePage &&
      homePage.parentElement
    ) {

      homePage.parentElement.insertBefore(
        page,
        homePage
      );

    } else {

      document.body.appendChild(
        page
      );

    }

  }


  renderMuralAce();

}


async function loadMuralAcePosts() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "mural_ace"
      )
      .select("*")
      .order(
        "ordem",
        {
          ascending: true
        }
      )
      .order(
        "data_publicacao",
        {
          ascending: false
        }
      );


  if (error) {
    throw new Error(
      "Falha ao carregar o Mural ACE: " +
      (
        error.message ||
        "erro desconhecido"
      )
    );
  }


  muralAcePosts =
    data || [];

}


function formatMuralAceDate(
  value
) {

  if (!value) {
    return "";
  }


  try {

    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        day:
          "2-digit",
        month:
          "2-digit",
        year:
          "numeric"
      }
    ).format(
      new Date(value)
    );

  } catch {

    return String(value);

  }

}



function getMuralAceYouTubeEmbedUrl(
  url
) {

  const value =
    String(url || "").trim();

  if (!value) {
    return "";
  }

  try {

    const parsed =
      new URL(value);

    let videoId = "";

    if (
      parsed.hostname === "youtu.be"
    ) {
      videoId =
        parsed.pathname
          .replace(/^\/+/, "")
          .split("/")[0];
    }

    if (
      parsed.hostname.includes(
        "youtube.com"
      )
    ) {

      if (
        parsed.pathname === "/watch"
      ) {
        videoId =
          parsed.searchParams.get("v") || "";
      }

      const shortsMatch =
        parsed.pathname.match(
          /^\/shorts\/([^/?#]+)/
        );

      if (shortsMatch) {
        videoId =
          shortsMatch[1];
      }

      const embedMatch =
        parsed.pathname.match(
          /^\/embed\/([^/?#]+)/
        );

      if (embedMatch) {
        videoId =
          embedMatch[1];
      }

    }

    if (
      !/^[A-Za-z0-9_-]{6,}$/.test(
        videoId
      )
    ) {
      return "";
    }

    return (
      "https://www.youtube.com/embed/" +
      encodeURIComponent(videoId)
    );

  } catch {

    return "";

  }

}


function isMuralAceValidExternalUrl(
  value
) {

  try {

    const url =
      new URL(
        String(value || "").trim()
      );

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );

  } catch {

    return false;

  }

}


function renderMuralAce() {

  const page =
    document.getElementById(
      "muralAce"
    );


  if (!page) {
    return;
  }


  const admin =
    isMuralAceAdmin();


  const posts =
    muralAcePosts.filter(
      post =>
        admin ||
        post.ativo !== false
    );


  page.innerHTML = `

    <div class="ace-mural-header">

      <div>

        <h2 class="ace-mural-title">
          📢 Mural ACE
        </h2>

        <div class="ace-mural-subtitle">
          Notícias, campanhas, orientações e conteúdos para nossa equipe.
        </div>

      </div>

      ${
        admin
          ? `
              <button
                id="aceMuralNewPost"
                class="ace-mural-admin-btn"
                type="button"
              >
                ➕ Nova publicação
              </button>
            `
          : ""
      }

    </div>


    <div class="ace-mural-mobile-hint">
      👈 Deslize para o lado para ver as próximas publicações
    </div>

    <div class="ace-mural-grid">

      ${
        posts.length
          ? posts
              .map(
                post => {

                  const type =
                    String(
                      post.tipo || ""
                    ).toLowerCase();

                  const youtubeEmbed =
                    getMuralAceYouTubeEmbedUrl(
                      post.arquivo_url
                    );


                  const media =
                    post.arquivo_url
                      ? (
                          youtubeEmbed
                            ? `
                                <div class="ace-mural-media">
                                  <iframe
                                    src="${esc(youtubeEmbed)}"
                                    title="${esc(post.titulo || "Vídeo do Mural ACE")}"
                                    loading="lazy"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowfullscreen
                                  ></iframe>
                                </div>
                              `
                            : (
                                type === "video"
                                  ? `
                                      <div class="ace-mural-media">
                                        <video
                                          controls
                                          preload="metadata"
                                          src="${esc(post.arquivo_url)}"
                                        ></video>
                                      </div>
                                    `
                                  : `
                                      <div class="ace-mural-media">
                                        <img
                                          src="${esc(post.arquivo_url)}"
                                          alt="${esc(post.titulo || "Imagem do Mural ACE")}"
                                          loading="lazy"
                                        >
                                      </div>
                                    `
                              )
                        )
                      : "";


                  return `

                    <article class="ace-mural-card">

                      ${media}

                      <div class="ace-mural-body">

                        <div class="ace-mural-meta">

                          <span class="ace-mural-badge">
                            ${
                              type === "video"
                                ? "🎥 Vídeo"
                                : "🖼️ Imagem"
                            }
                          </span>

                          <span>
                            ${
                              formatMuralAceDate(
                                post.data_publicacao
                              )
                            }
                          </span>

                        </div>

                        <h3 class="ace-mural-card-title">
                          ${esc(post.titulo || "")}
                        </h3>

                        ${
                          post.descricao
                            ? `
                                <div class="ace-mural-description">
                                  ${esc(post.descricao)}
                                </div>
                              `
                            : ""
                        }

                        ${
                          admin
                            ? `
                                <div class="ace-mural-card-actions">

                                  <button
                                    type="button"
                                    class="ace-mural-edit"
                                    data-mural-edit="${esc(post.id)}"
                                  >
                                    ✏️ Editar
                                  </button>

                                  <button
                                    type="button"
                                    class="ace-mural-delete"
                                    data-mural-delete="${esc(post.id)}"
                                  >
                                    🗑️ Excluir
                                  </button>

                                </div>
                              `
                            : ""
                        }

                      </div>

                    </article>

                  `;

                }
              )
              .join("")
          : `
              <div class="ace-mural-empty">
                📭 Nenhuma publicação disponível no Mural ACE.
              </div>
            `
      }

    </div>

  `;


  document
    .getElementById(
      "aceMuralNewPost"
    )
    ?.addEventListener(
      "click",
      () =>
        openMuralAceEditor()
    );


  page
    .querySelectorAll(
      "[data-mural-edit]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const post =
              muralAcePosts.find(
                item =>
                  String(item.id) ===
                  String(
                    button.dataset.muralEdit
                  )
              );

            if (post) {
              openMuralAceEditor(
                post
              );
            }

          }
        );

      }
    );


  page
    .querySelectorAll(
      "[data-mural-delete]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            deleteMuralAcePost(
              button.dataset.muralDelete
            )
        );

      }
    );

}


function openMuralAceEditor(
  post = null
) {

  if (
    !isMuralAceAdmin()
  ) {
    return;
  }


  const old =
    document.getElementById(
      "aceMuralModal"
    );


  if (old) {
    old.remove();
  }


  const editing =
    Boolean(post);


  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "aceMuralModal";


  modal.innerHTML = `

    <div class="ace-mural-modal-box">

      <div class="ace-mural-modal-title">
        ${
          editing
            ? "✏️ Editar publicação"
            : "➕ Nova publicação"
        }
      </div>


      <div class="ace-mural-form-grid">

        <label class="ace-mural-field full">
          Título
          <input
            id="aceMuralTitle"
            type="text"
            maxlength="160"
            value="${esc(post?.titulo || "")}"
            placeholder="Ex.: Campanha de arrecadação"
          >
        </label>


        <label class="ace-mural-field full">
          Descrição
          <textarea
            id="aceMuralDescription"
            maxlength="3000"
            placeholder="Digite uma breve descrição..."
          >${esc(post?.descricao || "")}</textarea>
        </label>


        <label class="ace-mural-field">
          Ordem de exibição
          <input
            id="aceMuralOrder"
            type="number"
            min="0"
            step="1"
            value="${Number(post?.ordem || 0)}"
          >
          <span class="ace-mural-help">
            Menor número aparece primeiro.
          </span>
        </label>


        <label class="ace-mural-field">
          Status
          <select id="aceMuralActive">
            <option
              value="true"
              ${
                post?.ativo === false
                  ? ""
                  : "selected"
              }
            >
              Ativo
            </option>
            <option
              value="false"
              ${
                post?.ativo === false
                  ? "selected"
                  : ""
              }
            >
              Oculto
            </option>
          </select>
        </label>


        <div class="ace-mural-field full">

          Origem do conteúdo

          <div class="ace-mural-source-choice">

            <label>
              <input
                type="radio"
                name="aceMuralSource"
                value="upload"
                checked
              >
              📁 Upload do aparelho
            </label>

            <label>
              <input
                type="radio"
                name="aceMuralSource"
                value="link"
              >
              🔗 Link externo
            </label>

          </div>

        </div>


        <label
          id="aceMuralUploadField"
          class="ace-mural-field full"
        >
          ${
            editing
              ? "Trocar imagem ou vídeo (opcional)"
              : "Imagem ou vídeo"
          }

          <input
            id="aceMuralFile"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
          >

          <span class="ace-mural-help">
            No celular, toque acima para escolher uma imagem ou vídeo da galeria/arquivos.
          </span>

          <div
            id="aceMuralUploadStatus"
            class="ace-mural-ready-status"
          ></div>

          ${
            editing &&
            post?.arquivo_path
              ? `
                  <div class="ace-mural-current-file">
                    Arquivo atual: ${esc(post.arquivo_path)}
                  </div>
                `
              : ""
          }

        </label>


        <label
          id="aceMuralLinkField"
          class="ace-mural-field full"
          style="display:none"
        >
          Link da imagem ou vídeo

          <input
            id="aceMuralExternalUrl"
            type="url"
            inputmode="url"
            placeholder="Cole aqui o link da imagem, vídeo ou YouTube"
          >

          <span class="ace-mural-help">
            Aceita link direto de imagem/vídeo e links do YouTube.
          </span>

          <div
            id="aceMuralLinkStatus"
            class="ace-mural-ready-status"
          ></div>

        </label>

      </div>


      <div class="ace-mural-modal-actions">

        <button
          id="aceMuralCancel"
          type="button"
        >
          Cancelar
        </button>

        <button
          id="aceMuralSave"
          type="button"
        >
          💾 Salvar publicação
        </button>

      </div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  const muralSourceRadios =
    modal.querySelectorAll(
      'input[name="aceMuralSource"]'
    );


  const updateMuralSourceFields =
    () => {

      const source =
        modal.querySelector(
          'input[name="aceMuralSource"]:checked'
        )?.value || "upload";


      const uploadField =
        document.getElementById(
          "aceMuralUploadField"
        );


      const linkField =
        document.getElementById(
          "aceMuralLinkField"
        );


      if (uploadField) {
        uploadField.style.display =
          source === "upload"
            ? ""
            : "none";
      }


      if (linkField) {
        linkField.style.display =
          source === "link"
            ? ""
            : "none";
      }

    };


  muralSourceRadios.forEach(
    radio =>
      radio.addEventListener(
        "change",
        updateMuralSourceFields
      )
  );


  updateMuralSourceFields();


  const muralFileInput =
    document.getElementById(
      "aceMuralFile"
    );

  const muralUploadStatus =
    document.getElementById(
      "aceMuralUploadStatus"
    );

  if (muralFileInput) {

    muralFileInput.addEventListener(
      "change",
      () => {

        const file =
          muralFileInput.files?.[0];

        if (!file) {

          if (muralUploadStatus) {
            muralUploadStatus.className =
              "ace-mural-ready-status";
            muralUploadStatus.textContent =
              "";
          }

          return;
        }


        const allowed =
          (
            String(file.type || "")
              .startsWith("image/")
          ) ||
          [
            "video/mp4",
            "video/webm"
          ].includes(
            String(file.type || "")
          );


        if (!allowed) {

          if (muralUploadStatus) {
            muralUploadStatus.className =
              "ace-mural-ready-status show error";
            muralUploadStatus.textContent =
              "❌ Formato não permitido. Use imagem, MP4 ou WEBM.";
          }

          return;
        }


        const sizeMb =
          file.size /
          1024 /
          1024;


        if (sizeMb > 100) {

          if (muralUploadStatus) {
            muralUploadStatus.className =
              "ace-mural-ready-status show error";
            muralUploadStatus.textContent =
              "❌ Arquivo maior que 100 MB.";
          }

          return;
        }


        if (muralUploadStatus) {
          muralUploadStatus.className =
            "ace-mural-ready-status show";
          muralUploadStatus.textContent =
            `✅ Arquivo pronto para publicar: ${file.name} (${sizeMb.toFixed(1)} MB)`;
        }

      }
    );

  }


  const muralExternalInput =
    document.getElementById(
      "aceMuralExternalUrl"
    );

  const muralLinkStatus =
    document.getElementById(
      "aceMuralLinkStatus"
    );

  const validateMuralExternalInput =
    () => {

      const value =
        muralExternalInput?.value
          ?.trim() || "";

      if (!value) {

        if (muralLinkStatus) {
          muralLinkStatus.className =
            "ace-mural-ready-status";
          muralLinkStatus.textContent =
            "";
        }

        return false;
      }


      const valid =
        isMuralAceValidExternalUrl(
          value
        );


      if (muralLinkStatus) {

        if (valid) {

          muralLinkStatus.className =
            "ace-mural-ready-status show";

          muralLinkStatus.textContent =
            getMuralAceYouTubeEmbedUrl(value)
              ? "✅ Link do YouTube reconhecido e pronto para publicar."
              : "✅ Link válido e pronto para publicar.";

        } else {

          muralLinkStatus.className =
            "ace-mural-ready-status show error";

          muralLinkStatus.textContent =
            "❌ Link inválido. Use um endereço começando com http:// ou https://.";

        }

      }

      return valid;

    };


  muralExternalInput?.addEventListener(
    "input",
    validateMuralExternalInput
  );

  muralExternalInput?.addEventListener(
    "change",
    validateMuralExternalInput
  );


  document
    .getElementById(
      "aceMuralCancel"
    )
    .onclick =
      () =>
        modal.remove();


  document
    .getElementById(
      "aceMuralSave"
    )
    .onclick =
      () =>
        saveMuralAcePost(
          post
        );

}


function getMuralAceFileType(
  file
) {

  if (
    String(
      file?.type || ""
    ).startsWith(
      "video/"
    )
  ) {
    return "video";
  }

  return "imagem";

}


async function uploadMuralAceFile(
  file
) {

  const extension =
    String(
      file.name || ""
    )
      .split(".")
      .pop()
      .toLowerCase()
      .replace(
        /[^a-z0-9]/g,
        ""
      ) ||
    (
      getMuralAceFileType(file) ===
      "video"
        ? "mp4"
        : "jpg"
    );


  const safeName =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2,10)}.${extension}`;


  const path =
    `publicacoes/${safeName}`;


  const {
    error
  } =
    await supabaseClient
      .storage
      .from(
        "mural-ace"
      )
      .upload(
        path,
        file,
        {
          cacheControl:
            "3600",
          upsert:
            false
        }
      );


  if (error) {
    throw error;
  }


  const {
    data
  } =
    supabaseClient
      .storage
      .from(
        "mural-ace"
      )
      .getPublicUrl(
        path
      );


  return {
    path,
    url:
      data?.publicUrl || "",
    type:
      getMuralAceFileType(
        file
      )
  };

}


async function saveMuralAcePost(
  existingPost = null
) {

  if (
    !isMuralAceAdmin()
  ) {
    return;
  }


  const title =
    document
      .getElementById(
        "aceMuralTitle"
      )
      ?.value
      .trim() || "";


  const description =
    document
      .getElementById(
        "aceMuralDescription"
      )
      ?.value
      .trim() || "";


  const order =
    Number(
      document
        .getElementById(
          "aceMuralOrder"
        )
        ?.value || 0
    );


  const active =
    document
      .getElementById(
        "aceMuralActive"
      )
      ?.value !==
      "false";


  const source =
    document.querySelector(
      'input[name="aceMuralSource"]:checked'
    )?.value || "upload";


  const file =
    source === "upload"
      ? (
          document
            .getElementById(
              "aceMuralFile"
            )
            ?.files?.[0] ||
          null
        )
      : null;


  const externalUrl =
    source === "link"
      ? (
          document
            .getElementById(
              "aceMuralExternalUrl"
            )
            ?.value
            .trim() || ""
        )
      : "";


  if (!title) {

    await showAceConfirm(
      "Informe o título da publicação antes de salvar.",
      "⚠️ Campo obrigatório"
    );

    document
      .getElementById(
        "aceMuralTitle"
      )
      ?.focus();

    return;
  }


  if (
    !existingPost &&
    source === "upload" &&
    !file
  ) {

    await showAceConfirm(
      "Selecione uma imagem ou vídeo antes de salvar a publicação.",
      "⚠️ Arquivo obrigatório"
    );

    return;
  }


  if (
    !existingPost &&
    source === "link" &&
    !externalUrl
  ) {

    await showAceConfirm(
      "Cole o link da imagem, vídeo ou YouTube antes de salvar.",
      "⚠️ Link obrigatório"
    );

    document
      .getElementById(
        "aceMuralExternalUrl"
      )
      ?.focus();

    return;
  }


  if (
    source === "link" &&
    externalUrl &&
    !isMuralAceValidExternalUrl(
      externalUrl
    )
  ) {

    await showAceConfirm(
      "Informe um link válido começando com http:// ou https://.",
      "⚠️ Link inválido"
    );

    document
      .getElementById(
        "aceMuralExternalUrl"
      )
      ?.focus();

    return;
  }


  const button =
    document.getElementById(
      "aceMuralSave"
    );


  if (button) {
    button.disabled = true;
    button.textContent =
      "⏳ Salvando...";
  }


  const uploadStatus =
    document.getElementById(
      "aceMuralUploadStatus"
    );

  const linkStatus =
    document.getElementById(
      "aceMuralLinkStatus"
    );


  if (
    source === "upload" &&
    file &&
    uploadStatus
  ) {

    uploadStatus.className =
      "ace-mural-ready-status show";

    uploadStatus.textContent =
      "✅ Arquivo validado. Clique em Salvar publicação para concluir.";

  }


  if (
    source === "link" &&
    externalUrl &&
    linkStatus
  ) {

    linkStatus.className =
      "ace-mural-ready-status show";

    linkStatus.textContent =
      getMuralAceYouTubeEmbedUrl(
        externalUrl
      )
        ? "✅ Link do YouTube validado. Clique em Salvar publicação para concluir."
        : "✅ Link validado. Clique em Salvar publicação para concluir.";

  }


  let newUpload =
    null;


  try {

    if (file) {

      if (button) {
        button.textContent =
          "⬆️ Enviando arquivo...";
      }

      newUpload =
        await uploadMuralAceFile(
          file
        );


      const uploadStatus =
        document.getElementById(
          "aceMuralUploadStatus"
        );

      if (uploadStatus) {
        uploadStatus.className =
          "ace-mural-ready-status show";
        uploadStatus.textContent =
          "✅ Upload concluído com sucesso. Finalizando a publicação...";
      }

      if (button) {
        button.textContent =
          "💾 Salvando publicação...";
      }

    }


    if (
      source === "link" &&
      externalUrl
    ) {

      const validLink =
        isMuralAceValidExternalUrl(
          externalUrl
        );

      if (!validLink) {
        throw new Error(
          "O link informado é inválido."
        );
      }

      if (button) {
        button.textContent =
          "💾 Salvando link...";
      }


      if (linkStatus) {
        linkStatus.className =
          "ace-mural-ready-status show";
        linkStatus.textContent =
          "✅ Link validado com sucesso. Finalizando a publicação...";
      }

    }


    const payload = {

      titulo:
        title,

      descricao:
        description,

      ordem:
        Number.isFinite(order)
          ? order
          : 0,

      ativo:
        active,

      updated_at:
        new Date()
          .toISOString()

    };


    if (newUpload) {

      payload.tipo =
        newUpload.type;

      payload.arquivo_url =
        newUpload.url;

      payload.arquivo_path =
        newUpload.path;

    }


    if (
      source === "link" &&
      externalUrl
    ) {

      const lowerUrl =
        externalUrl
          .toLowerCase()
          .split("?")[0]
          .split("#")[0];


      const isVideoLink =
        Boolean(
          getMuralAceYouTubeEmbedUrl(
            externalUrl
          )
        ) ||
        /\.(mp4|webm|mov|m4v)$/i.test(
          lowerUrl
        );


      payload.tipo =
        isVideoLink
          ? "video"
          : "imagem";

      payload.arquivo_url =
        externalUrl;

      payload.arquivo_path =
        null;

    }


    if (existingPost) {

      const {
        error
      } =
        await supabaseClient
          .from(
            "mural_ace"
          )
          .update(
            payload
          )
          .eq(
            "id",
            existingPost.id
          );


      if (error) {
        throw error;
      }


      if (
        (
          newUpload ||
          (
            source === "link" &&
            externalUrl
          )
        ) &&
        existingPost.arquivo_path
      ) {

        const {
          error: removeOldError
        } =
          await supabaseClient
            .storage
            .from(
              "mural-ace"
            )
            .remove([
              existingPost.arquivo_path
            ]);


        if (removeOldError) {
          console.warn(
            "ACE Mural: publicação salva, mas não foi possível apagar o arquivo antigo:",
            removeOldError
          );
        }

      }

    } else {

      const {
        error
      } =
        await supabaseClient
          .from(
            "mural_ace"
          )
          .insert({
            ...payload,

            tipo:
              payload.tipo,

            arquivo_url:
              payload.arquivo_url,

            arquivo_path:
              payload.arquivo_path || null,

            data_publicacao:
              new Date()
                .toISOString()

          });


      if (error) {
        throw error;
      }

    }


    document
      .getElementById(
        "aceMuralModal"
      )
      ?.remove();


    await loadMuralAcePosts();

    renderMuralAce();


    showAceSuccess(
      existingPost
        ? "✅ Publicação atualizada com sucesso!"
        : "✅ Publicação realizada com sucesso!"
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO SALVAR MURAL:",
      error
    );


    if (
      newUpload?.path
    ) {

      try {

        await supabaseClient
          .storage
          .from(
            "mural-ace"
          )
          .remove([
            newUpload.path
          ]);

      } catch {
        // Apenas limpeza de arquivo órfão.
      }

    }


    const rawMessage =
      String(
        error?.message ||
        "Verifique as permissões do Supabase."
      );


    const friendlyMessage =
      rawMessage
        .toLowerCase()
        .includes(
          "row-level security"
        )
        ? (
            "O Supabase bloqueou a publicação por permissão (RLS).\n\n" +
            "Execute o arquivo SQL de correção das permissões do Mural ACE e entre novamente com o e-mail administrador."
          )
        : rawMessage;


    await showAceConfirm(
      "Não foi possível salvar a publicação.\n\n" +
      friendlyMessage,
      "❌ Erro"
    );


  } finally {

    if (
      button &&
      document.body.contains(
        button
      )
    ) {

      button.disabled =
        false;

      button.textContent =
        "💾 Salvar publicação";

    }

  }

}


async function deleteMuralAcePost(
  postId
) {

  if (
    !isMuralAceAdmin()
  ) {
    return;
  }


  const post =
    muralAcePosts.find(
      item =>
        String(item.id) ===
        String(postId)
    );


  if (!post) {
    return;
  }


  const confirmed =
    await showAceConfirm(
      `Excluir a publicação "${post.titulo}"?\n\n` +
      "A imagem ou vídeo também será removido do Mural ACE.",
      "Excluir publicação"
    );


  if (!confirmed) {
    return;
  }


  try {

    const {
      error
    } =
      await supabaseClient
        .from(
          "mural_ace"
        )
        .delete()
        .eq(
          "id",
          post.id
        );


    if (error) {
      throw error;
    }


    if (
      post.arquivo_path
    ) {

      const {
        error: storageError
      } =
        await supabaseClient
          .storage
          .from(
            "mural-ace"
          )
          .remove([
            post.arquivo_path
          ]);


      if (storageError) {
        console.warn(
          "ACE Mural: registro excluído, mas não foi possível apagar o arquivo:",
          storageError
        );
      }

    }


    await loadMuralAcePosts();

    renderMuralAce();


    showAceSuccess(
      "✅ Publicação excluída com sucesso!"
    );


  } catch (error) {

    console.error(
      "ACE - ERRO AO EXCLUIR PUBLICAÇÃO:",
      error
    );


    await showAceConfirm(
      "Não foi possível excluir a publicação.\n\n" +
      (
        error?.message ||
        "Verifique o Supabase."
      ),
      "❌ Erro"
    );

  }

}


function renderAll() {

  refreshSelects();

  renderMuralAce();

  renderDashboard();

  renderEntries();

  renderMovements();

  renderBasketModule();

  renderAttendance();

  renderStock();

  renderCadastros();

  renderHistory();

}


// ============================================================
// 22. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  if (appStarted) return;
  appStarted = true;

  console.log(
    "ACE Controle de Alimentos iniciado."
  );


  try {

    if (navigator.onLine) {

      db =
        await loadFromSupabase();

      saveOfflineSnapshot(db);

    } else {

      const offlineDb =
        loadOfflineSnapshot();

      if (!offlineDb) {
        throw new Error(
          "Este aparelho ainda não possui dados offline. Conecte-se à internet uma vez para sincronizar."
        );
      }

      db = offlineDb;
    }


    setDates();

    // Cria as páginas dinâmicas antes de ligar a navegação,
    // para os novos botões receberem o mesmo comportamento das outras abas.
    setupMuralAcePage();

    setupHistoryPage();

    await loadMuralAcePosts();

    renderMuralAce();

    nav();

    // Sempre abre o aplicativo diretamente no Mural ACE.
    openDefaultMuralAcePage();

    bindEvents();

    setupPWA();

    addUserBar();

    setupOfflineStatus();

    renderAll();


    console.log(
      "Aplicativo carregado com sucesso."
    );

  } catch (error) {

    appStarted = false;

    console.error(
      "Erro ao iniciar aplicativo:",
      error
    );


    const message =
      String(
        error?.message ||
        ""
      );


    // --------------------------------------------------------
    // JWT inválido:
    // não deixa o usuário preso no dashboard.
    // O SIGNED_OUT também será tratado pelo listener.
    // --------------------------------------------------------

    if (
      message
        .toLowerCase()
        .includes("jwt")
    ) {

      currentUser = null;


      const oldLogin =
        document.getElementById(
          "loginScreen"
        );


      if (oldLogin) {

        oldLogin.remove();

      }


      createLoginScreen();


      const loginError =
        document.getElementById(
          "loginError"
        );


      if (loginError) {

        loginError.textContent =
          "Sua sessão expirou ou ficou inválida. Entre novamente com seu e-mail e senha.";

        loginError.classList.add(
          "show"
        );

      }


      return;

    }


    await showAceConfirm(
      "Não foi possível carregar os dados do sistema.\n\n" +
      (
        error?.message ||
        "Verifique a conexão com o Supabase."
      ),
      "❌ Erro"
    );

  }

}


// ============================================================
// 23. VERIFICA LOGIN
// ============================================================

async function startAuth() {

  createLoginScreen();

  // Garante o botão mesmo se uma versão anterior do HTML
  // do login estiver em cache no navegador.
  ensureForgotPasswordButton();


  // ==========================================================
  // MONITORA ALTERAÇÕES DE AUTENTICAÇÃO
  //
  // Registrado ANTES de getSession() para que, se o token
  // inválido for limpo durante initApp(), a tela de login
  // volte imediatamente.
  // ==========================================================

  supabaseClient.auth.onAuthStateChange(
    (event, session) => {

      console.log(
        "ACE AUTH:",
        event
      );


      if (
        event === "PASSWORD_RECOVERY"
      ) {

        window.acePasswordRecoveryActive = true;

        showPasswordResetScreen();

        return;

      }


      if (
        event === "SIGNED_IN" &&
        session?.user
      ) {

        if (window.aceSignupInProgress) {
          return;
        }

        currentUser =
          session.user;

        rememberCurrentUser();


        document
          .getElementById(
            "loginScreen"
          )
          ?.remove();


        initApp();

      }


      if (
        event === "SIGNED_OUT"
      ) {

        currentUser = null;

        appStarted = false;

        if (window.aceSignupSigningOut) {
          window.aceSignupSigningOut = false;
          return;
        }

        if (window.acePasswordResetCompleted) {

          window.acePasswordResetCompleted = false;

          const loginScreen =
            document.getElementById("loginScreen");

          if (!loginScreen) {
            createLoginScreen();
          }

          return;

        }

        location.reload();

      }

    }
  );


  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {

      throw error;

    }


    if (
      data?.session?.user &&
      !window.acePasswordRecoveryActive
    ) {

      currentUser =
        data.session.user;

      rememberCurrentUser();


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      await initApp();

      return;

    }


    if (
      data?.session?.user &&
      window.acePasswordRecoveryActive
    ) {

      showPasswordResetScreen();

      return;

    }


    // Não está logado.
    // Mantém a tela de login aberta.

  } catch (err) {

    console.error(
      "Erro ao verificar sessão:",
      err
    );


    const error =
      document.getElementById(
        "loginError"
      );


    if (error) {

      error.textContent =
        "Não foi possível conectar ao Supabase. Verifique a URL e a Publishable Key.";

      error.classList.add(
        "show"
      );

    }

  }

}


// ============================================================
// 24. INÍCIO
// ============================================================

startAuth();
