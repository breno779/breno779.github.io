/* =====================================================================
 * UCM Watchlist — v40 BETA — 📚 conteúdo: cenas pós-créditos, o que ver
 * antes, trilhas por personagem, vilões, glossário e quiz.
 * Só entrou o que eu tenho certeza; o que não tenho certeza ficou de fora.
 * ===================================================================== */
(function () {
  'use strict';
  const V40 = window.V40;

  // ---------- 🎬 cenas extras nos créditos (meio + final) ----------
  // número de cenas; 0 = pode sair no começo dos créditos
  const CREDITS = {
    k41: [1, 'depois de todos os créditos'], k47: [0, 'a cena do Tony é antes dos créditos'], k43: [1, 'depois dos créditos'],
    k45: [1, 'depois dos créditos'], k7: [1, 'depois dos créditos'], k51: [2, 'uma no meio, outra no final'],
    k58: [1, 'depois dos créditos'], k61: [2, 'meio e final'], k64: [2, 'meio e final'], k67: [2, 'meio e final'],
    k75: [1, 'no meio dos créditos'], k79: [2, 'meio e final'], k82: [2, 'meio e final'], k91: [2, 'meio e final'],
    k68: [5, 'cinco cenas espalhadas pelos créditos'], k90: [2, 'meio e final'], k98: [2, 'meio e final'],
    k87: [2, 'meio e final'], k112: [1, 'depois dos créditos'], k107: [2, 'meio e final'], k20: [2, 'meio e final'],
    k120: [0, 'nenhuma cena — só um som no final'], k135: [2, 'meio e final'], k86: [1, 'depois dos créditos'],
    k130: [2, 'meio e final'], k131: [2, 'meio e final'], k136: [2, 'meio e final'], k144: [2, 'meio e final'],
    k132: [2, 'meio e final'], k148: [1, 'no meio dos créditos'], k150: [2, 'meio e final'], k151: [2, 'meio e final'],
    k152: [1, 'no meio dos créditos'], k141: [1, 'depois dos créditos'], k156: [1, 'depois dos créditos'],
    k161: [2, 'meio e final'], k85: [1, 'depois dos créditos'], k109: [1, 'depois dos créditos'],
    k126: [0, 'nenhuma cena'], k108: [2, 'meio e final'], k133: [1, 'no meio dos créditos'],
    k62: [1, 'no meio dos créditos'], k15: [1, 'depois dos créditos'], k16: [1, 'depois dos créditos'], k140: [0, 'nenhuma cena'],
    k18: [0, 'nenhuma cena']
  };

  // ---------- 🔗 o que ver antes (as conexões mais importantes) ----------
  const BEFORE = {
    k51: ['k41', 'k43', 'k47', 'k45', 'k7'],
    k75: ['k51', 'k64'],
    k82: ['k75', 'k64'],
    k112: ['k82', 'k98', 'k87', 'k91', 'k67', 'k68'],
    k120: ['k112', 'k20', 'k107'],
    k128: ['k120', 'k75'],
    k129: ['k120', 'k64'],
    k121: ['k51', 'k120'],
    k122: ['k121'],
    k135: ['k90', 'k120'],
    k136: ['k135', 'k27', 'k31', 'k36', 'k50', 'k66'],
    k144: ['k91', 'k128', 'k136'],
    k139: ['k86', 'k120'],
    k152: ['k20', 'k145', 'k128'],
    k154: ['k128'],
    k162: ['k128', 'k154'],
    k150: ['k107', 'k121'],
    k151: ['k68', 'k149'],
    k148: ['k87'],
    k155: ['k148'],
    k156: ['k129', 'k47', 'k131'],
    k161: ['k86', 'k129', 'k107'],
    k141: ['k85', 'k100', 'k140', 'k121'],
    k165: ['k161', 'k14', 'k156'],
    k166: ['k165'],
    k142: ['k139'],
    k157: ['k73', 'k80', 'k105', 'k142'],
    k96: ['k73', 'k80', 'k74', 'k81', 'k95'],
    k97: ['k80'],
    k140: ['k62', 'k15'],
    k21: ['k19'],
    k153: ['k20', 'k135'],
    k132: ['k98', 'k120'],
    k137: ['k133', 'k136'],
    k133: ['k108'],
    k126: ['k109'],
    k169: ['k126'],
    k164: ['k136'],
    k63: ['k61'],
    k65: ['k64'],
    k77: ['k75']
  };

  // ---------- 🧭 trilhas mínimas por personagem ----------
  V40.TRAILS = [
    { id: 'ironman', icon: '⚙️', name: 'Homem de Ferro', keys: ['k41', 'k43', 'k51', 'k58', 'k75', 'k82', 'k112', 'k120'] },
    { id: 'cap', icon: '🛡️', name: 'Capitão América (Steve)', keys: ['k7', 'k51', 'k64', 'k75', 'k82', 'k112', 'k120'] },
    { id: 'sam', icon: '🦅', name: 'Capitão América (Sam)', keys: ['k64', 'k82', 'k120', 'k129', 'k156', 'k165'] },
    { id: 'thor', icon: '🌩️', name: 'Thor', keys: ['k45', 'k51', 'k61', 'k98', 'k112', 'k120', 'k132'] },
    { id: 'loki', icon: '🐍', name: 'Loki', keys: ['k45', 'k51', 'k61', 'k98', 'k112', 'k121', 'k122'] },
    { id: 'spidey', icon: '🕷️', name: 'Homem-Aranha (UCM)', keys: ['k82', 'k90', 'k112', 'k120', 'k135', 'k136', 'k164'] },
    { id: 'strange', icon: '🔮', name: 'Doutor Estranho', keys: ['k91', 'k98', 'k112', 'k120', 'k136', 'k144'] },
    { id: 'wanda', icon: '🧙‍♀️', name: 'Wanda e Visão', keys: ['k75', 'k82', 'k112', 'k120', 'k128', 'k144', 'k154', 'k162'] },
    { id: 'widow', icon: '🕴️', name: 'Viúva Negra e Yelena', keys: ['k51', 'k64', 'k82', 'k86', 'k120', 'k139', 'k161'] },
    { id: 'panther', icon: '🐆', name: 'Pantera Negra / Wakanda', keys: ['k82', 'k87', 'k112', 'k120', 'k148', 'k155'] },
    { id: 'carol', icon: '⭐', name: 'Capitã Marvel', keys: ['k20', 'k120', 'k145', 'k152'] },
    { id: 'gotg', icon: '🌌', name: 'Guardiões da Galáxia', keys: ['k67', 'k68', 'k112', 'k120', 'k149', 'k151'] },
    { id: 'kang', icon: '⏳', name: 'Multiverso e Kang', keys: ['k121', 'k150', 'k122', 'k144'] },
    { id: 'defenders', icon: '🏙️', name: 'Defensores (Netflix)', keys: ['k73', 'k74', 'k81', 'k95', 'k96', 'k80', 'k97', 'k157'] },
    { id: 'xmen', icon: '🧬', name: 'X-Men (Fox)', keys: ['k26', 'k30', 'k35', 'k13', 'k15', 'k140'] },
    { id: 'deadpool', icon: '🗡️', name: 'Deadpool', keys: ['k85', 'k100', 'k141'] },
    { id: 'doomsday', icon: '💀', name: 'Rumo a Doomsday', keys: ['k120', 'k121', 'k122', 'k156', 'k161', 'k14', 'k165'] }
  ];

  // ---------- 🦹 vilões ----------
  V40.VILLAINS = [
    ['Obadiah Stane', 'k41', 'Sócio de Tony que vira o Monge de Ferro.'],
    ['Abominável', 'k47', 'Emil Blonsky, soldado que vira um monstro mais forte que o Hulk.'],
    ['Chicote Negro', 'k43', 'Ivan Vanko, com raiva da família Stark.'],
    ['Caveira Vermelha', 'k7', 'Líder da HYDRA na Segunda Guerra.'],
    ['Loki', 'k45', 'Irmão adotivo de Thor; depois vira anti-herói.'],
    ['Thanos', 'k51', 'Aparece na cena pós-créditos de Os Vingadores; o Titã Louco das Joias do Infinito.'],
    ['Aldrich Killian', 'k58', 'O verdadeiro poder por trás do "Mandarim" de Homem de Ferro 3.'],
    ['Malekith', 'k61', 'Elfo Negro que quer o Éter.'],
    ['Alexander Pierce', 'k64', 'Figurão da S.H.I.E.L.D. que na verdade é da HYDRA.'],
    ['Ronan', 'k67', 'Kree fanático, caçador da Orbe.'],
    ['Ultron', 'k75', 'IA criada por Tony e Banner que quer extinguir a humanidade.'],
    ['Jaqueta Amarela', 'k79', 'Darren Cross, o rival de Hank Pym.'],
    ['Wilson Fisk (Rei do Crime)', 'k73', 'O chefão de Hell\'s Kitchen.'],
    ['Kilgrave', 'k74', 'Controla mentes e persegue Jessica Jones.'],
    ['Helmut Zemo', 'k82', 'O cérebro por trás da divisão dos Vingadores.'],
    ['Dormammu', 'k91', 'Entidade da Dimensão Sombria.'],
    ['Ego', 'k68', 'Um planeta vivo — e pai de Peter Quill.'],
    ['Abutre', 'k90', 'Adrian Toomes, que vende armas com tecnologia alienígena.'],
    ['Hela', 'k98', 'Deusa da Morte, irmã mais velha de Thor.'],
    ['Erik Killmonger', 'k87', 'Primo de T\'Challa que quer o trono de Wakanda.'],
    ['Mysterio', 'k135', 'Quentin Beck, mestre das ilusões.'],
    ['Wenwu', 'k130', 'Pai de Shang-Chi, dono dos Dez Anéis.'],
    ['Agatha Harkness', 'k128', 'A "vizinha" de Westview que é uma bruxa.'],
    ['Aquele Que Permanece / Kang', 'k121', 'Variante que controla a Linha do Tempo Sagrada.'],
    ['Arthur Harrow', 'k143', 'Ex-avatar de Khonshu, serve a deusa Ammit.'],
    ['Gorr', 'k132', 'O Carniceiro dos Deuses.'],
    ['Namor', 'k148', 'Rei de Talokan, o reino submarino.'],
    ['Alto Evolucionário', 'k151', 'O criador de Rocket.'],
    ['Galactus', 'k14', 'O devorador de mundos.'],
    ['Doutor Destino', 'k165', 'O grande vilão de Vingadores: Doomsday.'],
    ['Magneto', 'k26', 'Mutante que controla o metal.'],
    ['Duende Verde', 'k27', 'Norman Osborn, o primeiro vilão do Homem-Aranha de Raimi.'],
    ['Doutor Octopus', 'k31', 'Otto Octavius e seus braços mecânicos.']
  ];

  // ---------- 📖 glossário ----------
  V40.GLOSSARY = [
    ['Joias do Infinito', 'Seis pedras (Espaço, Mente, Realidade, Poder, Tempo e Alma) que juntas dão poder sobre o universo.'],
    ['Tesseract', 'O cubo que guarda a Joia do Espaço.'],
    ['Éter', 'A forma líquida da Joia da Realidade (Thor: O Mundo Sombrio).'],
    ['Orbe', 'O objeto que guarda a Joia do Poder (Guardiões da Galáxia).'],
    ['Cetro de Loki', 'Tinha a Joia da Mente — que depois vira parte do Visão.'],
    ['Olho de Agamotto', 'O amuleto do Doutor Estranho, com a Joia do Tempo.'],
    ['Manopla do Infinito', 'A luva feita pra usar todas as Joias juntas.'],
    ['O Estalo / Blip', 'Thanos apaga metade da vida do universo; 5 anos depois todos voltam.'],
    ['Vibranium', 'Metal quase indestrutível de Wakanda (e do escudo do Capitão).'],
    ['Adamantium', 'Liga de metal que cobre o esqueleto do Wolverine.'],
    ['Reino Quântico', 'Dimensão minúscula fora do tempo, explorada pelos Pym.'],
    ['AVT (TVA)', 'Autoridade de Variância Temporal: vigia a Linha do Tempo Sagrada.'],
    ['Variante', 'Uma versão alternativa de alguém (ex.: os vários Lokis).'],
    ['Multiverso', 'Infinitas realidades paralelas.'],
    ['Incursão', 'Quando dois universos colidem e um destrói o outro.'],
    ['Terra-616', 'Como o universo principal do UCM é chamado.'],
    ['Terra-828', 'O universo do Quarteto Fantástico em Primeiros Passos.'],
    ['Celestiais', 'Seres cósmicos gigantes que criaram os Eternos.'],
    ['Skrulls e Krees', 'Duas raças alienígenas em guerra (Capitã Marvel, Invasão Secreta).'],
    ['HYDRA', 'Organização terrorista nascida na Segunda Guerra, escondida dentro da S.H.I.E.L.D.'],
    ['S.H.I.E.L.D.', 'Agência de espionagem de Nick Fury.'],
    ['S.W.O.R.D.', 'Agência que cuida de ameaças do espaço (WandaVision).'],
    ['Darkhold', 'Livro de magia proibida (Agents of S.H.I.E.L.D., Multiverso da Loucura).'],
    ['Dez Anéis', 'Os anéis de Wenwu e o nome da organização dele.'],
    ['Mutantes', 'Pessoas que nascem com o gene X e ganham poderes.'],
    ['Inumanos', 'Pessoas com DNA Kree que ganham poderes pela Névoa Terrígena.']
  ];

  // ---------- 🧠 quiz (só pergunta de títulos que você já viu) ----------
  V40.QUIZ = [
    ['k41', 'Em que país Tony Stark é sequestrado no começo de Homem de Ferro?', 'Afeganistão', ['Iraque', 'Sokóvia', 'Rússia']],
    ['k41', 'Qual a última frase de Tony em Homem de Ferro (2008)?', '"Eu sou o Homem de Ferro."', ['"Eu amo você 3000."', '"Vingadores, avante!"', '"Gênio, bilionário, playboy, filantropo."']],
    ['k7', 'Quem cria o soro do supersoldado que transforma Steve Rogers?', 'Dr. Abraham Erskine', ['Howard Stark', 'Arnim Zola', 'Hank Pym']],
    ['k45', 'Pra onde Odin manda Thor depois de tirar os poderes dele?', 'Terra (Novo México)', ['Jotunheim', 'Sakaar', 'Vormir']],
    ['k51', 'Qual Joia do Infinito estava dentro do Tesseract?', 'Joia do Espaço', ['Joia da Mente', 'Joia do Poder', 'Joia da Realidade']],
    ['k51', 'Em que cidade é a batalha final de Os Vingadores?', 'Nova York', ['Washington', 'Londres', 'Sokóvia']],
    ['k58', 'Quem é o verdadeiro vilão por trás do "Mandarim" em Homem de Ferro 3?', 'Aldrich Killian', ['Trevor Slattery', 'Obadiah Stane', 'Justin Hammer']],
    ['k61', 'O Éter é qual Joia do Infinito?', 'Joia da Realidade', ['Joia do Tempo', 'Joia da Alma', 'Joia do Espaço']],
    ['k64', 'Quem é o Soldado Invernal?', 'Bucky Barnes', ['Brock Rumlow', 'Sam Wilson', 'John Walker']],
    ['k67', 'Qual música toca quando Peter Quill dança na abertura de Guardiões da Galáxia?', '"Come and Get Your Love"', ['"Hooked on a Feeling"', '"Mr. Blue Sky"', '"Ain\'t No Mountain High Enough"']],
    ['k68', 'Quem é o pai de Peter Quill?', 'Ego', ['Yondu', 'Thanos', 'Ronan']],
    ['k75', 'Quem cria Ultron?', 'Tony Stark e Bruce Banner', ['Hank Pym', 'Thanos', 'a HYDRA']],
    ['k75', 'Qual cidade Ultron faz flutuar?', 'Sokóvia', ['Nova York', 'Lagos', 'Wakanda']],
    ['k79', 'Qual o nome do traje do vilão em Homem-Formiga?', 'Jaqueta Amarela', ['Vespa', 'Fantasma', 'Homem-Gigante']],
    ['k82', 'Qual documento divide os Vingadores em Guerra Civil?', 'Acordos de Sokóvia', ['Lei de Registro Mutante', 'Tratado de Wakanda', 'Protocolo Fênix']],
    ['k82', 'Quem é o cérebro por trás do conflito em Guerra Civil?', 'Helmut Zemo', ['Thaddeus Ross', 'Alexander Pierce', 'Ulysses Klaue']],
    ['k91', 'Qual Joia está no Olho de Agamotto?', 'Joia do Tempo', ['Joia da Mente', 'Joia da Alma', 'Joia do Poder']],
    ['k91', 'Com qual entidade o Doutor Estranho "negocia" no final?', 'Dormammu', ['Shuma-Gorath', 'Mephisto', 'Kaecilius']],
    ['k98', 'Em que planeta Thor vira gladiador em Ragnarok?', 'Sakaar', ['Xandar', 'Titã', 'Vormir']],
    ['k98', 'Quem é a irmã mais velha de Thor?', 'Hela', ['Sif', 'Valquíria', 'Gamora']],
    ['k87', 'Quem desafia T\'Challa pelo trono de Wakanda?', 'Erik Killmonger', ['M\'Baku', 'Ulysses Klaue', 'Namor']],
    ['k112', 'Em qual planeta fica a Joia da Alma?', 'Vormir', ['Titã', 'Nidavellir', 'Xandar']],
    ['k120', 'Quem estala os dedos com a manopla pra derrotar Thanos?', 'Tony Stark', ['Thor', 'Hulk', 'Capitão América']],
    ['k120', 'Pra qual ano o time volta pra pegar as Joias em Nova York?', '2012', ['2014', '1970', '2008']],
    ['k20', 'Qual o nome do "gato" (Flerken) de Capitã Marvel?', 'Goose', ['Maverick', 'Chewie', 'Lucky']],
    ['k90', 'Quem é o vilão de Homem-Aranha: De Volta ao Lar?', 'Abutre', ['Mysterio', 'Escorpião', 'Electro']],
    ['k135', 'Quem é o vilão de Homem-Aranha: Longe de Casa?', 'Mysterio', ['Abutre', 'Kraven', 'Duende Verde']],
    ['k136', 'Quantos Homens-Aranha lutam juntos em Sem Volta Para Casa?', '3', ['2', '4', '5']],
    ['k121', 'Qual organização prende Loki na série?', 'AVT (Autoridade de Variância Temporal)', ['S.H.I.E.L.D.', 'S.W.O.R.D.', 'Tropa Nova']],
    ['k128', 'Em que cidade Wanda cria a realidade de WandaVision?', 'Westview', ['Nova Jersey', 'Sokóvia', 'Salem']],
    ['k129', 'Quem fica com o escudo do Capitão América no final?', 'Sam Wilson', ['John Walker', 'Bucky Barnes', 'Isaiah Bradley']],
    ['k130', 'Qual o nome da organização do pai de Shang-Chi?', 'Dez Anéis', ['Mão', 'HYDRA', 'Lótus Negra']],
    ['k131', 'Qual Celestial dá as ordens aos Eternos?', 'Arishem', ['Tiamut', 'Ego', 'Galactus']],
    ['k139', 'Quem é a jovem arqueira que treina com Clint?', 'Kate Bishop', ['Yelena Belova', 'Maya Lopez', 'Kamala Khan']],
    ['k143', 'Qual o deus egípcio ligado ao Cavaleiro da Lua?', 'Khonshu', ['Ammit', 'Anúbis', 'Hórus']],
    ['k143', 'Qual o nome da identidade que trabalha numa loja de museu?', 'Steven Grant', ['Marc Spector', 'Jake Lockley', 'Arthur Harrow']],
    ['k145', 'Qual o nome da Ms. Marvel?', 'Kamala Khan', ['Monica Rambeau', 'Kate Bishop', 'Riri Williams']],
    ['k151', 'Qual o vilão de Guardiões da Galáxia Vol. 3?', 'Alto Evolucionário', ['Ego', 'Ronan', 'Adam Warlock']],
    ['k150', 'Quem é o vilão de Quantumania?', 'Kang, o Conquistador', ['Jaqueta Amarela', 'Fantasma', 'Darren Cross']],
    ['k73', 'Em que bairro de Nova York se passa Demolidor?', 'Hell\'s Kitchen', ['Harlem', 'Queens', 'Brooklyn']],
    ['k74', 'Quem é o vilão da 1ª temporada de Jessica Jones?', 'Kilgrave', ['Wilson Fisk', 'Cottonmouth', 'Madame Gao']],
    ['k60', 'Quem volta dos mortos e lidera a equipe em Agents of S.H.I.E.L.D.?', 'Phil Coulson', ['Nick Fury', 'Maria Hill', 'Grant Ward']],
    ['k85', 'Qual o nome verdadeiro do Deadpool?', 'Wade Wilson', ['Weasel', 'Cable', 'Francis Freeman']],
    ['k140', 'Qual o nome da garota mutante que acompanha Logan?', 'Laura (X-23)', ['Jubileu', 'Vampira', 'Kitty Pryde']],
    ['k13', 'X-Men: Primeira Classe termina durante qual crise histórica?', 'Crise dos Mísseis de Cuba', ['Guerra do Vietnã', 'Queda do Muro de Berlim', 'Chegada à Lua']],
    ['k152', 'Quais três heroínas trocam de lugar quando usam os poderes em As Marvels?', 'Carol, Monica e Kamala', ['Carol, Wanda e Natasha', 'Monica, Kate e Yelena', 'Carol, Valquíria e Kamala']],
    ['k148', 'Como se chama o reino submarino de Namor?', 'Talokan', ['Atlântida', 'Wakanda', 'Lemúria']],
    ['k156', 'Quem vira o Hulk Vermelho em Admirável Mundo Novo?', 'Thaddeus Ross', ['Samuel Sterns', 'Emil Blonsky', 'Bruce Banner']],
    ['k14', 'Qual o nome do devorador de mundos em Primeiros Passos?', 'Galactus', ['Doutor Destino', 'Surfista Prateado', 'Annihilus']],
    ['k109', 'Quem é o protagonista de Homem-Aranha no Aranhaverso?', 'Miles Morales', ['Peter B. Parker', 'Miguel O\'Hara', 'Gwen Stacy']],
    ['k27', 'Quem é o vilão de Homem-Aranha (2002)?', 'Duende Verde', ['Doutor Octopus', 'Venom', 'Homem-Areia']],
    ['k31', 'Quem é o vilão de Homem-Aranha 2?', 'Doutor Octopus', ['Duende Verde', 'Lagarto', 'Electro']]
  ];

  // ---------- conteúdo na ficha do título ----------
  const byKey = key => items.find(i => i.key === key);
  const nameOf = key => { const it = byKey(key); return it ? V40.cleanName(it).split(' — ')[0] : key; };
  V40.contentFor = function (it) {
    if (!it || !it.key) return null;
    let html = '';
    const cr = CREDITS[it.key];
    if (cr) html += `<div class="v40-credits ${cr[0] ? '' : 'none'}">🎞 ${cr[0] ? `<b>${cr[0]} cena${cr[0] > 1 ? 's' : ''} nos créditos</b> — ${cr[1]}` : `<b>Sem cena pós-créditos</b> — ${cr[1]}`}</div>`;
    const before = BEFORE[it.key];
    if (before) {
      html += `<h4>🔗 Bom ter visto antes</h4>${before.map(k => { const b = byKey(k); return b ? `<div class="v40-row">${b.done ? '✅' : '⬜'} <span style="flex:1">${V40.esc(nameOf(k))}</span></div>` : ''; }).join('')}`;
    }
    const after = Object.keys(BEFORE).filter(k => BEFORE[k].includes(it.key));
    if (after.length) html += `<p class="v40-muted" style="margin:6px 0 0;">Importante pra: ${after.map(k => V40.esc(nameOf(k))).join(' · ')}</p>`;
    const vil = V40.VILLAINS.filter(v => v[1] === it.key);
    if (vil.length) html += `<h4>🦹 Vilão</h4>${vil.map(v => `<p class="v40-info-p"><b>${V40.esc(v[0])}</b> — ${V40.esc(v[2])}</p>`).join('')}`;
    return { html };
  };

  // ---------- 📚 tela "Universo" (trilhas, vilões, glossário, quiz) ----------
  V40.openUniverse = function (tab) {
    tab = tab || 'trilhas';
    const tabs = [['trilhas', '🧭 Trilhas'], ['viloes', '🦹 Vilões'], ['glossario', '📖 Glossário'], ['quiz', '🧠 Quiz'], ['creditos', '🎞 Pós-créditos']];
    let body = '';
    if (tab === 'trilhas') {
      body = '<p class="v40-muted">O mínimo pra entender cada personagem (em ordem cronológica da sua lista).</p>' + V40.TRAILS.map(tr => {
        const list = tr.keys.map(byKey).filter(Boolean);
        const done = list.filter(i => i.done).length;
        return `<details class="v40-trail"><summary>${tr.icon} <b>${V40.esc(tr.name)}</b> <span class="v40-muted">${done}/${list.length}</span></summary>
          ${sortItems(list.slice()).map(i => `<div class="v40-row">${i.done ? '✅' : '⬜'} <span style="flex:1">${V40.esc(V40.cleanName(i))}</span></div>`).join('')}</details>`;
      }).join('');
    } else if (tab === 'viloes') {
      body = V40.VILLAINS.map(v => { const it = byKey(v[1]); return `<div class="v40-row"><span style="flex:1"><b>${V40.esc(v[0])}</b> — ${V40.esc(v[2])}<br><small class="v40-muted">${it ? (it.done ? '✅ ' : '') + V40.esc(nameOf(v[1])) : ''}</small></span></div>`; }).join('');
    } else if (tab === 'glossario') {
      body = V40.GLOSSARY.map(g => `<div class="v40-row"><span style="flex:1"><b>${V40.esc(g[0])}</b><br><small>${V40.esc(g[1])}</small></span></div>`).join('');
    } else if (tab === 'creditos') {
      const keys = sortItems(items.filter(i => CREDITS[i.key]));
      body = '<p class="v40-muted">Quantas cenas extras cada filme tem nos créditos.</p>' + keys.map(i => { const c = CREDITS[i.key]; return `<div class="v40-row">${i.done ? '✅' : '⬜'} <span style="flex:1">${V40.esc(V40.cleanName(i).split(' — ')[0])}<br><small class="v40-muted">${c[1]}</small></span><b>${c[0]}</b></div>`; }).join('');
    } else if (tab === 'quiz') {
      const avail = V40.QUIZ.filter(q => { const it = byKey(q[0]); return it && it.done; });
      const best = V40.get('quiz-best', null);
      body = `<p>${avail.length} pergunta${avail.length === 1 ? '' : 's'} disponível(is) — só de títulos que você já viu (sem spoiler do que falta).</p>
        ${best ? `<p class="v40-muted">Seu melhor: <b>${best.score}/${best.total}</b> em ${V40.fmtBR(best.d, true)}</p>` : ''}
        <button class="v40-primary" id="v40QuizStart" ${avail.length < 3 ? 'disabled' : ''}>Começar (até 10 perguntas)</button>`;
    }
    V40.modal(`<h3>📚 Universo Marvel</h3>
      <div class="v40-subtabs small">${tabs.map(([k, l]) => `<button data-uni="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div>${body}</div>`, true);
    document.querySelectorAll('[data-uni]').forEach(b => b.addEventListener('click', () => V40.openUniverse(b.dataset.uni)));
    const qs = document.getElementById('v40QuizStart');
    if (qs) qs.addEventListener('click', startQuiz);
  };

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function startQuiz() {
    const avail = shuffle(V40.QUIZ.filter(q => { const it = byKey(q[0]); return it && it.done; })).slice(0, 10);
    const state = { qs: avail, i: 0, score: 0 };
    const show = () => {
      if (state.i >= state.qs.length) {
        const total = state.qs.length;
        const best = V40.get('quiz-best', null);
        if (!best || state.score / total > best.score / best.total) V40.set('quiz-best', { score: state.score, total, d: V40.today() });
        V40.logEvent('quiz', { v: state.score, n: total });
        if (state.score === total) { V40.confetti(true); V40.sound('trophy'); }
        V40.modal(`<div class="v40-celebrate"><div class="big">${state.score === total ? '🏆' : state.score >= total * 0.7 ? '🎉' : '🧠'}</div><div class="lbl">QUIZ</div><h3>${state.score}/${total} certas</h3>
          <button class="v40-primary" id="v40QuizAgain">Jogar de novo</button></div>`);
        document.getElementById('v40QuizAgain').addEventListener('click', startQuiz);
        return;
      }
      const q = state.qs[state.i];
      const opts = shuffle([q[2]].concat(q[3]));
      V40.modal(`<div class="v40-quiz"><div class="v40-muted">Pergunta ${state.i + 1}/${state.qs.length} · ${V40.esc(nameOf(q[0]))}</div>
        <h3>${V40.esc(q[1])}</h3>${opts.map(o => `<button class="v40-pick" data-ans="${V40.esc(o)}">${V40.esc(o)}</button>`).join('')}<div id="v40QuizFb"></div></div>`);
      document.querySelectorAll('[data-ans]').forEach(b => b.addEventListener('click', () => {
        const ok = b.dataset.ans === q[2];
        if (ok) state.score++;
        document.querySelectorAll('[data-ans]').forEach(x => { x.disabled = true; if (x.dataset.ans === q[2]) x.classList.add('on'); });
        if (!ok) b.classList.add('wrong');
        V40.sound(ok ? 'done' : 'tick');
        document.getElementById('v40QuizFb').innerHTML = `<p>${ok ? '✅ Isso!' : '❌ Era: <b>' + V40.esc(q[2]) + '</b>'}</p><button class="v40-primary" id="v40QuizNext">${state.i + 1 < state.qs.length ? 'Próxima ›' : 'Ver resultado'}</button>`;
        document.getElementById('v40QuizNext').addEventListener('click', () => { state.i++; show(); });
      }));
    };
    show();
  }
})();
