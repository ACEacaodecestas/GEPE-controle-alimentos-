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

  origins: [
    "Piedade",
    "Água Fria"
  ],

  reasons: [
    "Gorbulho",
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


// ============================================================
// 4. FUNÇÕES BÁSICAS
// ============================================================

function uid() {

  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);

}


function isoToday() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


function load() {

  try {

    const raw =
      localStorage.getItem(KEY);

    if (raw) {

      return JSON.parse(raw);

    }

  } catch (e) {

    console.error(
      "Erro ao carregar dados locais:",
      e
    );

  }


  return {

    origins:
      DEFAULT.origins.map(
        x => ({
          id: uid(),
          name: x
        })
      ),

    reasons:
      DEFAULT.reasons.map(
        x => ({
          id: uid(),
          name: x
        })
      ),

    foods:
      DEFAULT.foods.map(
        x => ({
          id: uid(),
          name: x
        })
      ),

    people:
      DEFAULT.people,

    entries: [],

    movements: [],

    attendance: {}

  };

}


function save() {

  try {

    localStorage.setItem(
      KEY,
      JSON.stringify(db)
    );

  } catch (e) {

    console.error(
      "Erro ao salvar:",
      e
    );

  }

}


// ============================================================
// 4.1 CARREGAMENTO DOS DADOS DO SUPABASE
// ============================================================

async function loadFromSupabase() {

  if (!currentUser) {

    throw new Error(
      "Usuário não autenticado."
    );

  }


  console.log(
    "Carregando dados do Supabase..."
  );


  try {


    // ----------------------------------------------------------
    // PESSOAS
    // ----------------------------------------------------------

    const {
      data: people,
      error: peopleError
    } =
      await supabaseClient
        .from("Pessoas")
        .select("*")
        .order("nome");


    if (peopleError) {

      throw peopleError;

    }


    // ----------------------------------------------------------
    // ALIMENTOS
    // ----------------------------------------------------------

    const {
      data: foods,
      error: foodsError
    } =
      await supabaseClient
        .from("Alimentos")
        .select("*")
        .order("nome");


    if (foodsError) {

      throw foodsError;

    }


    // ----------------------------------------------------------
    // ORIGENS
    // ----------------------------------------------------------

    const {
      data: origins,
      error: originsError
    } =
      await supabaseClient
        .from("origens")
        .select("*")
        .order("nome");


    if (originsError) {

      throw originsError;

    }


    // ----------------------------------------------------------
    // ENTRADAS
    // ----------------------------------------------------------

    const {
      data: entries,
      error: entriesError
    } =
      await supabaseClient
        .from("entradas")
        .select("*")
        .order(
          "data_entrada",
          {
            ascending: false
          }
        );


    if (entriesError) {

      throw entriesError;

    }


    // ----------------------------------------------------------
    // SAÍDAS
    // ----------------------------------------------------------

    const {
      data: outputs,
      error: outputsError
    } =
      await supabaseClient
        .from("saídas")
        .select("*")
        .order(
          "data_saida",
          {
            ascending: false
          }
        );


    if (outputsError) {

      throw outputsError;

    }


    // ----------------------------------------------------------
    // PERDAS
    // ----------------------------------------------------------

    const {
      data: losses,
      error: lossesError
    } =
      await supabaseClient
        .from("perdas")
        .select("*")
        .order(
          "data_perda",
          {
            ascending: false
          }
        );


    if (lossesError) {

      throw lossesError;

    }


    // ----------------------------------------------------------
    // PRESENÇA
    // ----------------------------------------------------------

    const {
      data: attendanceRows,
      error: attendanceError
    } =
      await supabaseClient
        .from("presença")
        .select("*")
        .order(
          "data",
          {
            ascending: false
          }
        );


    if (attendanceError) {

      throw attendanceError;

    }


    // ----------------------------------------------------------
    // MOTIVOS
    // Não existe tabela de motivos no Supabase neste momento.
    // Portanto, os motivos permanecem no cadastro local do app.
    // ----------------------------------------------------------

    const reasons =
      DEFAULT.reasons.map(
        name => ({
          id: name,
          name
        })
      );


    // ----------------------------------------------------------
    // CONVERSÃO PARA O FORMATO QUE O APP JÁ UTILIZA
    // ----------------------------------------------------------

    const dbSupabase = {


      // --------------------------------------------------------
      // PESSOAS
      // --------------------------------------------------------

      people:
        (people || []).map(
          p => ({

            id:
              p.id,

            name:
              p.nome,

            registration:
              p["matrícula"]

          })
        ),


      // --------------------------------------------------------
      // ALIMENTOS
      // --------------------------------------------------------

      foods:
        (foods || []).map(
          f => ({

            id:
              f.id,

            name:
              f.nome

          })
        ),


      // --------------------------------------------------------
      // ORIGENS
      // --------------------------------------------------------

      origins:
        (origins || []).map(
          o => ({

            id:
              o.id,

            name:
              o.nome

          })
        ),


      // --------------------------------------------------------
      // ENTRADAS
      // --------------------------------------------------------

      entries:
        (entries || []).map(
          e => ({

            id:
              e.id,

            date:
              e.data_entrada,

            foodId:
              e.alimento_id,

            qty:
              Number(
                e.quantidade || 0
              ),

            originId:
              e.origem_id,

            note:
              "",

            createdAt:
              e.created_at ||
              new Date().toISOString()

          })
        ),


      // --------------------------------------------------------
      // SAÍDAS + PERDAS
      // --------------------------------------------------------

      movements: [


        // ------------------------------------------------------
        // SAÍDAS
        // ------------------------------------------------------

        ...(outputs || []).map(
          s => ({

            id:
              "saida-" + s.id,

            date:
              s.data_saida,

            type:
              "saida",

            foodId:
              s.alimento_id,

            qty:
              Number(
                s.quantidade || 0
              ),

            originId:
              s.origem_id,

            reasonId:
              null,

            note:
              s.destino || "",

            createdAt:
              s.created_at ||
              new Date().toISOString()

          })
        ),


        // ------------------------------------------------------
        // PERDAS
        // ------------------------------------------------------

        ...(losses || []).map(
          p => ({

            id:
              "perda-" + p.id,

            date:
              p.data_perda,

            type:
              "perda",

            foodId:
              p.alimento_id,

            qty:
              Number(
                p.quantidade || 0
              ),

            originId:
              p.origem_id,

            reasonId:
              reasons.find(
                r =>
                  r.name ===
                  p.motivo
              )?.id ||

              p.motivo ||

              null,

            note:
              "",

            createdAt:
              p.created_at ||
              new Date().toISOString()

          })
        )

      ],


      // --------------------------------------------------------
      // PRESENÇA
      // --------------------------------------------------------

      attendance:
        {},


      // --------------------------------------------------------
      // MOTIVOS
      // --------------------------------------------------------

      reasons

    };


    // ----------------------------------------------------------
    // ORGANIZAR PRESENÇA POR DATA
    // ----------------------------------------------------------

    (attendanceRows || [])
      .forEach(
        row => {

          if (
            !dbSupabase
              .attendance[
                row.data
              ]
          ) {

            dbSupabase
              .attendance[
                row.data
              ] = [];

          }


          if (
            row.present
          ) {

            dbSupabase
              .attendance[
                row.data
              ]
              .push(
                row.pessoa_id
              );

          }

        }
      );


    console.log(
      "Dados carregados do Supabase:",
      dbSupabase
    );


    return dbSupabase;


  } catch (error) {

    console.error(
      "Erro ao carregar dados do Supabase:",
      error
    );

    throw error;

  }

}

// ============================================================
// FIM DA PARTE 1/5
// ============================================================

// ============================================================
// PARTE 2 - CADASTRO DE USUÁRIO + TRATAMENTO DE AUTENTICAÇÃO
// ============================================================


// ============================================================
// TRADUZIR ERROS DO SUPABASE
// ============================================================

function traduzirErroLogin(error) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    ).toLowerCase();


  if (
    message.includes(
      "invalid login credentials"
    )
  ) {

    return (
      "E-mail ou senha incorretos."
    );

  }


  if (
    message.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Seu e-mail ainda não foi confirmado. " +
      "Verifique sua caixa de entrada."
    );

  }


  if (
    message.includes(
      "user not found"
    )
  ) {

    return (
      "Usuário não encontrado."
    );

  }


  if (
    message.includes(
      "too many requests"
    )
  ) {

    return (
      "Muitas tentativas. Aguarde alguns minutos e tente novamente."
    );

  }


  if (
    message.includes(
      "jwt"
    )
  ) {

    return (
      "A sessão expirou. Atualize a página e tente novamente."
    );

  }


  if (
    message.includes(
      "network"
    )
  ) {

    return (
      "Erro de conexão. Verifique a internet."
    );

  }


  return (
    error?.message ||
    "Não foi possível entrar no sistema."
  );

}


// ============================================================
// TRADUZIR ERROS DE CADASTRO
// ============================================================

function traduzirErroCadastro(error) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    ).toLowerCase();


  if (
    message.includes(
      "user already registered"
    )
  ) {

    return (
      "Este e-mail já possui uma conta. " +
      "Volte para o login."
    );

  }


  if (
    message.includes(
      "already registered"
    )
  ) {

    return (
      "Este e-mail já possui uma conta."
    );

  }


  if (
    message.includes(
      "password should be at least"
    )
  ) {

    return (
      "A senha é muito curta."
    );

  }


  if (
    message.includes(
      "invalid email"
    )
  ) {

    return (
      "Digite um e-mail válido."
    );

  }


  if (
    message.includes(
      "email rate limit exceeded"
    )
  ) {

    return (
      "Limite de envio de e-mails atingido. " +
      "Aguarde alguns minutos e tente novamente."
    );

  }


  if (
    message.includes(
      "signup is disabled"
    )
  ) {

    return (
      "O cadastro de novos usuários está desativado."
    );

  }


  return (
    error?.message ||
    "Não foi possível criar a conta."
  );

}


// ============================================================
// CADASTRAR NOVO USUÁRIO
// ============================================================

async function registerUser(e) {

  e.preventDefault();


  // ----------------------------------------------------------
  // PEGAR CAMPOS
  // ----------------------------------------------------------

  const name =
    document
      .getElementById(
        "registerName"
      )
      .value
      .trim();


  const email =
    document
      .getElementById(
        "registerEmail"
      )
      .value
      .trim()
      .toLowerCase();


  const password =
    document
      .getElementById(
        "registerPassword"
      )
      .value;


  const confirmPassword =
    document
      .getElementById(
        "registerPasswordConfirm"
      )
      .value;


  const button =
    document.getElementById(
      "registerButton"
    );


  const error =
    document.getElementById(
      "loginError"
    );


  const success =
    document.getElementById(
      "loginSuccess"
    );


  const loading =
    document.getElementById(
      "loginLoading"
    );


  // ----------------------------------------------------------
  // LIMPAR MENSAGENS
  // ----------------------------------------------------------

  clearAuthMessages();


  // ----------------------------------------------------------
  // VALIDAR NOME
  // ----------------------------------------------------------

  if (
    !name
  ) {

    error.textContent =
      "Digite seu nome.";


    error.classList.add(
      "show"
    );


    return;

  }


  // ----------------------------------------------------------
  // VALIDAR E-MAIL
  // ----------------------------------------------------------

  if (
    !email ||
    !email.includes("@")
  ) {

    error.textContent =
      "Digite um e-mail válido.";


    error.classList.add(
      "show"
    );


    return;

  }


  // ----------------------------------------------------------
  // VALIDAR SENHA
  // ----------------------------------------------------------

  if (
    password.length <
    6
  ) {

    error.textContent =
      "A senha deve ter pelo menos 6 caracteres.";


    error.classList.add(
      "show"
    );


    return;

  }


  // ----------------------------------------------------------
  // CONFIRMAR SENHA
  // ----------------------------------------------------------

  if (
    password !==
    confirmPassword
  ) {

    error.textContent =
      "As senhas não são iguais.";


    error.classList.add(
      "show"
    );


    return;

  }


  // ----------------------------------------------------------
  // INDICAR QUE ESTAMOS CADASTRANDO
  // ----------------------------------------------------------

  registrationInProgress =
    true;


  button.disabled =
    true;


  button.textContent =
    "Criando conta...";


  loading.textContent =
    "Criando sua conta...";


  try {


    console.log(
      "ACE: criando usuário:",
      email
    );


    // ========================================================
    // CRIAR CONTA NO SUPABASE AUTH
    // ========================================================

    const {
      data,
      error: signUpError
    } =
      await supabaseClient
        .auth
        .signUp({

          email:

            email,

          password:

            password,

          options: {

            data: {

              nome:
                name,

              nome_completo:
                name

            }

          }

        });


    // --------------------------------------------------------
    // VERIFICAR ERRO
    // --------------------------------------------------------

    if (
      signUpError
    ) {

      throw signUpError;

    }


    console.log(
      "ACE: cadastro realizado:",
      data
    );


    // ========================================================
    // IMPORTANTE
    // ========================================================
    //
    // SE A CONFIRMAÇÃO DE E-MAIL ESTIVER ATIVADA NO SUPABASE,
    // normalmente data.session será NULL.
    //
    // MAS SE ESTIVER DESATIVADA, O SUPABASE PODE DEVOLVER
    // UMA SESSÃO AUTOMATICAMENTE.
    //
    // NÃO QUEREMOS ENTRAR NO SISTEMA AUTOMATICAMENTE.
    //
    // POR ISSO, SE EXISTIR SESSÃO, FAZEMOS LOGOUT.
    //
    // ========================================================

    if (
      data?.session
    ) {

      console.log(
        "ACE: sessão criada automaticamente após cadastro."
      );


      try {

        await supabaseClient
          .auth
          .signOut();

      } catch (
        signOutError
      ) {

        console.warn(
          "ACE: não foi possível encerrar sessão automática:",
          signOutError
        );

      }

    }


    // ========================================================
    // MOSTRAR MENSAGEM DE SUCESSO
    // ========================================================

    success.textContent =
      "Conta criada com sucesso! " +
      "Verifique seu e-mail para confirmar a conta. " +
      "Depois volte para o login.";


    success.classList.add(
      "show"
    );


    loading.textContent =
      "";


    // ========================================================
    // LIMPAR SENHAS
    // ========================================================

    document
      .getElementById(
        "registerPassword"
      )
      .value =
      "";


    document
      .getElementById(
        "registerPasswordConfirm"
      )
      .value =
      "";


    // ========================================================
    // GUARDAR E-MAIL NO LOGIN
    // ========================================================

    const loginEmail =
      document.getElementById(
        "loginEmail"
      );


    if (
      loginEmail
    ) {

      loginEmail.value =
        email;

    }


    // ========================================================
    // VOLTAR PARA A TELA DE LOGIN
    // ========================================================
    //
    // Não fazemos imediatamente.
    //
    // Primeiro deixamos a mensagem de sucesso aparecer.
    // ========================================================

    setTimeout(

      () => {

        registrationInProgress =
          false;


        showLoginView();


        const newSuccess =
          document.getElementById(
            "loginSuccess"
          );


        if (
          newSuccess
        ) {

          newSuccess.textContent =
            "Conta criada com sucesso! " +
            "Verifique seu e-mail para confirmar a conta.";

          newSuccess.classList.add(
            "show"
          );

        }


        const emailField =
          document.getElementById(
            "loginEmail"
          );


        if (
          emailField
        ) {

          emailField.value =
            email;

        }

      },

      100

    );


    // ========================================================
    // NÃO ENTRAR NO SISTEMA
    // ========================================================

    return;


  } catch (
    err
  ) {

    console.error(
      "ACE - ERRO AO CRIAR CONTA:",
      err
    );


    registrationInProgress =
      false;


    error.textContent =
      traduzirErroCadastro(
        err
      );


    error.classList.add(
      "show"
    );


    loading.textContent =
      "";


  } finally {

    button.disabled =
      false;


    button.textContent =
      "📝 Criar conta";

  }

}


// ============================================================
// VERIFICAR SE O USUÁRIO POSSUI UMA SESSÃO VÁLIDA
// ============================================================

async function getCurrentSession() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (
      error
    ) {

      console.error(
        "ACE - ERRO AO OBTER SESSÃO:",
        error
      );


      return null;

    }


    return (
      data?.session ||
      null
    );


  } catch (
    error
  ) {

    console.error(
      "ACE - ERRO DE SESSÃO:",
      error
    );


    return null;

  }

}


// ============================================================
// ATUALIZAR USUÁRIO ATUAL
// ============================================================

function setCurrentUserFromSession(
  user
) {

  if (
    !user
  ) {

    return;

  }


  try {

    // --------------------------------------------------------
    // GARANTIR QUE currentUser EXISTE
    // --------------------------------------------------------

    if (
      typeof currentUser ===
      "undefined" ||
      currentUser === null
    ) {

      currentUser = {};

    }


    // --------------------------------------------------------
    // DADOS DO USUÁRIO
    // --------------------------------------------------------

    currentUser.id =
      user.id ||
      null;


    currentUser.email =
      user.email ||
      "";


    currentUser.nome =
      user.user_metadata?.nome ||
      user.user_metadata?.nome_completo ||
      user.email ||
      "";


    currentUser.user =
      user;


    console.log(
      "ACE: usuário atual:",
      currentUser
    );


  } catch (
    error
  ) {

    console.error(
      "ACE - ERRO AO ATUALIZAR USUÁRIO:",
      error
    );

  }

}


// ============================================================
// ESCONDER TELA DE LOGIN
// ============================================================

function removeLoginScreen() {

  const loginScreen =
    document.getElementById(
      "loginScreen"
    );


  if (
    loginScreen
  ) {

    loginScreen.remove();

  }

}


// ============================================================
// MOSTRAR TELA DE LOGIN
// ============================================================

function ensureLoginScreen() {

  if (
    !document.getElementById(
      "loginScreen"
    )
  ) {

    createLoginScreen();

  }

}


// ============================================================
// FIM DA PARTE 2/5
// ============================================================

// ============================================================
// PARTE 3/5 - USUÁRIO + ESTOQUE + ENTRADAS + SAÍDAS + PRESENÇA
// ============================================================


// ============================================================
// 6. BARRA DO USUÁRIO
// ============================================================

function addUserBar() {

  const header =
    document.querySelector(
      ".ace-header-v6"
    );


  if (
    !header ||
    !currentUser
  ) {

    return;

  }


  if (
    document.getElementById(
      "userBar"
    )
  ) {

    return;

  }


  const bar =
    document.createElement(
      "div"
    );


  bar.id =
    "userBar";


  bar.className =
    "user-bar";


  bar.innerHTML = `

    <span class="user-email">
      ${esc(
        currentUser.email
      )}
    </span>

    <button
      id="logoutBtn"
      class="logout-btn"
      type="button"
    >
      🚪 Sair
    </button>

  `;


  header.appendChild(
    bar
  );


  const logoutBtn =
    document.getElementById(
      "logoutBtn"
    );


  if (
    logoutBtn
  ) {

    logoutBtn.addEventListener(
      "click",
      logoutUser
    );

  }

}


// ============================================================
// SAIR DO SISTEMA
// ============================================================

async function logoutUser() {

  if (
    !confirm(
      "Deseja sair do sistema?"
    )
  ) {

    return;

  }


  try {

    const {
      error
    } =
      await supabaseClient
        .auth
        .signOut();


    if (
      error
    ) {

      throw error;

    }


    currentUser =
      null;


    location.reload();


  } catch (
    error
  ) {

    console.error(
      "Erro ao sair:",
      error
    );


    toast(
      "Não foi possível sair do sistema."
    );

  }

}


// ============================================================
// 7. PREENCHER SELECTS
// ============================================================

function populateSelect(
  id,
  arr,
  placeholder =
    "Selecione..."
) {

  const el =
    document.getElementById(
      id
    );


  if (
    !el
  ) {

    return;

  }


  el.innerHTML =

    `<option value="">
      ${placeholder}
    </option>` +

    (arr || [])
      .map(
        x =>

          `<option value="${x.id}">
            ${esc(x.name)}
          </option>`

      )
      .join("");

}


// ============================================================
// DATAS
// ============================================================

function setDates() {

  const dateFields = [

    "entryDate",

    "movementDate",

    "dashboardDate",

    "attendanceDate"

  ];


  dateFields.forEach(
    id => {

      const el =
        document.getElementById(
          id
        );


      if (
        el
      ) {

        el.value =
          isoToday();

      }

    }
  );


  const start =
    document.getElementById(
      "reportStart"
    );


  const end =
    document.getElementById(
      "reportEnd"
    );


  if (
    start
  ) {

    start.value =
      isoToday();

  }


  if (
    end
  ) {

    end.value =
      isoToday();

  }

}


// ============================================================
// ATUALIZAR SELECTS
// ============================================================

function refreshSelects() {

  if (
    !db
  ) {

    return;

  }


  // ----------------------------------------------------------
  // ORIGENS
  // ----------------------------------------------------------

  populateSelect(
    "entryOrigin",
    db.origins
  );


  populateSelect(
    "movementOrigin",
    db.origins
  );


  // ----------------------------------------------------------
  // ALIMENTOS
  // ----------------------------------------------------------

  populateSelect(
    "entryFood",
    db.foods
  );


  populateSelect(
    "movementFood",
    db.foods
  );


  // ----------------------------------------------------------
  // MOTIVOS
  // ----------------------------------------------------------
  //
  // Mantemos os motivos existentes.
  // Não criamos tabela nova para motivos.
  //
  // ----------------------------------------------------------

  populateSelect(
    "movementReason",
    db.reasons
  );


  // ----------------------------------------------------------
  // ORIGEM DO RELATÓRIO
  // ----------------------------------------------------------

  const reportOrigin =
    document.getElementById(
      "reportOrigin"
    );


  if (
    reportOrigin
  ) {

    reportOrigin.innerHTML =

      '<option value="">Todas</option>' +

      (db.origins || [])
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
// 8. CÁLCULO DO ESTOQUE
// ============================================================

function calcStock() {

  const stock = {};


  // ----------------------------------------------------------
  // CRIAR ESTRUTURA POR ORIGEM
  // ----------------------------------------------------------

  (db.origins || [])
    .forEach(
      origin => {

        stock[
          origin.id
        ] = {};

      }
    );


  // ----------------------------------------------------------
  // INICIAR TODOS OS ALIMENTOS COM ZERO
  // ----------------------------------------------------------

  (db.foods || [])
    .forEach(
      food => {

        (db.origins || [])
          .forEach(
            origin => {

              stock[
                origin.id
              ][
                food.id
              ] = 0;

            }
          );

      }
    );


  // ----------------------------------------------------------
  // SOMAR ENTRADAS
  // ----------------------------------------------------------

  (db.entries || [])
    .forEach(
      entry => {

        if (

          stock[
            entry.originId
          ] &&

          stock[
            entry.originId
          ][
            entry.foodId
          ] !== undefined

        ) {

          stock[
            entry.originId
          ][
            entry.foodId
          ] +=
            Number(
              entry.qty || 0
            );

        }

      }
    );


  // ----------------------------------------------------------
  // DESCONTAR SAÍDAS E PERDAS
  // ----------------------------------------------------------

  (db.movements || [])
    .forEach(
      movement => {

        if (

          stock[
            movement.originId
          ] &&

          stock[
            movement.originId
          ][
            movement.foodId
          ] !== undefined

        ) {

          stock[
            movement.originId
          ][
            movement.foodId
          ] -=
            Number(
              movement.qty || 0
            );

        }

      }
    );


  return stock;

}


// ============================================================
// 9. DASHBOARD / INÍCIO
// ============================================================

function renderDashboard() {

  if (
    !db
  ) {

    return;

  }


  const date =
    document.getElementById(
      "dashboardDate"
    )?.value ||
    isoToday();


  const todayLabel =
    document.getElementById(
      "todayLabel"
    );


  if (
    todayLabel
  ) {

    todayLabel.textContent =
      fmtDate(
        date
      );

  }


  // ----------------------------------------------------------
  // ENTRADAS DO DIA
  // ----------------------------------------------------------

  const ent =
    (db.entries || [])
      .filter(
        x =>
          x.date === date
      )
      .reduce(
        (
          total,
          x
        ) =>
          total +
          Number(
            x.qty || 0
          ),
        0
      );


  // ----------------------------------------------------------
  // SAÍDAS DO DIA
  // ----------------------------------------------------------

  const sai =
    (db.movements || [])
      .filter(
        x =>

          x.date === date &&

          x.type ===
            "saida"

      )
      .reduce(
        (
          total,
          x
        ) =>
          total +
          Number(
            x.qty || 0
          ),
        0
      );


  // ----------------------------------------------------------
  // PERDAS DO DIA
  // ----------------------------------------------------------

  const per =
    (db.movements || [])
      .filter(
        x =>

          x.date === date &&

          x.type ===
            "perda"

      )
      .reduce(
        (
          total,
          x
        ) =>
          total +
          Number(
            x.qty || 0
          ),
        0
      );


  // ----------------------------------------------------------
  // ESTOQUE TOTAL
  // ----------------------------------------------------------

  const st =
    calcStock();


  const estoque =
    Object.values(
      st
    )
      .reduce(
        (
          total,
          origem
        ) =>

          total +

          Object.values(
            origem
          )
            .reduce(
              (
                soma,
                valor
              ) =>

                soma +
                Number(
                  valor || 0
                ),

              0

            ),

        0

      );


  // ----------------------------------------------------------
  // PRESENTES
  // ----------------------------------------------------------

  const pres =
    (
      db.attendance[
        date
      ] || []
    )
      .filter(
        Boolean
      )
      .length;


  // ----------------------------------------------------------
  // KPIs
  // ----------------------------------------------------------

  const cards = [

    [
      "kpiEntrada",
      ent
    ],

    [
      "kpiSaida",
      sai
    ],

    [
      "kpiPerda",
      per
    ],

    [
      "kpiEstoque",
      estoque
    ],

    [
      "kpiPresentes",
      pres
    ]

  ];


  cards.forEach(
    ([id, value]) => {

      const el =
        document.getElementById(
          id
        );


      if (
        el
      ) {

        el.textContent =
          fmt(
            value
          );

      }

    }
  );


  // ----------------------------------------------------------
  // ESTOQUE POR ORIGEM
  // ----------------------------------------------------------

  const originSummary =
    document.getElementById(
      "originSummary"
    );


  if (
    originSummary
  ) {

    originSummary.innerHTML =

      (db.origins || [])
        .map(
          origin => {

            const total =
              Object.values(
                st[
                  origin.id
                ] || {}
              )
                .reduce(
                  (
                    soma,
                    valor
                  ) =>

                    soma +
                    Number(
                      valor || 0
                    ),

                  0

                );


            return `

              <div class="origin-box">

                <div class="origin-title">

                  <span>
                    📍
                    ${esc(
                      origin.name
                    )}
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

          }
        )
        .join("");

  }


  // ----------------------------------------------------------
  // ÚLTIMOS LANÇAMENTOS
  // ----------------------------------------------------------

  const recent =
    document.getElementById(
      "recentMovements"
    );


  if (
    recent
  ) {

    const all = [

      ...(db.entries || [])
        .map(
          x => ({

            ...x,

            kind:
              "Entrada",

            sign:
              "+"

          })
        ),


      ...(db.movements || [])
        .map(
          x => ({

            ...x,

            kind:
              x.type ===
              "perda"

                ? "Perda"

                : "Saída",

            sign:
              "-"

          })
        )

    ];


    all.sort(
      (
        a,
        b
      ) =>

        (
          b.createdAt ||
          ""
        ).localeCompare(
          a.createdAt ||
          ""
        )

    );


    const last =
      all.slice(
        0,
        8
      );


    recent.innerHTML =

      last.length

        ? last
            .map(
              x => `

                <div class="recent-item">

                  <b>

                    ${x.sign}

                    ${fmt(
                      x.qty
                    )}

                    —

                    ${esc(
                      getName(
                        db.foods,
                        x.foodId
                      )
                    )}

                  </b>

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

                    ${fmtDate(
                      x.date
                    )}

                  </small>

                </div>

              `
            )
            .join("")

        : `

            <div class="empty">
              Nenhum lançamento ainda.
            </div>

          `;

  }

}


// ============================================================
// 10. ENTRADAS
// ============================================================

function renderEntries() {

  if (
    !db
  ) {

    return;

  }


  const date =
    document.getElementById(
      "entryDate"
    )?.value ||
    isoToday();


  const arr =
    (db.entries || [])
      .filter(
        x =>
          x.date === date
      )
      .sort(
        (
          a,
          b
        ) =>

          (
            b.createdAt ||
            ""
          ).localeCompare(
            a.createdAt ||
            ""
          )

      );


  const total =
    arr.reduce(
      (
        soma,
        x
      ) =>

        soma +
        Number(
          x.qty || 0
        ),

      0

    );


  const totalEl =
    document.getElementById(
      "entryDayTotal"
    );


  if (
    totalEl
  ) {

    totalEl.textContent =
      `Total: ${fmt(total)}`;

  }


  const tableEl =
    document.getElementById(
      "entriesTable"
    );


  if (
    tableEl
  ) {

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
                x.note ||
                ""
              )

          ]

        ],

        x =>
          removeEntry(
            x.id
          )

      );

  }

}


// ============================================================
// EXCLUIR ENTRADA
// ============================================================

function removeEntry(
  id
) {

  if (
    !confirm(
      "Excluir esta entrada?"
    )
  ) {

    return;

  }


  db.entries =
    db.entries.filter(
      x =>
        x.id !== id
    );


  save();


  renderAll();


  toast(
    "Entrada excluída."
  );

}


// ============================================================
// 11. MOVIMENTAÇÕES
// ============================================================

function renderMovements() {

  if (
    !db
  ) {

    return;

  }


  const arr =
    (db.movements || [])
      .slice()
      .sort(
        (
          a,
          b
        ) =>

          (
            b.createdAt ||
            ""
          ).localeCompare(
            a.createdAt ||
            ""
          )

      );


  const el =
    document.getElementById(
      "movementsTable"
    );


  if (
    !el
  ) {

    return;

  }


  el.innerHTML =

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
          "Tipo",

          x => `

            <span
              class="pill ${
                x.type ===
                "perda"
                  ? "red"
                  : "blue"
              }"
            >

              ${
                x.type ===
                "perda"

                  ? "Perda"

                  : "Saída"
              }

            </span>

          `

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
          "Motivo",

          x =>
            esc(
              getName(
                db.reasons,
                x.reasonId
              )
            )

        ],


        [
          "Obs.",

          x =>
            esc(
              x.note ||
              ""
            )

        ]

      ],

      x =>
        removeMovement(
          x.id
        )

    );

}


// ============================================================
// EXCLUIR MOVIMENTAÇÃO
// ============================================================

function removeMovement(
  id
) {

  if (
    !confirm(
      "Excluir esta movimentação?"
    )
  ) {

    return;

  }


  db.movements =
    db.movements.filter(
      x =>
        x.id !== id
    );


  save();


  renderAll();


  toast(
    "Movimentação excluída."
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

  if (
    !arr ||
    !arr.length
  ) {

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

            ${
              cols
                .map(
                  c =>
                    `<th>
                      ${c[0]}
                    </th>`
                )
                .join("")
            }

            <th>Ação</th>

          </tr>

        </thead>


        <tbody>

          ${
            arr
              .map(
                x => `

                  <tr>

                    ${
                      cols
                        .map(
                          c =>
                            `<td>
                              ${c[1](x)}
                            </td>`
                        )
                        .join("")
                    }

                    <td>

                      <button
                        class="btn danger-btn"
                        data-remove="${x.id}"
                      >
                        Excluir
                      </button>

                    </td>

                  </tr>

                `
              )
              .join("")
          }

        </tbody>

      </table>

    </div>

  `;

}


// ============================================================
// 13. PRESENÇA
// ============================================================

function renderAttendance() {

  if (
    !db
  ) {

    return;

  }


  const date =
    document.getElementById(
      "attendanceDate"
    )?.value ||
    isoToday();


  const search =
    (
      document.getElementById(
        "attendanceSearch"
      )?.value ||
      ""
    )
      .toLowerCase()
      .trim();


  const set =
    new Set(
      db.attendance[
        date
      ] || []
    );


  const people =
    (db.people || [])
      .filter(
        person => {

          const text =

            (
              person.name ||
              ""
            ) +

            " " +

            (
              person.registration ||
              ""
            );


          return text
            .toLowerCase()
            .includes(
              search
            );

        }
      );


  const count =
    document.getElementById(
      "attendanceCount"
    );


  if (
    count
  ) {

    count.textContent =
      `${set.size} presentes`;

  }


  const list =
    document.getElementById(
      "attendanceList"
    );


  if (
    !list
  ) {

    return;

  }


  list.innerHTML =

    people.length

      ? people
          .map(
            person => `

              <div
                class="attendance-row"
              >

                <div>

                  <div
                    class="person-name"
                  >
                    ${esc(
                      person.name
                    )}
                  </div>

                  <div
                    class="person-reg"
                  >
                    Matrícula:
                    ${esc(
                      person.registration
                    )}
                  </div>

                </div>


                <label
                  class="switch"
                >

                  <input

                    type="checkbox"

                    data-person="${person.id}"

                    ${
                      set.has(
                        person.id
                      )
                        ? "checked"
                        : ""
                    }

                  >

                  <span
                    class="slider"
                  ></span>

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


  // ----------------------------------------------------------
  // MARCAR / DESMARCAR PRESENÇA
  // ----------------------------------------------------------

  document
    .querySelectorAll(
      "[data-person]"
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          "change",
          e => {

            const attendance =
              new Set(
                db.attendance[
                  date
                ] || []
              );


            const personId =
              e.target
                .dataset
                .person;


            if (
              e.target.checked
            ) {

              attendance.add(
                personId
              );

            } else {

              attendance.delete(
                personId
              );

            }


            db.attendance[
              date
            ] =
              [
                ...attendance
              ];


            save();


            renderAttendance();


            renderDashboard();

          }
        );

      }
    );

}


// ============================================================
// 14. ESTOQUE
// ============================================================

function renderStock() {

  if (
    !db
  ) {

    return;

  }


  const st =
    calcStock();


  // ----------------------------------------------------------
  // CARDS POR ORIGEM
  // ----------------------------------------------------------

  const cards =
    document.getElementById(
      "stockCards"
    );


  if (
    cards
  ) {

    cards.innerHTML =

      (db.origins || [])
        .map(
          origin => {

            const total =
              Object.values(
                st[
                  origin.id
                ] || {}
              )
                .reduce(
                  (
                    soma,
                    valor
                  ) =>

                    soma +
                    Number(
                      valor || 0
                    ),

                  0

                );


            return `

              <div
                class="panel"
              >

                <h3>
                  📍
                  ${esc(
                    origin.name
                  )}
                </h3>

                <div
                  class="origin-value"
                >
                  ${fmt(total)}
                  itens
                </div>

              </div>

            `;

          }
        )
        .join("");

  }


  // ----------------------------------------------------------
  // CONSOLIDADO
  // ----------------------------------------------------------

  const rows =

    (db.foods || [])
      .map(
        food => {

          const values =

            (db.origins || [])
              .map(
                origin =>

                  Number(
                    st[
                      origin.id
                    ]?.[
                      food.id
                    ] || 0
                  )
              );


          const total =
            values.reduce(
              (
                soma,
                valor
              ) =>
                soma +
                valor,

              0

            );


          return `

            <tr>

              <td>
                ${esc(
                  food.name
                )}
              </td>


              ${
                values
                  .map(
                    value =>
                      `<td>
                        ${fmt(value)}
                      </td>`
                  )
                  .join("")
              }


              <td>
                <b>
                  ${fmt(total)}
                </b>
              </td>

            </tr>

          `;

        }
      )
      .join("");


  const tableEl =
    document.getElementById(
      "stockTable"
    );


  if (
    tableEl
  ) {

    tableEl.innerHTML = `

      <div
        class="table-wrap"
      >

        <table>

          <thead>

            <tr>

              <th>
                Alimento
              </th>


              ${
                (db.origins || [])
                  .map(
                    origin =>
                      `<th>
                        ${esc(
                          origin.name
                        )}
                      </th>`
                  )
                  .join("")
              }


              <th>
                Total
              </th>

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
// FIM DA PARTE 3/5
// ============================================================

// ============================================================
// PARTE 4/5 - CADASTROS + BACKUP + NAVEGAÇÃO + EVENTOS
// ============================================================


// ============================================================
// 15. CADASTROS
// ============================================================

function renderCadastros() {

  if (!db) return;


  // ==========================================================
  // PESSOAS
  // ==========================================================

  const people =
    document.getElementById(
      "peopleTable"
    );


  if (people) {

    people.innerHTML = `

      <div class="mini-list">

        ${
          (db.people || [])
            .map(
              p => `

                <div class="mini-row">

                  <span>

                    <b>
                      ${esc(p.name)}
                    </b>

                    <br>

                    <small>
                      ${esc(p.registration)}
                    </small>

                  </span>


                  <button
                    class="btn danger-btn"
                    data-del-person="${p.id}"
                    type="button"
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


  // ==========================================================
  // ALIMENTOS
  // ==========================================================

  const foods =
    document.getElementById(
      "foodsTable"
    );


  if (foods) {

    foods.innerHTML = `

      <div class="mini-list">

        ${
          (db.foods || [])
            .map(
              food => `

                <div class="mini-row">

                  <span>
                    ${esc(food.name)}
                  </span>


                  <button
                    class="btn danger-btn"
                    data-del-food="${food.id}"
                    type="button"
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


  // ==========================================================
  // ORIGENS
  // ==========================================================

  const origins =
    document.getElementById(
      "originsTable"
    );


  if (origins) {

    origins.innerHTML = `

      <div class="mini-list">

        ${
          (db.origins || [])
            .map(
              origin => `

                <div class="mini-row">

                  <span>
                    ${esc(origin.name)}
                  </span>


                  <button
                    class="btn danger-btn"
                    data-del-origin="${origin.id}"
                    type="button"
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


  // ==========================================================
  // MOTIVOS
  // ==========================================================

  const reasons =
    document.getElementById(
      "reasonsTable"
    );


  if (reasons) {

    reasons.innerHTML = `

      <div class="mini-list">

        ${
          (db.reasons || [])
            .map(
              reason => `

                <div class="mini-row">

                  <span>
                    ${esc(reason.name)}
                  </span>


                  <button
                    class="btn danger-btn"
                    data-del-reason="${reason.id}"
                    type="button"
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


  // ==========================================================
  // BOTÕES DE EXCLUSÃO
  // ==========================================================

  document
    .querySelectorAll(
      "[data-del-person]"
    )
    .forEach(
      button => {

        button.onclick =
          () =>

            delBy(
              "people",
              button.dataset.delPerson
            );

      }
    );


  document
    .querySelectorAll(
      "[data-del-food]"
    )
    .forEach(
      button => {

        button.onclick =
          () =>

            delBy(
              "foods",
              button.dataset.delFood
            );

      }
    );


  document
    .querySelectorAll(
      "[data-del-origin]"
    )
    .forEach(
      button => {

        button.onclick =
          () =>

            delBy(
              "origins",
              button.dataset.delOrigin
            );

      }
    );


  document
    .querySelectorAll(
      "[data-del-reason]"
    )
    .forEach(
      button => {

        button.onclick =
          () =>

            delBy(
              "reasons",
              button.dataset.delReason
            );

      }
    );

}


// ============================================================
// EXCLUIR CADASTRO
// ============================================================

function delBy(
  key,
  id
) {

  if (
    !confirm(
      "Excluir cadastro? Registros históricos que já usam este item continuarão salvos."
    )
  ) {

    return;

  }


  if (
    !db[key]
  ) {

    return;

  }


  db[key] =
    db[key].filter(
      item =>
        item.id !== id
    );


  save();


  renderAll();


  toast(
    "Cadastro excluído."
  );

}


// ============================================================
// 16. CSV
// ============================================================

function csvEscape(
  value
) {

  return `"${String(
    value ?? ""
  ).replace(
    /"/g,
    '""'
  )}"`;

}


// ============================================================
// EXPORTAR RELATÓRIO CSV
// ============================================================

function exportCSV() {

  if (!db) return;


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


  const rows = [

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


  // ----------------------------------------------------------
  // ENTRADAS
  // ----------------------------------------------------------

  (db.entries || [])
    .filter(
      x =>

        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          x.originId === origin)

    )
    .forEach(
      x => {

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

        ]);

      }
    );


  // ----------------------------------------------------------
  // SAÍDAS E PERDAS
  // ----------------------------------------------------------

  (db.movements || [])
    .filter(
      x =>

        (!start ||
          x.date >= start) &&

        (!end ||
          x.date <= end) &&

        (!origin ||
          x.originId === origin)

    )
    .forEach(
      x => {

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

        ]);

      }
    );


  // ----------------------------------------------------------
  // CRIAR ARQUIVO
  // ----------------------------------------------------------

  const blob =
    new Blob(

      [

        "\ufeff" +

        rows
          .map(
            row =>

              row
                .map(
                  csvEscape
                )
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
    `relatorio_${
      start || "inicio"
    }_${
      end || "fim"
    }.csv`
  );

}


// ============================================================
// FUNÇÃO DE DOWNLOAD
// ============================================================

function download(
  blob,
  name
) {

  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      "a"
    );


  a.href =
    url;


  a.download =
    name;


  a.style.display =
    "none";


  document.body.appendChild(
    a
  );


  a.click();


  a.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1000
  );

}


// ============================================================
// 17. NAVEGAÇÃO
// ============================================================
//
// IMPORTANTE:
// Esta versão não remove nem recria os menus.
// Apenas conecta os elementos que já existem no HTML.
//
// ============================================================

function nav() {

  // ----------------------------------------------------------
  // ABAS E CARDS
  // ----------------------------------------------------------

  const buttons =
    document.querySelectorAll(
      ".tab, .home-card"
    );


  buttons.forEach(
    button => {

      // Evita adicionar o mesmo evento duas vezes

      if (
        button.dataset.navBound ===
        "true"
      ) {

        return;

      }


      button.dataset.navBound =
        "true";


      button.addEventListener(
        "click",
        function () {

          const page =
            this.dataset.page;


          if (
            !page
          ) {

            return;

          }


          // -----------------------------------------------
          // ATIVAR ABA
          // -----------------------------------------------

          document
            .querySelectorAll(
              ".tab"
            )
            .forEach(
              tab => {

                tab.classList.toggle(
                  "active",
                  tab.dataset.page ===
                    page
                );

              }
            );


          // -----------------------------------------------
          // ESCONDER PÁGINAS
          // -----------------------------------------------

          document
            .querySelectorAll(
              ".page"
            )
            .forEach(
              section => {

                section.classList.remove(
                  "active"
                );

              }
            );


          // -----------------------------------------------
          // MOSTRAR PÁGINA
          // -----------------------------------------------

          const target =
            document.getElementById(
              page
            );


          if (
            target
          ) {

            target.classList.add(
              "active"
            );

          }


          // -----------------------------------------------
          // FECHAR MENU MOBILE
          // -----------------------------------------------

          const tabs =
            document.querySelector(
              ".ace-tabs"
            );


          if (
            tabs
          ) {

            tabs.classList.remove(
              "menu-open"
            );

          }


          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });


          // -----------------------------------------------
          // ATUALIZAR CONTEÚDO
          // -----------------------------------------------

          if (
            page ===
            "dashboard"
          ) {

            renderDashboard();

          }


          if (
            page ===
            "entries"
          ) {

            renderEntries();

          }


          if (
            page ===
            "movements"
          ) {

            renderMovements();

          }


          if (
            page ===
            "attendance"
          ) {

            renderAttendance();

          }


          if (
            page ===
            "stock"
          ) {

            renderStock();

          }


          if (
            page ===
            "cadastros"
          ) {

            renderCadastros();

          }

        }
      );

    }
  );


  // ----------------------------------------------------------
  // BOTÃO MENU MOBILE
  // ----------------------------------------------------------

  const menu =
    document.getElementById(
      "menuButton"
    );


  if (
    menu &&
    menu.dataset.menuBound !==
      "true"
  ) {

    menu.dataset.menuBound =
      "true";


    menu.addEventListener(
      "click",
      function (event) {

        event.preventDefault();


        event.stopPropagation();


        const tabs =
          document.querySelector(
            ".ace-tabs"
          );


        if (
          tabs
        ) {

          tabs.classList.toggle(
            "menu-open"
          );

        }

      }
    );

  }

}


// ============================================================
// 18. EVENTOS DO APLICATIVO
// ============================================================

function bindEvents() {

  // ==========================================================
  // ENTRADA
  // ==========================================================

  const entryForm =
    document.getElementById(
      "entryForm"
    );


  if (
    entryForm &&
    entryForm.dataset.bound !==
      "true"
  ) {

    entryForm.dataset.bound =
      "true";


    entryForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          form.get("date");


        const originId =
          form.get("origin");


        const foodId =
          form.get("foodId");


        const qty =
          Number(
            form.get("qty")
          );


        const note =
          form.get("note") ||
          "";


        if (
          !date ||
          !originId ||
          !foodId ||
          !qty ||
          qty <= 0
        ) {

          toast(
            "Preencha todos os campos obrigatórios."
          );


          return;

        }


        // ----------------------------------------------------
        // MODO LOCAL
        // ----------------------------------------------------

        db.entries.push({

          id:
            uid(),

          date,

          originId,

          foodId,

          qty,

          note,

          createdAt:
            new Date()
              .toISOString()

        });


        save();


        event.target.reset();


        const dateInput =
          document.getElementById(
            "entryDate"
          );


        if (
          dateInput
        ) {

          dateInput.value =
            isoToday();

        }


        renderAll();


        toast(
          "Entrada registrada."
        );

      }
    );

  }


  // ==========================================================
  // MOVIMENTAÇÃO
  // ==========================================================

  const movementForm =
    document.getElementById(
      "movementForm"
    );


  if (
    movementForm &&
    movementForm.dataset.bound !==
      "true"
  ) {

    movementForm.dataset.bound =
      "true";


    movementForm.addEventListener(
      "submit",
      async function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          form.get("date");


        const type =
          form.get("type");


        const originId =
          form.get("origin");


        const foodId =
          form.get("foodId");


        const qty =
          Number(
            form.get("qty")
          );


        const reasonId =
          form.get("reasonId");


        const note =
          form.get("note") ||
          "";


        if (
          !date ||
          !type ||
          !originId ||
          !foodId ||
          !qty ||
          qty <= 0
        ) {

          toast(
            "Preencha todos os campos obrigatórios."
          );


          return;

        }


        // ----------------------------------------------------
        // VERIFICAR ESTOQUE
        // ----------------------------------------------------

        const stock =
          calcStock();


        const available =
          Number(
            stock[
              originId
            ]?.[
              foodId
            ] || 0
          );


        if (
          qty >
          available
        ) {

          toast(
            `Saldo insuficiente. Disponível em ${
              getName(
                db.origins,
                originId
              )
            }: ${fmt(
              available
            )}.`
          );


          return;

        }


        // ----------------------------------------------------
        // REGISTRAR MOVIMENTAÇÃO
        // ----------------------------------------------------

        db.movements.push({

          id:
            uid(),

          date,

          type,

          originId,

          foodId,

          qty,

          reasonId:
            reasonId ||
            null,

          note,

          createdAt:
            new Date()
              .toISOString()

        });


        save();


        event.target.reset();


        const movementDate =
          document.getElementById(
            "movementDate"
          );


        if (
          movementDate
        ) {

          movementDate.value =
            isoToday();

        }


        renderAll();


        toast(
          "Movimentação registrada."
        );

      }
    );

  }


  // ==========================================================
  // DATA DO DASHBOARD
  // ==========================================================

  const dashboardDate =
    document.getElementById(
      "dashboardDate"
    );


  if (
    dashboardDate &&
    dashboardDate.dataset.bound !==
      "true"
  ) {

    dashboardDate.dataset.bound =
      "true";


    dashboardDate.addEventListener(
      "change",
      renderDashboard
    );

  }


  // ==========================================================
  // DATA DAS ENTRADAS
  // ==========================================================

  const entryDate =
    document.getElementById(
      "entryDate"
    );


  if (
    entryDate &&
    entryDate.dataset.bound !==
      "true"
  ) {

    entryDate.dataset.bound =
      "true";


    entryDate.addEventListener(
      "change",
      renderEntries
    );

  }


  // ==========================================================
  // DATA DA PRESENÇA
  // ==========================================================

  const attendanceDate =
    document.getElementById(
      "attendanceDate"
    );


  if (
    attendanceDate &&
    attendanceDate.dataset.bound !==
      "true"
  ) {

    attendanceDate.dataset.bound =
      "true";


    attendanceDate.addEventListener(
      "change",
      renderAttendance
    );

  }


  // ==========================================================
  // PESQUISA DE PRESENÇA
  // ==========================================================

  const attendanceSearch =
    document.getElementById(
      "attendanceSearch"
    );


  if (
    attendanceSearch &&
    attendanceSearch.dataset.bound !==
      "true"
  ) {

    attendanceSearch.dataset.bound =
      "true";


    attendanceSearch.addEventListener(
      "input",
      renderAttendance
    );

  }


  // ==========================================================
  // ATUALIZAR ESTOQUE
  // ==========================================================

  const refreshStock =
    document.getElementById(
      "refreshStock"
    );


  if (
    refreshStock &&
    refreshStock.dataset.bound !==
      "true"
  ) {

    refreshStock.dataset.bound =
      "true";


    refreshStock.addEventListener(
      "click",
      function () {

        renderStock();


        toast(
          "Estoque atualizado."
        );

      }
    );

  }


  // ==========================================================
  // GERAR RELATÓRIO
  // ==========================================================

  const generateReport =
    document.getElementById(
      "generateReport"
    );


  if (
    generateReport &&
    generateReport.dataset.bound !==
      "true"
  ) {

    generateReport.dataset.bound =
      "true";


    generateReport.addEventListener(
      "click",
      function () {

        if (
          typeof renderReport ===
          "function"
        ) {

          renderReport();

        }

      }
    );

  }


  // ==========================================================
  // EXPORTAR CSV
  // ==========================================================

  const exportCSVButton =
    document.getElementById(
      "exportCSV"
    );


  if (
    exportCSVButton &&
    exportCSVButton.dataset.bound !==
      "true"
  ) {

    exportCSVButton.dataset.bound =
      "true";


    exportCSVButton.addEventListener(
      "click",
      exportCSV
    );

  }


  // ==========================================================
  // CADASTRO DE PESSOA
  // ==========================================================

  const personForm =
    document.getElementById(
      "personForm"
    );


  if (
    personForm &&
    personForm.dataset.bound !==
      "true"
  ) {

    personForm.dataset.bound =
      "true";


    personForm.addEventListener(
      "submit",
      function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        const registration =
          String(
            form.get("registration") ||
            ""
          ).trim();


        if (
          !name ||
          !registration
        ) {

          toast(
            "Informe nome e matrícula."
          );


          return;

        }


        db.people.push({

          id:
            uid(),

          name,

          registration

        });


        save();


        event.target.reset();


        renderAll();


        toast(
          "Pessoa cadastrada."
        );

      }
    );

  }


  // ==========================================================
  // CADASTRO DE ALIMENTO
  // ==========================================================

  const foodForm =
    document.getElementById(
      "foodForm"
    );


  if (
    foodForm &&
    foodForm.dataset.bound !==
      "true"
  ) {

    foodForm.dataset.bound =
      "true";


    foodForm.addEventListener(
      "submit",
      function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (
          !name
        ) {

          toast(
            "Informe o nome do alimento."
          );


          return;

        }


        db.foods.push({

          id:
            uid(),

          name

        });


        save();


        event.target.reset();


        renderAll();


        toast(
          "Alimento cadastrado."
        );

      }
    );

  }


  // ==========================================================
  // CADASTRO DE ORIGEM
  // ==========================================================

  const originForm =
    document.getElementById(
      "originForm"
    );


  if (
    originForm &&
    originForm.dataset.bound !==
      "true"
  ) {

    originForm.dataset.bound =
      "true";


    originForm.addEventListener(
      "submit",
      function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (
          !name
        ) {

          toast(
            "Informe o nome da origem."
          );


          return;

        }


        db.origins.push({

          id:
            uid(),

          name

        });


        save();


        event.target.reset();


        renderAll();


        toast(
          "Origem cadastrada."
        );

      }
    );

  }


  // ==========================================================
  // CADASTRO DE MOTIVO
  // ==========================================================

  const reasonForm =
    document.getElementById(
      "reasonForm"
    );


  if (
    reasonForm &&
    reasonForm.dataset.bound !==
      "true"
  ) {

    reasonForm.dataset.bound =
      "true";


    reasonForm.addEventListener(
      "submit",
      function (event) {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const name =
          String(
            form.get("name") ||
            ""
          ).trim();


        if (
          !name
        ) {

          toast(
            "Informe o motivo."
          );


          return;

        }


        db.reasons.push({

          id:
            uid(),

          name

        });


        save();


        event.target.reset();


        renderAll();


        toast(
          "Motivo cadastrado."
        );

      }
    );

  }


  // ==========================================================
  // BACKUP
  // ==========================================================

  const backupBtn =
    document.getElementById(
      "backupBtn"
    );


  if (
    backupBtn &&
    backupBtn.dataset.bound !==
      "true"
  ) {

    backupBtn.dataset.bound =
      "true";


    backupBtn.addEventListener(
      "click",
      function () {

        const blob =
          new Blob(

            [
              JSON.stringify(
                db,
                null,
                2
              )
            ],

            {
              type:
                "application/json"
            }

          );


        download(
          blob,
          `backup_controle_alimentos_${isoToday()}.json`
        );

      }
    );

  }


  // ==========================================================
  // RESTAURAR BACKUP
  // ==========================================================

  const restoreFile =
    document.getElementById(
      "restoreFile"
    );


  if (
    restoreFile &&
    restoreFile.dataset.bound !==
      "true"
  ) {

    restoreFile.dataset.bound =
      "true";


    restoreFile.addEventListener(
      "change",
      async function (event) {

        const file =
          event.target
            .files?.[0];


        if (
          !file
        ) {

          return;

        }


        try {

          const obj =
            JSON.parse(
              await file.text()
            );


          if (
            !obj.foods ||
            !obj.origins ||
            !obj.entries
          ) {

            throw new Error(
              "Arquivo inválido."
            );

          }


          db =
            obj;


          // Garantir estruturas antigas

          db.people =
            db.people || [];


          db.foods =
            db.foods || [];


          db.origins =
            db.origins || [];


          db.reasons =
            db.reasons ||
            DEFAULT.reasons.map(
              name => ({

                id:
                  uid(),

                name

              })
            );


          db.entries =
            db.entries || [];


          db.movements =
            db.movements || [];


          db.attendance =
            db.attendance || {};


          save();


          renderAll();


          toast(
            "Backup restaurado."
          );


        } catch (
          error
        ) {

          console.error(
            "Erro ao restaurar backup:",
            error
          );


          alert(
            "Não foi possível restaurar este arquivo."
          );

        }


        event.target.value =
          "";

      }
    );

  }


  // ==========================================================
  // RESETAR DADOS LOCAIS
  // ==========================================================

  const resetBtn =
    document.getElementById(
      "resetBtn"
    );


  if (
    resetBtn &&
    resetBtn.dataset.bound !==
      "true"
  ) {

    resetBtn.dataset.bound =
      "true";


    resetBtn.addEventListener(
      "click",
      function () {

        if (
          !confirm(
            "Isso apagará os dados atuais deste aparelho. Tem certeza?"
          )
        ) {

          return;

        }


        localStorage.removeItem(
          KEY
        );


        db =
          load();


        setDates();


        renderAll();


        toast(
          "Dados padrão restaurados."
        );

      }
    );

  }

}


// ============================================================
// FIM DA PARTE 4/5
// ============================================================

// ============================================================
// PARTE 5/5 - INICIALIZAÇÃO + AUTENTICAÇÃO
// ============================================================


// ============================================================
// 19. CONFIGURAR PWA
// ============================================================

function setupPWA() {

  // ----------------------------------------------------------
  // SERVICE WORKER
  // ----------------------------------------------------------

  if (
    "serviceWorker" in navigator
  ) {

    window.addEventListener(
      "load",
      () => {

        navigator
          .serviceWorker
          .register(
            "sw.js"
          )
          .then(
            registration => {

              console.log(
                "ACE: Service Worker registrado.",
                registration
              );

            }
          )
          .catch(
            error => {

              console.warn(
                "ACE: Service Worker não registrado:",
                error
              );

            }
          );

      }
    );

  }


  // ----------------------------------------------------------
  // INSTALAÇÃO PWA
  // ----------------------------------------------------------

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      event.preventDefault();

      deferredPrompt =
        event;

      console.log(
        "ACE: aplicativo disponível para instalação."
      );

    }
  );

}


// ============================================================
// 20. RENDERIZAÇÃO GERAL
// ============================================================

function renderAll() {

  if (
    !db
  ) {

    console.warn(
      "ACE: renderAll chamado sem banco carregado."
    );

    return;

  }


  // ----------------------------------------------------------
  // ATUALIZAR SELECTS
  // ----------------------------------------------------------

  if (
    typeof refreshSelects ===
    "function"
  ) {

    refreshSelects();

  }


  // ----------------------------------------------------------
  // DASHBOARD
  // ----------------------------------------------------------

  if (
    typeof renderDashboard ===
    "function"
  ) {

    renderDashboard();

  }


  // ----------------------------------------------------------
  // ENTRADAS
  // ----------------------------------------------------------

  if (
    typeof renderEntries ===
    "function"
  ) {

    renderEntries();

  }


  // ----------------------------------------------------------
  // MOVIMENTAÇÕES
  // ----------------------------------------------------------

  if (
    typeof renderMovements ===
    "function"
  ) {

    renderMovements();

  }


  // ----------------------------------------------------------
  // PRESENÇA
  // ----------------------------------------------------------

  if (
    typeof renderAttendance ===
    "function"
  ) {

    renderAttendance();

  }


  // ----------------------------------------------------------
  // ESTOQUE
  // ----------------------------------------------------------

  if (
    typeof renderStock ===
    "function"
  ) {

    renderStock();

  }


  // ----------------------------------------------------------
  // CADASTROS
  // ----------------------------------------------------------

  if (
    typeof renderCadastros ===
    "function"
  ) {

    renderCadastros();

  }


  // ----------------------------------------------------------
  // RELATÓRIO
  // ----------------------------------------------------------
  //
  // NÃO ALTERAMOS A LÓGICA DO RELATÓRIO.
  //
  // Apenas chamamos a função existente, caso ela exista.
  //
  // ----------------------------------------------------------

  if (
    typeof renderReport ===
    "function"
  ) {

    renderReport();

  }

}


// ============================================================
// 21. BARRA DO USUÁRIO
// ============================================================

function updateUserBar() {

  const bar =
    document.getElementById(
      "userBar"
    );


  if (
    !bar
  ) {

    return;

  }


  if (
    !currentUser
  ) {

    bar.innerHTML =
      "";

    return;

  }


  bar.innerHTML = `

    <span class="user-email">

      👤

      ${esc(
        currentUser.nome ||
        currentUser.email ||
        ""
      )}

    </span>


    <button
      id="logoutBtn"
      class="logout-btn"
      type="button"
    >

      🚪 Sair

    </button>

  `;


  const logoutBtn =
    document.getElementById(
      "logoutBtn"
    );


  if (
    logoutBtn
  ) {

    logoutBtn.onclick =
      logoutUser;

  }

}


// ============================================================
// 22. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  // ----------------------------------------------------------
  // EVITAR DUPLA INICIALIZAÇÃO
  // ----------------------------------------------------------

  if (
    appStarted
  ) {

    console.log(
      "ACE: aplicativo já iniciado."
    );

    return;

  }


  console.log(
    "ACE Controle de Alimentos iniciado."
  );


  try {

    // ========================================================
    // CARREGAR BANCO DO SUPABASE
    // ========================================================

    // IMPORTANTE:
    //
    // NÃO usar:
    //
    //     db = load();
    //
    // O banco oficial deste aplicativo é o Supabase.
    //
    // loadFromSupabase() foi definida na Parte 1.
    // ========================================================

    db =
      await loadFromSupabase();


    console.log(
      "ACE: banco carregado com sucesso."
    );


    // ========================================================
    // DATAS
    // ========================================================

    if (
      typeof setDates ===
      "function"
    ) {

      setDates();

    }


    // ========================================================
    // NAVEGAÇÃO
    // ========================================================

    // Esta função precisa ser executada antes dos cliques
    // dos menus.

    if (
      typeof nav ===
      "function"
    ) {

      nav();

    }


    // ========================================================
    // EVENTOS
    // ========================================================

    if (
      typeof bindEvents ===
      "function"
    ) {

      bindEvents();

    }


    // ========================================================
    // PWA
    // ========================================================

    if (
      typeof setupPWA ===
      "function"
    ) {

      setupPWA();

    }


    // ========================================================
    // BARRA DO USUÁRIO
    // ========================================================

    if (
      typeof addUserBar ===
      "function"
    ) {

      addUserBar();

    } else {

      updateUserBar();

    }


    // ========================================================
    // RENDERIZAR SISTEMA
    // ========================================================

    if (
      typeof renderAll ===
      "function"
    ) {

      renderAll();

    }


    // --------------------------------------------------------
    // SÓ AGORA MARCA COMO INICIADO
    // --------------------------------------------------------

    appStarted =
      true;


    console.log(
      "Aplicativo carregado com sucesso."
    );


  } catch (
    error
  ) {

    // --------------------------------------------------------
    // SE FALHOU, PERMITE NOVA TENTATIVA
    // --------------------------------------------------------

    appStarted =
      false;


    console.error(
      "Erro ao iniciar aplicativo:",
      error
    );


    alert(

      "Não foi possível carregar os dados do sistema.\n\n" +

      (
        error?.message ||
        "Verifique a conexão com o Supabase."
      )

    );

  }

}


// ============================================================
// 23. VERIFICA LOGIN
// ============================================================

async function startAuth() {

  console.log(
    "ACE: verificando autenticação..."
  );


  // ==========================================================
  // GARANTIR QUE A TELA DE LOGIN EXISTA
  // ==========================================================

  createLoginScreen();


  // ==========================================================
  // OUVIR ALTERAÇÕES DE AUTENTICAÇÃO
  // ==========================================================

  // IMPORTANTE:
  // O listener é registrado ANTES de consultar a sessão.
  // Assim nenhum evento de login é perdido.

  if (
    !window.__aceAuthListenerRegistered
  ) {

    window.__aceAuthListenerRegistered =
      true;


    supabaseClient
      .auth
      .onAuthStateChange(
        (
          event,
          session
        ) => {

          console.log(
            "ACE AUTH:",
            event
          );


          // ==================================================
          // CADASTRO DE USUÁRIO
          // ==================================================
          //
          // Se o Supabase criar automaticamente uma sessão
          // durante o cadastro, NÃO devemos abrir o sistema.
          //
          // O registerUser() da Parte 2 controla esta variável.
          //
          // ==================================================

          if (
            event ===
            "SIGNED_IN" &&
            registrationInProgress
          ) {

            console.log(
              "ACE: login automático do cadastro ignorado."
            );


            return;

          }


          // ==================================================
          // LOGIN REAL
          // ==================================================

          if (
            event ===
            "SIGNED_IN" &&
            session?.user
          ) {

            console.log(
              "ACE: login realizado:",
              session.user.email
            );


            currentUser =
              session.user;


            setCurrentUserFromSession(
              session.user
            );


            removeLoginScreen();


            // -----------------------------------------------
            // INICIAR SISTEMA
            // -----------------------------------------------

            initApp();

          }


          // ==================================================
          // TOKEN ATUALIZADO
          // ==================================================

          if (
            event ===
            "TOKEN_REFRESHED" &&
            session?.user
          ) {

            currentUser =
              session.user;


            setCurrentUserFromSession(
              session.user
            );

          }


          // ==================================================
          // LOGOUT
          // ==================================================

          if (
            event ===
            "SIGNED_OUT"
          ) {

            console.log(
              "ACE: usuário desconectado."
            );


            currentUser =
              null;


            appStarted =
              false;


            // -----------------------------------------------
            // SE FOR LOGOUT NORMAL
            // -----------------------------------------------

            if (
              !registrationInProgress
            ) {

              location.reload();

            }

          }

        }
      );

  }


  // ==========================================================
  // VERIFICAR SESSÃO EXISTENTE
  // ==========================================================

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (
      error
    ) {

      throw error;

    }


    // ========================================================
    // EXISTE SESSÃO
    // ========================================================

    if (
      data?.session?.user
    ) {

      console.log(
        "ACE: sessão existente encontrada."
      );


      currentUser =
        data.session.user;


      setCurrentUserFromSession(
        data.session.user
      );


      // -----------------------------------------------
      // REMOVER LOGIN
      // -----------------------------------------------

      removeLoginScreen();


      // -----------------------------------------------
      // INICIAR APLICATIVO
      // -----------------------------------------------

      await initApp();


      return;

    }


    // ========================================================
    // NÃO EXISTE SESSÃO
    // ========================================================

    console.log(
      "ACE: nenhuma sessão encontrada."
    );


    // A tela de login permanece aberta.


  } catch (
    error
  ) {

    console.error(
      "ACE - ERRO AO VERIFICAR SESSÃO:",
      error
    );


    const loginError =
      document.getElementById(
        "loginError"
      );


    if (
      loginError
    ) {

      loginError.textContent =
        "Não foi possível conectar ao Supabase. Verifique a conexão e tente novamente.";


      loginError.classList.add(
        "show"
      );

    }

  }

}


// ============================================================
// 24. INICIAR
// ============================================================

startAuth();


// ============================================================
// FIM DA PARTE 5/5
// ============================================================
