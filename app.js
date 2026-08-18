// ============================================================
// ACE - CONTROLE DE ALIMENTOS
// V7 + SUPABASE AUTH + BANCO COMPARTILHADO
// ============================================================

// ============================================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ============================================================

const SUPABASE_URL =
  "https://jblyzktbngvjqgvejgsa.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_tLvr-LHX18qGGjGzkFVs6A_Alh83jMm";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


// ============================================================
// 2. CONFIGURAÇÕES
// ============================================================

const KEY =
  "controle_alimentos_v1";

const DEFAULT = {

  origins: [
    "Piedade",
    "Água Fria"
  ],

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
  ].map(
    ([name, registration]) => ({
      id: uid(),
      name,
      registration
    })
  )
};


// ============================================================
// 3. VARIÁVEIS
// ============================================================

let db = null;
let deferredPrompt = null;
let currentUser = null;
let appStarted = false;


// ============================================================
// 4. FUNÇÕES BÁSICAS
// ============================================================

function uid() {

  if (
    window.crypto &&
    typeof window.crypto.randomUUID ===
      "function"
  ) {

    return window.crypto.randomUUID();

  }

  return (
    Date.now() +
    "-" +
    Math.random()
      .toString(16)
      .slice(2)
  );

}


function isoToday() {

  return new Date()
    .toISOString()
    .slice(0, 10);

}


// ============================================================
// ID NUMÉRICO
// IMPORTANTE:
// As tabelas do Supabase usam int8.
// Portanto NÃO usamos UUID para os IDs das tabelas.
// ============================================================

let numericIdCounter = 0;


function newNumericId() {

  numericIdCounter =
    (numericIdCounter + 1) %
    1000;

  return (
    Date.now() * 1000 +
    numericIdCounter
  );

}


// ============================================================
// MOTIVOS
// CONTINUAM LOCAIS COMO NA V7.
// NÃO CRIAMOS TABELA MOTIVOS.
// ============================================================

function reasonsStorageKey() {

  return (
    "controle_alimentos_motivos_" +
    (currentUser?.id || "anon")
  );

}


function loadLocalReasons() {

  const defaults =
    DEFAULT.reasons.map(
      name => ({
        id: name,
        name
      })
    );


  try {

    const raw =
      localStorage.getItem(
        reasonsStorageKey()
      );


    const saved =
      raw
        ? JSON.parse(raw)
        : [];


    const names =
      new Map();


    [
      ...defaults,
      ...(Array.isArray(saved)
        ? saved
        : [])
    ].forEach(r => {

      const name =
        String(
          r?.name || ""
        ).trim();


      if (name) {

        names.set(
          name.toLowerCase(),
          {
            id: name,
            name
          }
        );

      }

    });


    return [
      ...names.values()
    ];


  } catch (error) {

    console.warn(
      "Erro ao carregar motivos:",
      error
    );


    return defaults;

  }

}


function saveLocalReasons() {

  try {

    localStorage.setItem(
      reasonsStorageKey(),
      JSON.stringify(
        db?.reasons || []
      )
    );


  } catch (error) {

    console.warn(
      "Erro ao salvar motivos:",
      error
    );

  }

}


// ============================================================
// 5. CARREGAR BANCO DO SUPABASE
//
// ATENÇÃO:
// NÃO FILTRAMOS PELO usuario_id.
//
// O banco é compartilhado.
// usuario_id serve para saber QUEM fez a operação.
// ============================================================

async function loadFromSupabase() {

  if (!currentUser?.id) {

    throw new Error(
      "Usuário não autenticado."
    );

  }


  const [
    peopleResult,
    foodsResult,
    originsResult,
    entriesResult,
    outputsResult,
    lossesResult,
    attendanceResult
  ] =
    await Promise.all([

      supabaseClient
        .from("Pessoas")
        .select("*")
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
        .order(
          "data_entrada",
          {
            ascending: false
          }
        ),


      supabaseClient
        .from("saídas")
        .select("*")
        .order(
          "data_saida",
          {
            ascending: false
          }
        ),


      supabaseClient
        .from("perdas")
        .select("*")
        .order(
          "data_perda",
          {
            ascending: false
          }
        ),


      supabaseClient
        .from("presença")
        .select("*")
        .order(
          "data",
          {
            ascending: false
          }
        )

    ]);


  const results = [

    [
      "Pessoas",
      peopleResult
    ],

    [
      "Alimentos",
      foodsResult
    ],

    [
      "origens",
      originsResult
    ],

    [
      "entradas",
      entriesResult
    ],

    [
      "saídas",
      outputsResult
    ],

    [
      "perdas",
      lossesResult
    ],

    [
      "presença",
      attendanceResult
    ]

  ];


  const failed =
    results.find(
      ([, result]) =>
        result.error
    );


  if (failed) {

    const [
      tableName,
      result
    ] = failed;


    throw new Error(
      `Erro ao carregar ${tableName}: ${
        result.error.message
      }`
    );

  }


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


  const reasons =
    loadLocalReasons();


  // ==========================================================
  // CONVERTER SUPABASE → FORMATO USADO PELO APP
  // ==========================================================

  const dbSupabase = {

    people:
      people.map(
        p => ({

          id: Number(p.id),

          name:
            p.nome,

          registration:
            p["matrícula"] ??
            p.matricula ??
            ""

        })
      ),


    foods:
      foods.map(
        f => ({

          id: Number(f.id),

          name:
            f.nome

        })
      ),


    origins:
      origins.map(
        o => ({

          id: Number(o.id),

          name:
            o.nome

        })
      ),


    entries:
      entries.map(
        e => ({

          id:
            Number(e.id),

          date:
            e.data_entrada,

          foodId:
            Number(
              e.alimento_id
            ),

          qty:
            Number(
              e.quantidade || 0
            ),

          originId:
            Number(
              e.origem_id
            ),

          note:
            e.observacao ||
            e.obs ||
            "",

          createdAt:
            e.created_at ||
            `${e.data_entrada || isoToday()}T00:00:00Z`

        })
      ),


    movements: [

      // ------------------------------------------------------
      // SAÍDAS
      // ------------------------------------------------------

      ...outputs.map(
        s => ({

          id:
            "saida-" +
            s.id,

          rawId:
            Number(s.id),

          sourceTable:
            "saídas",

          date:
            s.data_saida,

          type:
            "saida",

          foodId:
            Number(
              s.alimento_id
            ),

          qty:
            Number(
              s.quantidade || 0
            ),

          originId:
            Number(
              s.origem_id
            ),

          reasonId:
            null,

          note:
            s.destino ||
            s.observacao ||
            "",

          createdAt:
            s.created_at ||
            `${s.data_saida || isoToday()}T00:00:00Z`

        })
      ),


      // ------------------------------------------------------
      // PERDAS
      // ------------------------------------------------------

      ...losses.map(
        p => ({

          id:
            "perda-" +
            p.id,

          rawId:
            Number(p.id),

          sourceTable:
            "perdas",

          date:
            p.data_perda,

          type:
            "perda",

          foodId:
            Number(
              p.alimento_id
            ),

          qty:
            Number(
              p.quantidade || 0
            ),

          originId:
            Number(
              p.origem_id
            ),

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

        })
      )

    ],


    attendance: {},

    reasons

  };


  // ==========================================================
  // PRESENÇA
  // ==========================================================

  attendanceRows.forEach(
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
        row.present &&
        row.pessoa_id != null
      ) {

        const personId =
          Number(
            row.pessoa_id
          );


        if (
          !dbSupabase
            .attendance[
              row.data
            ]
            .includes(
              personId
            )
        ) {

          dbSupabase
            .attendance[
              row.data
            ]
            .push(
              personId
            );

        }

      }

    }
  );


  return dbSupabase;

}


// ============================================================
// COMPATIBILIDADE
// NÃO USAMOS localStorage COMO BANCO.
// ============================================================

function save() {

  return true;

}


// ============================================================
// RECARREGAR DADOS
// ============================================================

async function reloadFromSupabase(
  showToast = false
) {

  db =
    await loadFromSupabase();


  renderAll();


  if (showToast) {

    toast(
      "Dados atualizados."
    );

  }

}


// ============================================================
// USUÁRIO ATUAL
// ============================================================

function getCurrentUserId() {

  if (!currentUser?.id) {

    throw new Error(
      "Usuário não autenticado."
    );

  }

  return currentUser.id;

}


// ============================================================
// CADASTRO DE PESSOA
// ============================================================

async function insertPerson(
  name,
  registration
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .insert({

        id,

        nome:
          name,

        "matrícula":
          registration,

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// CADASTRO DE ALIMENTO
// ============================================================

async function insertFood(
  name
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("Alimentos")
      .insert({

        id,

        nome:
          name,

        unidade:
          "unidade",

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// CADASTRO DE ORIGEM
// ============================================================

async function insertOrigin(
  name
) {

  const id =
    newNumericId();


  const {
    error
  } =
    await supabaseClient
      .from("origens")
      .insert({

        id,

        nome:
          name,

        ativo:
          true,

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// ENTRADA
// ============================================================

async function insertEntry({
  date,
  originId,
  foodId,
  qty
}) {

  const {
    error
  } =
    await supabaseClient
      .from("entradas")
      .insert({

        id:
          newNumericId(),

        data_entrada:
          date,

        alimento_id:
          Number(foodId),

        quantidade:
          Number(qty),

        origem_id:
          Number(originId),

        usuario_id:
          getCurrentUserId()

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// SAÍDA / PERDA
// ============================================================

async function insertMovement({
  date,
  type,
  originId,
  foodId,
  qty,
  reasonId,
  note
}) {

  const userId =
    getCurrentUserId();


  // ----------------------------------------------------------
  // SAÍDA
  // ----------------------------------------------------------

  if (
    type === "saida"
  ) {

    const {
      error
    } =
      await supabaseClient
        .from("saídas")
        .insert({

          id:
            newNumericId(),

          data_saida:
            date,

          alimento_id:
            Number(foodId),

          quantidade:
            Number(qty),

          origem_id:
            Number(originId),

          destino:
            note || "",

          usuario_id:
            userId

        });


    if (error) {

      throw error;

    }


    return;

  }


  // ----------------------------------------------------------
  // PERDA
  // ----------------------------------------------------------

  const reasonName =
    db.reasons.find(
      r =>
        r.id === reasonId
    )?.name ||

    reasonId ||

    "Outro";


  const {
    error
  } =
    await supabaseClient
      .from("perdas")
      .insert({

        id:
          newNumericId(),

        data_perda:
          date,

        alimento_id:
          Number(foodId),

        quantidade:
          Number(qty),

        origem_id:
          Number(originId),

        motivo:
          reasonName,

        usuario_id:
          userId

      });


  if (error) {

    throw error;

  }

}


// ============================================================
// EXCLUSÕES
// ============================================================

async function deletePerson(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("Pessoas")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteFood(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("Alimentos")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteOrigin(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("origens")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteEntry(
  id
) {

  const {
    error
  } =
    await supabaseClient
      .from("entradas")
      .delete()
      .eq(
        "id",
        Number(id)
      );


  if (error) {

    throw error;

  }

}


async function deleteMovement(
  id
) {

  const movement =
    db.movements.find(
      x =>
        x.id === id
    );


  if (
    !movement?.rawId ||
    !movement.sourceTable
  ) {

    throw new Error(
      "Não foi possível identificar a movimentação."
    );

  }


  const {
    error
  } =
    await supabaseClient
      .from(
        movement.sourceTable
      )
      .delete()
      .eq(
        "id",
        Number(
          movement.rawId
        )
      );


  if (error) {

    throw error;

  }

}


// ============================================================
// MOTIVOS — SOMENTE LOCAL
// ============================================================

async function deleteReasonLocalOnly(
  id
) {

  db.reasons =
    db.reasons.filter(
      x =>
        x.id !== id
    );


  saveLocalReasons();

}


// ============================================================
// PRESENÇA
// ============================================================

async function setAttendance(
  date,
  personId,
  present
) {

  const table =
    supabaseClient
      .from("presença");


  const {
    data: existing,
    error: findError
  } =
    await table
      .select("id")
      .eq(
        "data",
        date
      )
      .eq(
        "pessoa_id",
        Number(personId)
      )
      .limit(1);


  if (findError) {

    throw findError;

  }


  if (present) {

    if (
      !existing?.length
    ) {

      const {
        error
      } =
        await table
          .insert({

            id:
              newNumericId(),

            data:
              date,

            pessoa_id:
              Number(
                personId
              ),

            present:
              true,

            usuario_id:
              getCurrentUserId()

          });


      if (error) {

        throw error;

      }

    }


    return;

  }


  const {
    error
  } =
    await table
      .delete()
      .eq(
        "pessoa_id",
        Number(personId)
      )
      .eq(
        "data",
        date
      );


  if (error) {

    throw error;

  }

}
// ============================================================
// PARTE 2/5
// CONTINUAÇÃO DO ARQUIVO ORIGINAL
// ============================================================


// ============================================================
// 9. DASHBOARD — CONTINUAÇÃO
// ============================================================

  const recent =
    document.getElementById(
      "recentMovements"
    );


  if (recent) {

    const all = [

      ...db.entries.map(
        x => ({

          ...x,

          kind:
            "Entrada",

          sign:
            "+",

          color:
            "green"

        })
      ),


      ...db.movements.map(
        x => ({

          ...x,

          kind:
            x.type === "perda"
              ? "Perda"
              : "Saída",

          sign:
            "-",

          color:
            x.type === "perda"
              ? "red"
              : "blue"

        })
      )

    ]
      .sort(
        (a, b) =>
          (
            b.createdAt ||
            ""
          ).localeCompare(
            a.createdAt ||
            ""
          )
      )
      .slice(
        0,
        8
      );


    recent.innerHTML =

      all.length

        ? all
            .map(
              x => `

                <div class="recent-item">

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

  const date =
    document.getElementById(
      "entryDate"
    )?.value ||
    isoToday();


  const arr =
    db.entries
      .filter(
        x =>
          x.date === date
      )
      .sort(
        (a, b) =>
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
      (s, x) =>
        s +
        Number(
          x.qty
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
// 11. MOVIMENTAÇÕES
// ============================================================

function renderMovements() {

  const arr =
    db.movements
      .slice()
      .sort(
        (a, b) =>
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


  if (!el) {

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
// 12. ESTOQUE
// ============================================================

function renderStock() {

  const st =
    calcStock();


  const el =
    document.getElementById(
      "stockTable"
    );


  if (!el) {

    return;

  }


  const rows = [];


  db.origins.forEach(
    origin => {

      db.foods.forEach(
        food => {

          const qty =
            Number(
              st[
                Number(
                  origin.id
                )
              ]?.[
                Number(
                  food.id
                )
              ] || 0
            );


          rows.push({

            origin,
            food,
            qty

          });

        }
      );

    }
  );


  el.innerHTML =

    table(

      rows,

      [

        [
          "Origem",

          x =>
            esc(
              x.origin.name
            )

        ],

        [
          "Alimento",

          x =>
            esc(
              x.food.name
            )

        ],

        [
          "Estoque",

          x =>
            fmt(
              x.qty
            )

        ]

      ]

    );

}


// ============================================================
// 13. PRESENÇA
// ============================================================

function renderAttendance() {

  const date =
    document.getElementById(
      "attendanceDate"
    )?.value ||
    isoToday();


  const search =
    String(
      document.getElementById(
        "attendanceSearch"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const presentIds =
    new Set(
      (
        db.attendance[
          date
        ] || []
      )
        .map(
          Number
        )
    );


  const people =
    db.people
      .filter(
        p => {

          if (!search) {

            return true;

          }


          return (

            String(
              p.name
            )
              .toLowerCase()
              .includes(
                search
              ) ||

            String(
              p.registration
            )
              .toLowerCase()
              .includes(
                search
              )

          );

        }
      );


  const el =
    document.getElementById(
      "attendanceTable"
    );


  if (!el) {

    return;

  }


  el.innerHTML =

    people.length

      ? people
          .map(
            p => {

              const id =
                Number(
                  p.id
                );


              const present =
                presentIds.has(
                  id
                );


              return `

                <div class="attendance-row">

                  <div>

                    <strong>
                      ${esc(
                        p.name
                      )}
                    </strong>

                    <small>
                      Matrícula:
                      ${esc(
                        p.registration
                      )}
                    </small>

                  </div>


                  <button

                    type="button"

                    class="attendance-btn ${
                      present
                        ? "present"
                        : ""
                    }"

                    data-person-id="${id}"

                    data-present="${
                      present
                    }"

                  >

                    ${
                      present
                        ? "✓ Presente"
                        : "Marcar presença"
                    }

                  </button>

                </div>

              `;

            }
          )
          .join("")

      : `

          <div class="empty">

            Nenhuma pessoa encontrada.

          </div>

        `;


  el
    .querySelectorAll(
      ".attendance-btn"
    )
    .forEach(
      button => {

        button.addEventListener(

          "click",

          async () => {

            const personId =
              Number(
                button.dataset
                  .personId
              );


            const isPresent =
              button.dataset
                .present ===
              "true";


            button.disabled =
              true;


            try {

              await setAttendance(

                date,

                personId,

                !isPresent

              );


              await reloadFromSupabase();


              renderAttendance();


              toast(

                !isPresent

                  ? "Presença registrada."

                  : "Presença removida."

              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Não foi possível registrar a presença."
              );


            } finally {

              button.disabled =
                false;

            }

          }

        );

      }
    );

}


// ============================================================
// 14. CADASTROS
// ============================================================

function renderCadastros() {

  const peopleEl =
    document.getElementById(
      "peopleTable"
    );


  if (peopleEl) {

    peopleEl.innerHTML =

      table(

        db.people,

        [

          [
            "Nome",

            x =>
              esc(
                x.name
              )

          ],

          [
            "Matrícula",

            x =>
              esc(
                x.registration
              )

          ]

        ],

        x =>
          deleteCadastro(
            "people",
            x.id
          )

      );

  }


  const foodsEl =
    document.getElementById(
      "foodsTable"
    );


  if (foodsEl) {

    foodsEl.innerHTML =

      table(

        db.foods,

        [

          [
            "Alimento",

            x =>
              esc(
                x.name
              )

          ]

        ],

        x =>
          deleteCadastro(
            "foods",
            x.id
          )

      );

  }


  const originsEl =
    document.getElementById(
      "originsTable"
    );


  if (originsEl) {

    originsEl.innerHTML =

      table(

        db.origins,

        [

          [
            "Origem",

            x =>
              esc(
                x.name
              )

          ]

        ],

        x =>
          deleteCadastro(
            "origins",
            x.id
          )

      );

  }


  const reasonsEl =
    document.getElementById(
      "reasonsTable"
    );


  if (reasonsEl) {

    reasonsEl.innerHTML =

      table(

        db.reasons,

        [

          [
            "Motivo",

            x =>
              esc(
                x.name
              )

          ]

        ],

        x =>
          deleteCadastro(
            "reasons",
            x.id
          )

      );

  }

}


// ============================================================
// 15. TABELA
// ============================================================

function table(
  rows,
  columns,
  removeFn
) {

  if (!rows?.length) {

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

            ${columns
              .map(
                c =>
                  `<th>${c[0]}</th>`
              )
              .join("")}

            ${
              removeFn
                ? "<th>Ação</th>"
                : ""
            }

          </tr>

        </thead>


        <tbody>

          ${rows
            .map(
              row => `

                <tr>

                  ${columns
                    .map(
                      c =>
                        `<td>
                          ${c[1](row)}
                        </td>`
                    )
                    .join("")}

                  ${
                    removeFn

                      ? `

                        <td>

                          <button

                            type="button"

                            class="delete-btn"

                            data-delete="true"

                          >

                            🗑️

                          </button>

                        </td>

                      `

                      : ""
                  }

                </tr>

              `
            )
            .join("")}

        </tbody>

      </table>

    </div>

  `;

}


// ============================================================
// FIM DA PARTE 2/5
// ============================================================

// ============================================================
// PARTE 3/5
// ============================================================


// ============================================================
// 20. NAVEGAÇÃO
// ============================================================

function nav() {

  document
    .querySelectorAll(
      ".tab,.home-card"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const page =
              button.dataset.page;


            document
              .querySelectorAll(
                ".tab"
              )
              .forEach(
                tab =>
                  tab.classList.toggle(
                    "active",
                    tab.dataset.page ===
                      page
                  )
              );


            document
              .querySelectorAll(
                ".page"
              )
              .forEach(
                section =>
                  section.classList.remove(
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

              top:
                0,

              behavior:
                "smooth"

            });

          }
        );

      }
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
// 21. CADASTROS
// ============================================================

function renderCadastros() {

  // ----------------------------------------------------------
  // PESSOAS
  // ----------------------------------------------------------

  const people =
    document.getElementById(
      "peopleTable"
    );


  if (people) {

    people.innerHTML = `

      <div class="mini-list">

        ${
          db.people.length

            ? db.people
                .map(
                  person => `

                    <div class="mini-row">

                      <span>

                        <b>
                          ${esc(
                            person.name
                          )}
                        </b>

                        <br>

                        <small>

                          Matrícula:

                          ${esc(
                            person.registration
                          )}

                        </small>

                      </span>


                      <button

                        class="btn danger-btn"

                        data-del-person="${person.id}"

                      >

                        Excluir

                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">

                Nenhuma pessoa cadastrada.

              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // ALIMENTOS
  // ----------------------------------------------------------

  const foods =
    document.getElementById(
      "foodsTable"
    );


  if (foods) {

    foods.innerHTML = `

      <div class="mini-list">

        ${
          db.foods.length

            ? db.foods
                .map(
                  food => `

                    <div class="mini-row">

                      <span>

                        ${esc(
                          food.name
                        )}

                      </span>


                      <button

                        class="btn danger-btn"

                        data-del-food="${food.id}"

                      >

                        Excluir

                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">

                Nenhum alimento cadastrado.

              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // ORIGENS
  // ----------------------------------------------------------

  const origins =
    document.getElementById(
      "originsTable"
    );


  if (origins) {

    origins.innerHTML = `

      <div class="mini-list">

        ${
          db.origins.length

            ? db.origins
                .map(
                  origin => `

                    <div class="mini-row">

                      <span>

                        ${esc(
                          origin.name
                        )}

                      </span>


                      <button

                        class="btn danger-btn"

                        data-del-origin="${origin.id}"

                      >

                        Excluir

                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">

                Nenhuma origem cadastrada.

              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // MOTIVOS
  // ----------------------------------------------------------

  const reasons =
    document.getElementById(
      "reasonsTable"
    );


  if (reasons) {

    reasons.innerHTML = `

      <div class="mini-list">

        ${
          db.reasons.length

            ? db.reasons
                .map(
                  reason => `

                    <div class="mini-row">

                      <span>

                        ${esc(
                          reason.name
                        )}

                      </span>


                      <button

                        class="btn danger-btn"

                        data-del-reason="${esc(
                          reason.id
                        )}"

                      >

                        Excluir

                      </button>

                    </div>

                  `
                )
                .join("")

            : `

              <div class="empty">

                Nenhum motivo cadastrado.

              </div>

            `
        }

      </div>

    `;

  }


  // ----------------------------------------------------------
  // EVENTOS DE EXCLUSÃO
  // ----------------------------------------------------------

  document
    .querySelectorAll(
      "[data-del-person]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir esta pessoa?"
              )
            ) {

              return;

            }


            try {

              await deletePerson(
                button.dataset
                  .delPerson
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Pessoa excluída."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir pessoa: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-food]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir este alimento?"
              )
            ) {

              return;

            }


            try {

              await deleteFood(
                button.dataset
                  .delFood
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Alimento excluído."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir alimento: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-origin]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir esta origem?"
              )
            ) {

              return;

            }


            try {

              await deleteOrigin(
                button.dataset
                  .delOrigin
              );


              await reloadFromSupabase(
                false
              );


              toast(
                "Origem excluída."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir origem: " +
                (
                  error?.message ||
                  "erro desconhecido"
                )
              );

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-del-reason]"
    )
    .forEach(
      button => {

        button.onclick =
          async () => {

            if (
              !confirm(
                "Excluir este motivo?"
              )
            ) {

              return;

            }


            try {

              await deleteReasonLocalOnly(
                button.dataset
                  .delReason
              );


              renderCadastros();

              refreshSelects();


              toast(
                "Motivo excluído."
              );


            } catch (error) {

              console.error(
                error
              );


              toast(
                "Erro ao excluir motivo."
              );

            }

          };

      }
    );

}


// ============================================================
// 22. EVENTOS DOS FORMULÁRIOS
// ============================================================

function bindEvents() {

  // ==========================================================
  // ENTRADA
  // ==========================================================

  const entryForm =
    document.getElementById(
      "entryForm"
    );


  if (entryForm) {

    entryForm.addEventListener(

      "submit",

      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          String(
            form.get("date") ||
            ""
          );


        const originId =
          Number(
            form.get("origin")
          );


        const foodId =
          Number(
            form.get("foodId")
          );


        const qty =
          Number(
            form.get("qty")
          );


        const note =
          String(
            form.get("note") ||
            ""
          ).trim();


        // ----------------------------------------------------
        // VALIDAÇÃO
        // ----------------------------------------------------

        if (!date) {

          toast(
            "Informe a data."
          );

          return;

        }


        if (
          !originId ||
          !foodId
        ) {

          toast(
            "Selecione a origem e o alimento."
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


        try {

          await insertEntry({

            date,

            originId,

            foodId,

            qty

          });


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          document.getElementById(
            "entryDate"
          ).value =
            isoToday();


          toast(
            "Entrada registrada com sucesso."
          );


        } catch (error) {

          console.error(
            "ERRO ENTRADA:",
            error
          );


          alert(

            "Erro ao registrar entrada:\n\n" +

            (
              error?.message ||
              JSON.stringify(
                error
              )
            )

          );

        }

      }

    );

  }


  // ==========================================================
  // SAÍDA / PERDA
  // ==========================================================

  const movementForm =
    document.getElementById(
      "movementForm"
    );


  if (movementForm) {

    movementForm.addEventListener(

      "submit",

      async event => {

        event.preventDefault();


        const form =
          new FormData(
            event.target
          );


        const date =
          String(
            form.get("date") ||
            ""
          );


        const type =
          String(
            form.get("type") ||
            "saida"
          );


        const originId =
          Number(
            form.get("origin")
          );


        const foodId =
          Number(
            form.get("foodId")
          );


        const qty =
          Number(
            form.get("qty")
          );


        const reasonId =
          String(
            form.get(
              "reasonId"
            ) ||
            ""
          );


        const note =
          String(
            form.get("note") ||
            ""
          ).trim();


        // ----------------------------------------------------
        // VALIDAÇÕES
        // ----------------------------------------------------

        if (!date) {

          toast(
            "Informe a data."
          );

          return;

        }


        if (
          !originId ||
          !foodId
        ) {

          toast(
            "Selecione a origem e o alimento."
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


        if (
          type === "perda" &&
          !reasonId
        ) {

          toast(
            "Selecione o motivo da perda."
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

          alert(

            `Quantidade superior ao estoque disponível.\n\n` +

            `Alimento: ${
              getName(
                db.foods,
                foodId
              )
            }\n` +

            `Origem: ${
              getName(
                db.origins,
                originId
              )
            }\n` +

            `Disponível: ${
              fmt(
                available
              )
            }`

          );

          return;

        }


        try {

          await insertMovement({

            date,

            type,

            originId,

            foodId,

            qty,

            reasonId,

            note

          });


          await reloadFromSupabase(
            false
          );


          event.target.reset();


          document.getElementById(
            "movementDate"
          ).value =
            isoToday();


          toast(

            type === "perda"

              ? "Perda registrada com sucesso."

              : "Saída registrada com sucesso."

          );


        } catch (error) {

          console.error(
            "ERRO MOVIMENTAÇÃO:",
            error
          );


          alert(

            "Erro ao registrar movimentação:\n\n" +

            (
              error?.message ||
              JSON.stringify(
                error
              )
            )

          );

        }

      }

    );

  }


  // ==========================================================
  // DASHBOARD
  // ==========================================================

  const dashboardDate =
    document.getElementById(
      "dashboardDate"
    );


  if (dashboardDate) {

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


  if (entryDate) {

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


  if (attendanceDate) {

    attendanceDate.addEventListener(
      "change",
      renderAttendance
    );

  }


  // ==========================================================
  // BUSCA DE PESSOAS
  // ==========================================================

  const attendanceSearch =
    document.getElementById(
      "attendanceSearch"
    );


  if (attendanceSearch) {

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


  if (refreshStock) {

    refreshStock.addEventListener(

      "click",

      async () => {

        try {

          await reloadFromSupabase(
            true
          );


        } catch (error) {

          console.error(
            error
          );


          toast(
            "Erro ao atualizar estoque."
          );

        }

      }

    );

  }


  // ==========================================================
  // RELATÓRIO
  // ==========================================================

  const generateReport =
    document.getElementById(
      "generateReport"
    );


  if (generateReport) {

    generateReport.addEventListener(
      "click",
      renderReport
    );

  }


  // ==========================================================
  // CSV
  // ==========================================================

  const exportCSVButton =
    document.getElementById(
      "exportCSV"
    );


  if (exportCSVButton) {

    exportCSVButton.addEventListener(
      "click",
      exportCSV
    );

  }

}

// ============================================================
// PARTE 4/5
// ============================================================


// ============================================================
// 23. BACKUP
// ============================================================

function setupBackup() {

  const backupBtn =
    document.getElementById(
      "backupBtn"
    );


  if (backupBtn) {

    backupBtn.addEventListener(

      "click",

      () => {

        const backup = {

          versao:
            "ACE-SUPABASE-V1",

          exportadoEm:
            new Date()
              .toISOString(),

          usuario:
            currentUser?.email ||
            "",

          dados:
            db

        };


        const blob =
          new Blob(

            [
              JSON.stringify(
                backup,
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

          `backup_ACE_${
            isoToday()
          }.json`

        );


        toast(
          "Backup gerado."
        );

      }

    );

  }


  // ----------------------------------------------------------
  // RESTAURAÇÃO
  // ----------------------------------------------------------

  const restoreFile =
    document.getElementById(
      "restoreFile"
    );


  if (restoreFile) {

    restoreFile.addEventListener(

      "change",

      async event => {

        const file =
          event.target.files?.[0];


        if (!file) {

          return;

        }


        try {

          const text =
            await file.text();


          const backup =
            JSON.parse(
              text
            );


          if (
            !backup ||
            !backup.dados
          ) {

            throw new Error(
              "Arquivo de backup inválido."
            );

          }


          const ok =
            confirm(

              "O backup será apenas conferido. " +

              "A restauração automática no Supabase está desativada para evitar duplicação de dados.\n\n" +

              "Deseja apenas verificar o arquivo?"

            );


          if (ok) {

            toast(
              "Backup válido e conferido."
            );

          }


        } catch (error) {

          alert(

            "Erro ao ler backup:\n\n" +

            error.message

          );

        }


        event.target.value =
          "";

      }

    );

  }


  // ----------------------------------------------------------
  // RESET
  // ----------------------------------------------------------

  const resetBtn =
    document.getElementById(
      "resetBtn"
    );


  if (resetBtn) {

    resetBtn.addEventListener(

      "click",

      async () => {

        const ok =
          confirm(

            "Isso NÃO apagará os dados do Supabase.\n\n" +

            "O sistema apenas será recarregado com os dados atuais do banco.\n\n" +

            "Continuar?"

          );


        if (!ok) {

          return;

        }


        try {

          await reloadFromSupabase(
            true
          );


        } catch (error) {

          console.error(
            error
          );


          alert(

            "Erro ao recarregar:\n\n" +

            error.message

          );

        }

      }

    );

  }

}


// ============================================================
// 24. PWA
// ============================================================

function setupPWA() {

  window.addEventListener(

    "beforeinstallprompt",

    event => {

      event.preventDefault();


      deferredPrompt =
        event;


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

        if (
          !deferredPrompt
        ) {

          return;

        }


        deferredPrompt.prompt();


        deferredPrompt =
          null;


        installBtn.classList.add(
          "hidden"
        );

      }

    );

  }


  if (
    "serviceWorker" in
    navigator
  ) {

    window.addEventListener(

      "load",

      () => {

        navigator.serviceWorker
          .register(
            "sw.js"
          )
          .catch(
            error =>
              console.warn(
                "Service Worker:",
                error
              )
          );

      }

    );

  }

}


// ============================================================
// 25. RENDERIZAR TUDO
// ============================================================

function renderAll() {

  if (!db) {

    return;

  }


  refreshSelects();


  renderDashboard();


  renderEntries();


  renderMovements();


  renderAttendance();


  renderStock();


  renderCadastros();

}


// ============================================================
// 26. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  if (appStarted) {

    return;

  }


  appStarted =
    true;


  try {

    console.log(
      "ACE: carregando banco..."
    );


    db =
      await loadFromSupabase();


    console.log(
      "ACE: banco carregado.",
      db
    );


    setDates();


    nav();


    bindEvents();


    setupBackup();


    setupPWA();


    addUserBar();


    renderAll();


    console.log(
      "ACE: aplicativo iniciado com sucesso."
    );


  } catch (error) {

    console.error(
      "ERRO AO INICIAR:",
      error
    );


    appStarted =
      false;


    alert(

      "Erro ao carregar o sistema:\n\n" +

      (
        error?.message ||
        JSON.stringify(
          error
        )
      )

    );

  }

}


// ============================================================
// 27. AUTENTICAÇÃO
// ============================================================

async function startAuth() {

  // ----------------------------------------------------------
  // CRIA A TELA DE LOGIN
  // ----------------------------------------------------------

  createLoginScreen();


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {

      throw error;

    }


    // --------------------------------------------------------
    // JÁ ESTÁ LOGADO
    // --------------------------------------------------------

    if (
      data?.session?.user
    ) {

      currentUser =
        data.session.user;


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      await initApp();


      return;

    }


  } catch (error) {

    console.error(
      "Erro ao verificar sessão:",
      error
    );


    const loginError =
      document.getElementById(
        "loginError"
      );


    if (loginError) {

      loginError.textContent =

        "Erro ao conectar ao Supabase: " +

        (
          error?.message ||
          "erro desconhecido"
        );


      loginError.classList.add(
        "show"
      );

    }

  }


  // ----------------------------------------------------------
  // OUVIR ALTERAÇÕES DE LOGIN
  // ----------------------------------------------------------

  supabaseClient
    .auth
    .onAuthStateChange(

      async (
        event,
        session
      ) => {

        console.log(
          "AUTH:",
          event
        );


        // ----------------------------------------------------
        // LOGIN
        // ----------------------------------------------------

        if (

          event ===
            "SIGNED_IN" &&

          session?.user

        ) {

          currentUser =
            session.user;


          document
            .getElementById(
              "loginScreen"
            )
            ?.remove();


          await initApp();

        }


        // ----------------------------------------------------
        // LOGOUT
        // ----------------------------------------------------

        if (
          event ===
          "SIGNED_OUT"
        ) {

          location.reload();

        }

      }

    );

}


// ============================================================
// 28. INICIAR
// ============================================================

startAuth();


// ============================================================
// FIM DA PARTE 4
// ============================================================

// ============================================================
// 23. PWA
// ============================================================

function setupPWA() {

  window.addEventListener(

    "beforeinstallprompt",

    event => {

      event.preventDefault();


      deferredPrompt =
        event;


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

        if (
          !deferredPrompt
        ) {

          return;

        }


        deferredPrompt.prompt();


        deferredPrompt =
          null;


        installBtn.classList.add(
          "hidden"
        );

      }

    );

  }


  if (
    "serviceWorker" in
    navigator
  ) {

    window.addEventListener(

      "load",

      () => {

        navigator.serviceWorker
          .register(
            "sw.js"
          )
          .catch(

            error =>
              console.warn(
                "Service Worker:",
                error
              )

          );

      }

    );

  }

}


// ============================================================
// 25. RENDERIZAR TUDO
// ============================================================

function renderAll() {

  if (!db) {

    return;

  }


  refreshSelects();


  renderDashboard();


  renderEntries();


  renderMovements();


  renderAttendance();


  renderStock();


  renderCadastros();

}


// ============================================================
// 26. INICIALIZAÇÃO DO APLICATIVO
// ============================================================

async function initApp() {

  if (appStarted) {

    return;

  }


  appStarted =
    true;


  try {

    console.log(
      "ACE: carregando banco..."
    );


    db =
      await loadFromSupabase();


    console.log(
      "ACE: banco carregado.",
      db
    );


    setDates();


    nav();


    bindEvents();


    setupBackup();


    setupPWA();


    addUserBar();


    renderAll();


    console.log(
      "ACE: aplicativo iniciado com sucesso."
    );


  } catch (error) {

    console.error(
      "ERRO AO INICIAR:",
      error
    );


    appStarted =
      false;


    alert(

      "Erro ao carregar o sistema:\n\n" +

      (
        error?.message ||
        JSON.stringify(
          error
        )
      )

    );

  }

}


// ============================================================
// 27. AUTENTICAÇÃO
// ============================================================

async function startAuth() {

  createLoginScreen();


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {

      throw error;

    }


    if (
      data?.session?.user
    ) {

      currentUser =
        data.session.user;


      document
        .getElementById(
          "loginScreen"
        )
        ?.remove();


      await initApp();


      return;

    }


  } catch (error) {

    console.error(
      "Erro ao verificar sessão:",
      error
    );


    const loginError =
      document.getElementById(
        "loginError"
      );


    if (loginError) {

      loginError.textContent =

        "Erro ao conectar ao Supabase: " +

        (
          error?.message ||
          "erro desconhecido"
        );


      loginError.classList.add(
        "show"
      );

    }

  }


  // ----------------------------------------------------------
  // OUVIR ALTERAÇÕES DE LOGIN
  // ----------------------------------------------------------

  supabaseClient
    .auth
    .onAuthStateChange(

      async (
        event,
        session
      ) => {

        console.log(
          "AUTH:",
          event
        );


        if (

          event ===
            "SIGNED_IN" &&

          session?.user

        ) {

          currentUser =
            session.user;


          document
            .getElementById(
              "loginScreen"
            )
            ?.remove();


          await initApp();

        }


        if (
          event ===
          "SIGNED_OUT"
        ) {

          location.reload();

        }

      }

    );

}


// ============================================================
// 28. INICIAR
// ============================================================

startAuth();


// ============================================================
// FIM DO APP.JS
// ============================================================
