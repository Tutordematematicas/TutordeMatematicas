// ===================== ESTADO DEL JUEGO POR TEMAS =====================
const MIN_TIME = 5;    // segundos mínimos por pregunta
const MAX_TIME = 30;   // segundos máximos por pregunta

let topic = 'sumas';        // 'sumas', 'restas' o 'mult'
let activeView = 'inicio';
let score = 0, streak = 0, progress = 0;
let timeLimit = 20;         // sube si fallan y baja si aciertan
let answer = '';
let locked = false;         // true mientras se muestra el resultado
let level = 0;              // dificultad de la pregunta actual
let totalMs = 0, remainingMs = 0, deadline = 0;
let tick = null, nextTimeout = null;
let lastKey = '';
let lives = 3;              // vidas: al llegar a 0 pierden
let gameOver = false;
let modo = 0;               // velocidad elegida: 0 fácil, 1 medio, 2 difícil
const MODE_TIMES = [20, 12, 7];   // tiempo inicial de cada velocidad
let jugando = false;        // el juego no corre hasta que pulsen "¡Empieza a jugar!"
let usuarioActual = null;   // clave del usuario con sesión (sus pegatinas se guardan aparte)

const fruitIcons = ['🍎', '🍌', '🍓', '🍊', '🍇'];
const SYMBOLS = { sumas: '+', restas: '-', mult: '×' };
const LEVELS = [
    { name: 'Fácil', icon: '🐢', points: 10 },    // lento
    { name: 'Medio', icon: '🐇', points: 15 },    // más rápido
    { name: 'Difícil', icon: '🐆', points: 20 }   // muy rápido
];
// rango de números [mínimo, máximo] según el nivel
const RANGES = {
    sumas: [[1, 9], [5, 20], [10, 60]],
    restas: [[2, 10], [10, 30], [30, 100]],
    mult: [[1, 5], [2, 9], [6, 12]]
};
// ejercicios ya usados en cada tema, para no repetirlos
const used = { sumas: new Set(), restas: new Set(), mult: new Set() };
const plantStages = ['🌰', '🌱', '🌱', '🌿', '🌿', '🌿', '🌾', '🌾', '🌷', '🌻', '🌻'];

const $ = (id) => document.getElementById(id);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);

// ===================== INICIO =====================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.btn-topic').forEach(b => b.addEventListener('click', () => setTopic(b.dataset.topic)));
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
    document.querySelectorAll('.btn-grade').forEach(b => b.addEventListener('click', () => setGrade(Number(b.dataset.grade))));
    $('btn-listen').addEventListener('click', () => hablar(aq.texto));
    $('btn-next').addEventListener('click', nuevaAprende);
    // si cambian de pestaña del navegador, el cronómetro se pausa
    document.addEventListener('visibilitychange', () => document.hidden ? pauseGame() : resumeGame());

    document.querySelectorAll('.btn-mode').forEach(b => b.addEventListener('click', () => setMode(Number(b.dataset.mode))));
    $('btn-volver').addEventListener('click', volverAJugar);
    $('btn-borrar').addEventListener('click', borrarAlbum);

    generateNewQuestion();   // se prepara la pregunta, pero el cronómetro espera al botón de empezar
    setGrade(1);
    dibujarAlbum();
    iniciarLogin();
});

// 1. CAMBIAR DE TEMA
function setTopic(newTopic) {
    if (gameOver) return;
    topic = newTopic;
    document.querySelectorAll('.btn-topic').forEach(b => b.classList.toggle('active', b.dataset.topic === newTopic));
    $('feedback').innerText = '';
    generateNewQuestion();
}

// 2. CAMBIAR DE VISTA
function switchView(viewName) {
    activeView = viewName;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.toggle('active', p.id === `view-${viewName}`));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
    if (viewName === 'retos') dibujarAlbum();
    if (viewName === 'inicio') resumeGame(); else pauseGame();
}

// 3. DIFICULTAD SEGÚN EL TIEMPO: mucho tiempo = fácil, poco tiempo = difícil
function difficulty() {
    if (timeLimit >= 15) return 0;
    if (timeLimit >= 9) return 1;
    return 2;
}

// 4. CREAR UN EJERCICIO QUE NO SE HAYA REPETIDO
function makeQuestion() {
    const [min, max] = RANGES[topic][level];
    for (let i = 0; i < 300; i++) {
        let a = rand(min, max), b = rand(min, max);
        if (topic === 'restas') {
            if (a < b) [a, b] = [b, a];   // así nunca da negativo
            if (a === b) continue;
        }
        // en sumas y multiplicaciones 3+5 es lo mismo que 5+3
        const key = topic === 'restas' ? `${a}-${b}` : `${topic}${Math.min(a, b)}x${Math.max(a, b)}`;
        if (used[topic].has(key) || key === lastKey) continue;
        used[topic].add(key);
        lastKey = key;
        return { a, b };
    }
    // ya se usaron todos los de este nivel: empezamos la lista de nuevo
    used[topic].clear();
    return makeQuestion();
}

function generateNewQuestion() {
    clearTimeout(nextTimeout);
    stopTimer();
    locked = false;
    if (progress >= 10) progress = 0;   // la planta ya floreció, empieza otra

    level = difficulty();
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.toggle('active', Number(b.dataset.mode) === level));
    const { a, b } = makeQuestion();
    const symbol = SYMBOLS[topic];
    answer = String(topic === 'sumas' ? a + b : topic === 'restas' ? a - b : a * b);

    $('question-text').innerText = `¿Cuánto es ${a} ${symbol} ${b}?`;
    $('operator-display').innerText = symbol;
    $('level-badge').innerText = `${LEVELS[level].icon} ${LEVELS[level].name}`;
    renderFruits(a, b);
    renderOptions(Number(answer));

    totalMs = remainingMs = timeLimit * 1000;
    updateStats();
    updateTimer();
    resumeGame();
}

// 5. FRUTAS (si el número es muy grande se muestra una canasta)
function renderFruits(a, b) {
    const fruit = fruitIcons[rand(0, fruitIcons.length - 1)];
    $('fruit-group-1').innerText = a <= 10 ? fruit.repeat(a) : `🧺 ${a}`;
    $('fruit-group-2').innerText = b <= 10 ? fruit.repeat(b) : `🧺 ${b}`;
}

// 6. OPCIONES DE RESPUESTA
function renderOptions(correct) {
    // errores típicos: uno arriba, uno abajo, de a dos, o de a diez
    const offsets = shuffle([-10, -3, -2, -1, 1, 2, 3, 10]);
    const options = [correct];
    for (const o of offsets) {
        const wrong = correct + o;
        if (wrong >= 0 && !options.includes(wrong) && options.length < 4) options.push(wrong);
    }
    crearOpciones($('options-container'), shuffle(options).map(String), checkAnswer);
}

// crea los botones de respuesta (se usa en Inicio y en Aprende)
function crearOpciones(contenedor, opciones, alClick) {
    contenedor.innerHTML = '';
    opciones.forEach(texto => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = texto;
        btn.addEventListener('click', () => alClick(texto, btn));
        contenedor.appendChild(btn);
    });
}

// pinta en verde la correcta y en rojo la elegida si estaba mal
function marcarOpciones(contenedor, correcta, elegido) {
    contenedor.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        if (btn.innerText === correcta) btn.classList.add('correct');
        else if (btn === elegido) btn.classList.add('wrong');
    });
}

// 7. CRONÓMETRO
function startTick() {
    deadline = Date.now() + remainingMs;
    tick = setInterval(updateTimer, 100);
}
function stopTimer() {
    clearInterval(tick);
    tick = null;
}
function pauseGame() {
    if (!tick) return;
    updateTimer();
    stopTimer();
}
function resumeGame() {
    if (tick || locked || !jugando || activeView !== 'inicio' || document.hidden) return;
    startTick();
}
function updateTimer() {
    if (tick) remainingMs = Math.max(0, deadline - Date.now());
    const ratio = remainingMs / totalMs;
    const fill = $('timer-fill');
    fill.style.width = `${ratio * 100}%`;
    fill.style.background = `hsl(${ratio * 110}, 55%, 45%)`;   // verde -> rojo
    $('timer-text').innerText = `${Math.ceil(remainingMs / 1000)} s`;
    if (tick && remainingMs <= 0) checkAnswer(null);   // se acabó el tiempo
}

// 8. REVISAR LA RESPUESTA (null = se acabó el tiempo)
function checkAnswer(selected, btn) {
    if (locked) return;
    locked = true;
    stopTimer();

    const before = timeLimit;
    let message;
    if (selected === answer) {
        const points = LEVELS[level].points;
        score += points;
        streak++;
        progress = Math.min(progress + 1, 10);
        contarAcierto();
        timeLimit = Math.max(MIN_TIME, timeLimit - 2);    // acierta: menos tiempo
        message = `✅ ¡Correcto! +${points} puntos.`;
        message += timeLimit < before ? ` Tiempo −${before - timeLimit} s` : ' Ya estás en el tiempo mínimo';
    } else {
        streak = 0;
        lives = Math.max(0, lives - 1);
        timeLimit = Math.min(MAX_TIME, timeLimit + 3);    // falla: más tiempo
        message = selected === null ? '⏰ ¡Se acabó el tiempo!' : '❌ ¡Ups!';
        message += ` Era ${answer}.`;
        if (timeLimit > before) message += ` Tiempo +${timeLimit - before} s`;
    }

    const bloomed = progress === 10 && selected === answer;
    if (bloomed) {
        message += ' 🎉 ¡Tu planta floreció!';
        sumarStat('flores');
    }

    const perdio = lives <= 0;
    if (perdio) {
        gameOver = true;
        message += ' 💔 ¡Se acabaron tus vidas!';
    }
    marcarOpciones($('options-container'), answer, btn);
    $('feedback').innerText = message;
    updateStats();
    nextTimeout = setTimeout(perdio ? mostrarPerdiste : generateNewQuestion, perdio ? 2000 : bloomed ? 2500 : 1600);
}

function updateStats() {
    $('score-display').innerText = score;
    $('streak-display').innerText = `🔥 ${streak}`;
    $('limit-display').innerText = `${timeLimit} s`;
    $('lives-display').innerText = '❤️'.repeat(lives) + '🖤'.repeat(3 - lives);
    $('progress-fill').style.width = `${progress * 10}%`;
    $('progress-text').innerText = `${progress}/10`;
    $('plant').innerText = plantStages[progress];
}

// ===================== APRENDE (1° A 5° DE PRIMARIA) =====================
let grado = 1, aq = null, aBloqueado = false, aAciertos = 0, aIntentos = 0, aTimeout = null;
const usadas = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() };
const EMOJIS = ['🐞', '🐟', '🌼', '⭐', '🍎'];

// arma una pregunta: mezcla la correcta con hasta 3 falsas distintas
function armar(texto, correcta, falsas, pista, visual = '') {
    const c = String(correcta);
    const otras = [...new Set(falsas.map(String))].filter(f => f !== c && !f.startsWith('-')).slice(0, 3);
    return { texto, visual, opciones: shuffle([c, ...otras]), correcta: c, pista };
}

const GRADOS = {
    1: { tema: 'Contar, comparar y los números hasta 20.', gens: [
        () => { const n = rand(3, 12);
            return armar('¿Cuántos hay?', n, [n + 1, n - 1, n + 2, n - 2], 'Cuenta uno por uno con tu dedo 👆', EMOJIS[rand(0, 4)].repeat(n)); },
        () => { const a = rand(1, 20); let b = rand(1, 20); if (b === a) b = a % 20 + 1;
            return armar(`¿Cuál número es mayor: ${a} o ${b}?`, Math.max(a, b), [Math.min(a, b)], 'El mayor es el que llegas más tarde al contar.'); },
        () => { const n = rand(2, 19);
            return Math.random() < 0.5
                ? armar(`¿Qué número va después del ${n}?`, n + 1, [n - 1, n + 2, n], 'Después es el que sigue al contar hacia adelante.')
                : armar(`¿Qué número va antes del ${n}?`, n - 1, [n + 1, n - 2, n + 2], 'Antes es el que sale al contar hacia atrás.'); }
    ]},
    2: { tema: 'Decenas y unidades, pares e impares, sumas con dos cifras.', gens: [
        () => { const n = rand(11, 99), t = Math.floor(n / 10), u = n % 10;
            return Math.random() < 0.5
                ? armar(`En el número ${n}, ¿cuántas decenas hay?`, t, [u, t + 1, t - 1, t + 2], 'Las decenas son el primer dígito. Cada una vale 10.')
                : armar(`En el número ${n}, ¿cuántas unidades hay?`, u, [t, u + 1, u - 1, u + 2], 'Las unidades son el último dígito.'); },
        () => { const n = rand(1, 99);
            return armar(`¿El número ${n} es par o impar?`, n % 2 === 0 ? 'Par' : 'Impar', [n % 2 === 0 ? 'Impar' : 'Par'], 'Los pares terminan en 0, 2, 4, 6 u 8.'); },
        () => { const a = rand(11, 49), b = rand(11, 49), s = a + b;
            return armar(`¿Cuánto es ${a} + ${b}?`, s, [s + 1, s - 1, s + 10, s - 10], 'Suma primero las unidades y luego las decenas.'); }
    ]},
    3: { tema: 'Tablas de multiplicar, división y redondeo.', gens: [
        () => { const a = rand(2, 10), b = rand(2, 10);
            return armar(`¿Cuánto es ${a} × ${b}?`, a * b, [a * (b + 1), a * (b - 1), (a + 1) * b], `Piensa en ${a} grupos de ${b}.`); },
        () => { const b = rand(2, 9), q = rand(2, 10);
            return armar(`¿Cuánto es ${b * q} ÷ ${b}?`, q, [q + 1, q - 1, q + 2], `Busca qué número por ${b} da ${b * q}.`); },
        () => { let n = rand(11, 98); if (n % 10 === 0) n++;
            const c = Math.round(n / 10) * 10;
            return armar(`Redondea ${n} a la decena más cercana.`, c, [Math.floor(n / 10) * 10, Math.ceil(n / 10) * 10, c + 10, c - 10], 'Mira las unidades: de 5 en adelante se sube, menos de 5 se baja.'); }
    ]},
    4: { tema: 'Multiplicar por una cifra, fracciones y perímetro.', gens: [
        () => { const a = rand(12, 49), b = rand(2, 9), p = a * b;
            return armar(`¿Cuánto es ${a} × ${b}?`, p, [p + 10, p - 10, p + b], 'Multiplica las unidades y luego las decenas, y suma.'); },
        () => { const d = [3, 4, 5, 6, 8][rand(0, 4)], k = rand(1, d - 1);
            const pizza = `<div class="pizza" style="--p:${k / d * 360}deg;--n:${360 / d}deg"></div>`;
            return armar('¿Qué fracción de la pizza está pintada?', `${k}/${d}`, [`${d - k}/${d}`, `${k}/${d + 1}`, `${k + 1}/${d}`, `${d}/${k}`], 'Arriba va lo pintado y abajo el total de partes.', pizza); },
        () => { const l = rand(4, 15), a = rand(2, l - 1);
            return armar(`Un rectángulo mide ${l} cm de largo y ${a} cm de ancho. ¿Cuánto mide su perímetro?`, 2 * (l + a), [l * a, l + a, 2 * l + a], 'El perímetro es sumar todos los lados: 2 largos y 2 anchos.'); }
    ]},
    5: { tema: 'Fracciones, porcentajes y números decimales.', gens: [
        () => { const d = rand(4, 12), a = rand(1, d - 3), b = rand(1, d - 1 - a);
            return armar(`¿Cuánto es ${a}/${d} + ${b}/${d}?`, `${a + b}/${d}`, [`${a + b}/${d * 2}`, `${a + b + 1}/${d}`, `${a + b - 1}/${d}`], 'Si el denominador es igual, solo se suman los de arriba.'); },
        () => { const p = [10, 20, 25, 50][rand(0, 3)], n = 20 * rand(1, 15), c = n * p / 100;
            return armar(`¿Cuánto es el ${p}% de ${n}?`, c, [c * 2, n - c, c + 10, c + 5], `${p}% significa ${p} de cada 100.`); },
        () => { const a = rand(1, 9), b = rand(1, 9), s = a + b;
            return armar(`¿Cuánto es 0.${a} + 0.${b}?`, (s / 10).toFixed(1), [(s / 10 + 0.1).toFixed(1), (s / 10 - 0.1).toFixed(1), (s / 100).toFixed(2)], `${a} décimos + ${b} décimos = ${s} décimos.`); }
    ]}
};

function setGrade(g) {
    grado = g;
    document.querySelectorAll('.btn-grade').forEach(b => b.classList.toggle('active', Number(b.dataset.grade) === g));
    $('grade-info').innerText = GRADOS[g].tema;
    aAciertos = 0;
    aIntentos = 0;
    nuevaAprende();
}

function nuevaAprende() {
    clearTimeout(aTimeout);
    aBloqueado = false;
    const gens = GRADOS[grado].gens;
    aq = null;
    for (let i = 0; i < 60 && !aq; i++) {
        const q = gens[rand(0, gens.length - 1)]();
        const key = q.texto + q.visual;
        if (!usadas[grado].has(key)) { usadas[grado].add(key); aq = q; }
    }
    if (!aq) {   // se acabaron los ejercicios nuevos: reiniciamos la lista
        usadas[grado].clear();
        aq = gens[0]();
    }
    $('aprende-question').innerText = aq.texto;
    $('aprende-visual').innerHTML = aq.visual;
    $('aprende-feedback').innerText = '';
    $('btn-next').hidden = true;
    $('aprende-hits').innerText = `${aAciertos} de ${aIntentos}`;
    crearOpciones($('aprende-options'), aq.opciones, responderAprende);
}

function responderAprende(valor, btn) {
    if (aBloqueado) return;
    aBloqueado = true;
    aIntentos++;
    marcarOpciones($('aprende-options'), aq.correcta, btn);

    if (valor === aq.correcta) {
        aAciertos++;
        sumarStat('aprende');
        $('aprende-feedback').innerText = '🌟 ¡Muy bien!';
        aTimeout = setTimeout(nuevaAprende, 1300);
    } else {
        // si fallan, leen la pista con calma y pasan cuando quieran
        $('aprende-feedback').innerText = `💡 La respuesta era ${aq.correcta}. ${aq.pista}`;
        $('btn-next').hidden = false;
    }
    $('aprende-hits').innerText = `${aAciertos} de ${aIntentos}`;
}

// lee la pregunta en voz alta (ayuda a los más pequeños que aún leen poco)
function hablar(texto) {
    if (!('speechSynthesis' in window)) return;
    const limpio = texto.replace('÷', ' dividido entre ').replace('×', ' por ').replace('+', ' más ');
    const voz = new SpeechSynthesisUtterance(limpio);
    voz.lang = 'es-CO';
    voz.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(voz);
}

// ===================== VELOCIDAD, PERDER Y VOLVER =====================
// el estudiante elige la velocidad; después el tiempo sigue subiendo o bajando solo
function setMode(m) {
    if (gameOver) return;
    modo = m;
    timeLimit = MODE_TIMES[m];
    $('feedback').innerText = '';
    generateNewQuestion();
}

function mostrarPerdiste() {
    stopTimer();
    $('final-score').innerText = score;
    $('gameover').hidden = false;
}

function volverAJugar() {
    gameOver = false;
    $('gameover').hidden = true;
    score = 0;
    streak = 0;
    progress = 0;
    lives = 3;
    timeLimit = MODE_TIMES[modo];
    $('feedback').innerText = '';
    generateNewQuestion();
}

// ===================== RETOS Y PEGATINAS =====================
// cada reto mira un contador (clave) y da una pegatina al llegar a la meta
const RETOS = [
    { id: 'primeros', icono: '🌟', nombre: 'Primeros pasos', texto: 'Acierta 5 preguntas', meta: 5, clave: 'total' },
    { id: 'sumas', icono: '➕', nombre: 'Rey de las sumas', texto: 'Acierta 10 sumas', meta: 10, clave: 'sumas' },
    { id: 'restas', icono: '➖', nombre: 'Maestro de restas', texto: 'Acierta 10 restas', meta: 10, clave: 'restas' },
    { id: 'mult', icono: '✖️', nombre: 'Multiplicador', texto: 'Acierta 10 multiplicaciones', meta: 10, clave: 'mult' },
    { id: 'racha', icono: '🔥', nombre: 'Racha de fuego', texto: '5 aciertos seguidos', meta: 5, clave: 'racha' },
    { id: 'veloz', icono: '🐆', nombre: 'Súper veloz', texto: 'Acierta 5 en nivel Difícil', meta: 5, clave: 'dificil' },
    { id: 'flor', icono: '🌻', nombre: 'Jardinero', texto: 'Haz florecer tu planta', meta: 1, clave: 'flores' },
    { id: 'aprende', icono: '📚', nombre: 'Estudiante estrella', texto: 'Acierta 10 en Aprende', meta: 10, clave: 'aprende' },
    { id: 'imparable', icono: '🏆', nombre: 'Imparable', texto: '10 aciertos seguidos', meta: 10, clave: 'racha' }
];

function statsBase() {
    return { total: 0, sumas: 0, restas: 0, mult: 0, racha: 0, dificil: 0, flores: 0, aprende: 0, pegadas: [] };
}
function cargarStats() {
    if (!usuarioActual) return statsBase();
    try {
        return Object.assign(statsBase(), JSON.parse(localStorage.getItem('tutorStats_' + usuarioActual) || '{}'));
    } catch (e) {
        return statsBase();   // si el navegador no deja guardar, jugamos sin guardar
    }
}
function guardarStats() {
    if (!usuarioActual) return;
    try { localStorage.setItem('tutorStats_' + usuarioActual, JSON.stringify(stats)); } catch (e) { /* sin guardado */ }
}
let stats = cargarStats();

function contarAcierto() {
    stats.total++;
    stats[topic]++;
    if (level === 2) stats.dificil++;
    if (streak > stats.racha) stats.racha = streak;
    revisarPegatinas();
}
function sumarStat(clave) {
    stats[clave]++;
    revisarPegatinas();
}

// busca retos cumplidos que todavía no tengan pegatina
function revisarPegatinas() {
    RETOS.forEach(r => {
        if (stats[r.clave] >= r.meta && !stats.pegadas.includes(r.id)) {
            stats.pegadas.push(r.id);
            avisar(`🎉 ¡Nueva pegatina: ${r.icono} ${r.nombre}!`);
        }
    });
    guardarStats();
    dibujarAlbum();
}

function dibujarAlbum() {
    const album = $('album');
    if (!album) return;
    album.innerHTML = '';
    RETOS.forEach(r => {
        const valor = Math.min(stats[r.clave], r.meta);
        const ganada = stats.pegadas.includes(r.id);
        const tarjeta = document.createElement('div');
        tarjeta.className = 'pegatina' + (ganada ? ' ganada' : '');
        tarjeta.innerHTML = `<div class="pegatina-icono">${r.icono}</div><strong>${r.nombre}</strong>` +
            `<small>${r.texto}</small><div class="mini-bar"><div style="width:${valor / r.meta * 100}%"></div></div>` +
            `<span>${ganada ? '¡Pegada! ✅' : `${valor}/${r.meta}`}</span>`;
        album.appendChild(tarjeta);
    });
    $('album-count').innerText = `${stats.pegadas.length} de ${RETOS.length}`;
}

function borrarAlbum() {
    if (!confirm('¿Seguro que quieres borrar todas tus pegatinas?')) return;
    stats = statsBase();
    guardarStats();
    dibujarAlbum();
}

let toastTimeout = null;
function avisar(texto) {
    const toast = $('toast');
    toast.innerText = texto;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===================== INICIO DE SESIÓN =====================
// Las cuentas se guardan en este navegador (localStorage). Sirve para separar el progreso de cada niño,
// pero no es seguridad real: para eso se necesita un servidor.
let tlModo = 'in';          // 'in' = entrar, 'up' = crear cuenta
let tlTimers = [];
let nombreActual = '';

const almacen = {
    leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    borrar(k) { try { localStorage.removeItem(k); } catch (e) { /* sin guardado */ } }
};

// la contraseña nunca se guarda en claro
async function hashClave(texto) {
    if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
    return 'f' + h;
}

// el búho habla y reacciona
function buho(msg, anim) {
    $('tl-bubble').innerText = msg;
    const o = $('tl-owl');
    o.classList.remove('hop', 'shake');
    void o.offsetWidth;
    if (anim) o.classList.add(anim);
}

function setLoginModo(m) {
    tlModo = m;
    $('tl-tab-in').setAttribute('aria-selected', m === 'in');
    $('tl-tab-up').setAttribute('aria-selected', m === 'up');
    $('tl-submit').innerText = m === 'in' ? '¡Entrar!' : '¡Crear mi cuenta!';
    $('tl-pass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    $('tl-err').innerText = '';
    buho(m === 'in' ? '¡Hola! Dime quién eres.' : '¡Vamos a crear tu cuenta nueva!', 'hop');
}

function errorLogin(msg) {
    $('tl-err').innerText = msg;
    buho('¡Ups!', 'shake');
}

function iniciarLogin() {
    document.querySelector('.app-container').inert = true;   // el juego queda bloqueado detrás del login
    $('tl-tab-in').addEventListener('click', () => setLoginModo('in'));
    $('tl-tab-up').addEventListener('click', () => setLoginModo('up'));
    $('tl-user').addEventListener('focus', () => buho(tlModo === 'in' ? '¿Cómo te llamas?' : 'Elige un nombre que te guste.'));
    $('tl-pass').addEventListener('focus', () => buho('Shhh… nadie mira tu secreto 🤫'));
    $('tl-eye').addEventListener('click', () => {
        const p = $('tl-pass'), ver = p.type === 'password';
        p.type = ver ? 'text' : 'password';
        $('tl-eye').innerText = ver ? '🙈' : '👁️';
        $('tl-eye').setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    $('tl-form').addEventListener('submit', enviarLogin);
    $('tl-switch').addEventListener('click', salir);
    $('btn-salir').addEventListener('click', salir);

    const sesion = almacen.leer('tutor_sesion');
    if (sesion && sesion.name) mostrarEspera(sesion.name);
    else $('tl-user').focus();
}

async function enviarLogin(e) {
    e.preventDefault();
    let nombre = $('tl-user').value.trim();
    const clave = $('tl-pass').value, key = nombre.toLowerCase();
    $('tl-err').innerText = '';
    if (!/^[a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]{3,15}$/.test(nombre)) return errorLogin('El usuario necesita de 3 a 15 letras o números, sin espacios.');
    if (clave.length < 4) return errorLogin('La contraseña necesita al menos 4 caracteres.');

    const usuarios = almacen.leer('tutor_usuarios') || {};
    const h = await hashClave(`${key}:${clave}:tutor`);
    if (tlModo === 'in') {
        if (!usuarios[key]) return errorLogin('No encuentro ese usuario. ¿Quieres crear tu cuenta?');
        if (usuarios[key].h !== h) return errorLogin('Esa contraseña no es. ¡Inténtalo otra vez!');
        nombre = usuarios[key].name;
    } else {
        if (usuarios[key]) return errorLogin('Ese nombre ya existe. Elige otro o toca "Entrar".');
        usuarios[key] = { name: nombre, h };
        if (!almacen.guardar('tutor_usuarios', usuarios)) return errorLogin('Tu navegador no deja guardar la cuenta. Prueba sin modo privado.');
    }
    almacen.guardar('tutor_sesion', { name: nombre });
    mostrarEspera(nombre);
}

// pantalla de espera: la planta crece mientras se "prepara" el juego
function mostrarEspera(nombre) {
    tlTimers.forEach(clearTimeout);
    tlTimers = [];
    $('tl-login').hidden = true;
    $('tl-wait').hidden = false;
    $('tl-hello').innerText = nombre;
    $('tl-go').hidden = true;
    const pasos = [
        [0, '🌰', 'Despertando al búho…'],
        [35, '🌱', 'Regando tu planta…'],
        [70, '🌿', 'Afilando los lápices…'],
        [100, '🌻', '¡Todo listo para jugar!']
    ];
    pasos.forEach((p, i) => {
        tlTimers.push(setTimeout(() => {
            $('tl-fill').style.width = `${p[0]}%`;
            $('tl-pb').setAttribute('aria-valuenow', p[0]);
            $('tl-plant').innerText = p[1];
            $('tl-step').innerText = p[2];
        }, i * 900 + (i === 0 ? 50 : 0)));
    });
    tlTimers.push(setTimeout(() => {
        $('tl-go').hidden = false;
        $('tl-go').focus();
    }, pasos.length * 900 + 400));
    $('tl-go').onclick = () => empezarJuego(nombre);
}

// aquí arranca el juego de verdad
function empezarJuego(nombre) {
    nombreActual = nombre;
    usuarioActual = nombre.toLowerCase();
    stats = cargarStats();
    $('user-name').innerText = `👤 ${nombre}`;
    gameOver = false;
    $('gameover').hidden = true;
    score = 0; streak = 0; progress = 0; lives = 3;
    timeLimit = MODE_TIMES[modo];
    $('feedback').innerText = '';
    switchView('inicio');
    jugando = true;
    generateNewQuestion();   // aquí empieza a correr el cronómetro
    dibujarAlbum();

    const root = $('tl-root');
    document.querySelector('.app-container').inert = false;
    root.classList.add('out');
    setTimeout(() => { root.hidden = true; }, 500);
}

// cerrar sesión: el juego se detiene y vuelve el ingreso
function salir() {
    tlTimers.forEach(clearTimeout);
    tlTimers = [];
    jugando = false;
    stopTimer();
    clearTimeout(nextTimeout);
    usuarioActual = null;
    stats = statsBase();
    almacen.borrar('tutor_sesion');

    const root = $('tl-root');
    root.hidden = false;
    void root.offsetWidth;
    root.classList.remove('out');
    document.querySelector('.app-container').inert = true;
    $('tl-wait').hidden = true;
    $('tl-login').hidden = false;
    $('tl-form').reset();
    setLoginModo('in');
    $('tl-user').focus();
}
