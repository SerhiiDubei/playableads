# Build Log — Pipeline v1

Хронологічний журнал. **HARD-правило (CLAUDE.md): після КОЖНОГО стейджу/фази — запис сюди.**
Формат запису: дата · що зроблено · що перевірено (тести/команди) · що відкрито · чекпойнт.

---

## 2026-06-02 — Планування (до коду)
**Зроблено:**
- Розшифровано voice-сесію відповідей на brief-quest (50 питань) → [brief-decisions.md](brief-decisions.md) (✅37/🟨6/🔴7) + [decisions.html](decisions.html).
- [architecture.md](architecture.md) — pipeline з вшитими рішеннями + статус коду.
- [ROADMAP.md](../ROADMAP.md) — v1 product backlog (епіки B…Z).
- Звірено по реальному коду → [implementation-plan.md](implementation-plan.md): знайдено зламаний envelope Phase1↔2 (manifest ігнориться, хардкод ICONS/KNIGHT_SRC/FONT), ~3 викличні одиниці замість 6, немає runId/стейту.
- Цей девелоперський план → [build-plan.md](build-plan.md) (фази 0-5, AC, тести, 6 human-checkpoints) + [backlog.md](backlog.md).
- HTML-версії доків (md-to-html.ts).

**Перевірено:** усі HTML рендеряться (Playwright, 0 помилок); brief-decisions лічильник 37/6/7 звірено з даними.

**Відкрито:** Q12 (механіки), Q36 (правила зон), Q42/Q43 (visual-regression/critic — пояснити), Q47-49.

**Чекпойнт:** очікую підтвердження фаз/обсягу build-plan → далі спека (`docs/superpowers/specs/`) → рев'ю → код.

---

<!-- Наступні записи додавай зверху-вниз, по одному на фазу:
## YYYY-MM-DD — Phase N: <назва>
**Зроблено:** …
**Перевірено:** typecheck / test / visual / golden — результати
**AC:** які AC закрито
**Відкрито/борг:** …
**Чекпойнт:** статус (passed/awaiting)
-->

---

## 2026-06-09 — Dream Floor D0–D1: greybox 3/4 flooring playable (новий entry)

**Контекст:** користувач дав референси (`references/Home improvement/ref1–3.png`) + режисуру. Старий
`labs/fix-the-floor` — той самий концепт, але **top-down flat-illustration**, не збігається з 3/4-кадром
референсів. Рішення (4 питання до користувача): 3/4 камера · greybox-first · новий entry з нуля · портрет 9:16.

**Зроблено:**
- **D0 скафолд** — `labs/dream-floor/{manifest.json(params), PLAN.md, README.md, assets/.gitkeep}`,
  `styles/dream-floor.json`, `src/assetgen/build-dream-floor.ts` (клон build-fix-the-floor — bundleTemplate
  → buildHtml → validate → `test/dream-floor/index.html`), npm `dream-floor`, `.claude/launch.json` (root+проєкт, порт 5063).
- **D1 greybox** — `labs/dream-floor/game.ts` (Pixi v8 + GSAP, дизайн-канва 540×960 contain):
  3/4 кімната (стіна+вікно+сонячний промінь, перспективна підлога-трапеція, диван-обʼєм, килим, рослина,
  лампа, рамки), повний FSM intro→couch→carpet→crowbar→plank→finish→reveal→end, toolbar (3 інструменти з ✓),
  hint+progress, idle-нудж+auto-demo (off під ?dbg), reveal (диван повертається+тепле світло), endcard
  (FLOORco+«Design your dream floor.»+before/after+CTA «Shop Real Flooring»+Replay), клікабельний бренд-кут.
- **Boot-hardening** (щоб не повторити баг fix-the-floor): `preloadTextures` через `img.onload/onerror`
  (НЕ `img.decode()`), `main().catch`, `?dbg`-хук `window.__ftf` (state/step/reset/end/cta/shot через `renderer.extract`).
- **QA-харнес** `tools/qa-dream-floor.mjs` (Playwright): жене FSM по всіх бітах і знімає кадри.

**Перевірено:**
- `npm run typecheck` — без помилок у dream-floor; `npm run dream-floor` — `validation: OK`, index.html **601.7 KB** (29.4% від 2MB), assets 0 KB (процедурно).
- QA (Playwright headless, `node tools/qa-dream-floor.mjs`): стани проходять **intro→couch→carpet→crowbar→plank→finish→reveal→end** коректно, **no page errors**, CTA `onCTAClick` спрацьовує. 9 кадрів у `test/dream-floor/qa/` — композиція faithful (3/4 кімната, прогнила→нова підлога, endcard).
- **Headless-нюанси (задокументовано в коді):** (1) `preview_screenshot` таймаутить — headless паузить rAF; беремо кадри через `renderer.extract`. (2) SwiftShader повертає null з `getShaderInfoLog` → Pixi v8 падав на `.split` → QA-харнес патчить null→"" через initScript. (3) MSAA-resolve шейдер не ініціюється в headless і дропає батчі → `antialias` вимкнено **тільки під `?dbg`** (реальний ad лишає AA). (4) headed-launch заблоковано пісочницею (`spawn UNKNOWN`) — лишаємось headless.

- **D1 перспективний прохід** (за зауваженням користувача — звірка перспективи на всіх обʼєктах/стадіях):
  (1) робоча зона підлоги (гнила/нова) тепер **трапеція в перспективі підлоги** — дошки сходяться вглиб
  (квади з `plankGeo`), шви стискаються до заду; (2) відсунутий диван **стоїть на підлозі** (не наїжджає на
  стіну) + контактна тінь рухається/масштабується з ним; (3) килим — сильніша конвергенція (під підлогу).
- **D1 кімната-коробка** (за зауваженням користувача — порожнечі по боках + дивне співвідношення стіни/підлоги):
  додано **бічні стіни** (одноточкова перспектива) — заповнюють клини між підлогою і краями екрана, тож немає
  «вирізаного у void» місця; видима задня стіна звужена рівно до ширини підлоги (співвідношення коректне).
  Кутові шви + бордюри по бічних стінах; лампа переставлена в задній правий кут.
- **D1 композиційний прохід** (3 зауваження користувача): (1) перекомпоновано задню стіну — вікно праворуч із
  відступом від кута, акуратна галерея з 3 рамок ліворуч; прогрес-бар прибрано зі стіни в чистий пілл угорі під
  гінтом (більше не перетинає арт); (2) бічні стіни оживлено — **фейковий дверний проєм** у теплу сусідню кімнату
  на лівій бічній стіні (перспективний квад) + галерея на задній стіні (не перевантажуючи); (3) **збільшено зону
  реновації** (PB_Y/PF_Y/HW) — тепер це повноцінна секція підлоги, а не «люк у підвал»; килим і відсунутий диван
  підігнані під новий розмір. Re-QA: усі стани, no page errors, `validation: OK` (602.9 KB).
- **D1 рослина** (зауваження користувача — старий вазон «плавав» на стіні, дрібний): замінено на **високу
  пальмоподібну рослину, що стоїть на підлозі** в задньому лівому кутку — тарований горщик з еліптичним вершком
  + контактна тінь на підлозі, стовбур з кільцями, віяло фрондів (ромб-блейди, back→front). Нижню рамку галереї
  прибрано, щоб дати пальмі простір. Re-QA OK, `validation: OK` (603.6 KB).
- **D1 прохідна кімната** (3 зауваження): (1) пальму ще глибше в кут (px 102→74, фронди підрізані вліво/вгору),
  щоб не блокувала центр; (2) **двері → велика картина-пейзаж** на задній стіні (ті ж габарити); (3) **бічні
  стіни замінено на відкриті «портальні» проходи**: суцільні стіни прибрано, кожен бік — доорлес-отвір у тепло-
  тоновий простір `BEYOND` (стіна+підлога), що ще й **заповнює letterbox-gutter-зони** (фон рендера = beyond-тон) →
  кадр більше не «вирізаний у void». Одвірки-jamb з підсвіченим краєм + far-light смуга вглибині отвору.
  `validation: OK` (~604 KB). Стани/CTA — OK.
- **QA-харнес (інфра):** (a) `shot()` тепер екстрактить ФІКСОВАНУ design-область (`extract … {target: root,
  frame}`), бо широкі beyond-прямокутники роздували stage-bounds → SwiftShader не міг виділити шейдер для
  величезної render-текстури (порожній кадр). (b) Харнес тепер ЗАВЖДИ закриває браузер (`finally`) — раніше
  падіння лишали zombie-chromium (накопичились 24 шт.), що деградувало GPU й давало чорні/порожні кадри.
  **Відомий ліміт:** headless-SwiftShader усе одно інтермітентно не ініціалізує шейдер → порожній extract; у
  реальному браузері (localhost:5063, GPU) рендериться стабільно.

**AC:** D0, D1 закрито (build OK, усі біти грабельні, no-fail, QA faithful, перспектива консистентна).

**Відкрито/борг:** прогрес-бар візуально близько до рамок — косметика. AI-арт (D2) ще не робили.

**Чекпойнт:** ✅ CHECKPOINT 1 пройдено (human). Далі — D2.

---

## 2026-06-09 — Dream Floor D2: AI-арт (ціла кімната) + інтеграція

**Зроблено:**
- **Бриф** `styles/dream-floor.brief.json` (v1.0.0): напівреалістичний 3/4, anchor House Flipper/Design Home.
  9 ассетів: `room-bg` (ціла кімната, порожній центр підлоги, прохідні арки) + `couch`, `carpet`, `floor-rotten`,
  `floor-new`, `tool-crowbar`, `tool-plank`, `tool-finish`, `logo`. Per-asset overrides (transparent/perspective/size).
- **Генерація** `gen-only`: 9/9 OK, **$0.52**, 0 помилок. couch/tools/logo з alpha (ct=6), bg/floor/carpet без (ct=2).
  Сирі PNG → `out/dream-floor/` (+ report.html).
- **webp** `optimize-template-assets` (trim→resize→webp) → `labs/dream-floor/assets/` — разом **422 KB** (бюджет 1.43 MB).
- **Інтеграція** `game.ts`: `room-bg` підмінює всю процедурну кімнату (Sprite, fit-width, beyond-смуги зверху/знизу);
  **PerspectiveMesh** мапить `carpet` на трапецію килима і `floor-rotten`/`floor-new` на квади дошок (перспектива
  збережена, анімації лишились); couch/tools/logo через наявний `spriteOr`/`tex`.

**Перевірено:** typecheck чистий; `npm run dream-floor` → `validation: OK`, `index.html` **1178.9 KB** (57.6% від 2 MB).
QA-прогін: усі стани `intro→…→end` проходять, **no page errors**, CTA працює, кадр непорожній (rgb 178).

**Відкрито/борг:**
- **Не зміг перевірити візуально** — сесія вперлась у ліміт зображень у чаті (і показ, і вхідні скріншоти
  відхиляються). Потрібна людська перевірка вигляду (localhost:5063 / report.html) — імовірно треба підігнати
  позиції rug/couch/patch під перспективу AI-фону (зараз координати з процедурної версії).
- Анімація дошок тепер на цілих текстурних квадах (не per-plank-greybox); «снеп» лишився через scale.y контейнера.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (оцінити арт + вирівнювання).

---

## 2026-06-09 — Dream Floor CP2-fix: вирівнювання AI-арту під перспективу (human review)

**Контекст:** людський огляд D2 на localhost:5063. Верифікація — через GPU-браузер (`preview_start` →
порт 5070, бо headless-SwiftShader інтермітентно не ініціалізує шейдер → порожній extract).

**Зроблено (за фідбеком, по пунктах):**
- **🐛 room-bg не вантажився** (корінь «не всі об'єкти AI»): код шукав `tex("room-bg")`, а білдер кладе ключ
  із розширенням — `"room-bg.webp"` (`inliner.ts` бере повне ім'я файлу). Лукап→null→малювалась **уся
  процедурна greybox-кімната**. Фікс — один ключ. Тепер видно весь AI-задник.
- **🟫 Килим «вирізаний з пейнту»**: `carpet.webp` був `alpha:false` (ружок на кремовому фоні) → фон ставав
  білою рамкою на трапеції. Перегенерував (`gen-only`, лише carpet, $0.05) під заповнення кадру **край-у-край**
  без фону (бордюр по периметру). Тепер чисто лягає.
- **🛋️ Диван**: 320→300px + контактна тінь (2 еліпси) для приземлення.
- **🐛 Pulse-ratchet**: idle-нудж щоразу викликав `pulse(couch)` і перезахоплював **живий** (роздутий 1.06×)
  масштаб як базу → диван безмежно ріс. Фікс: повторний `pulse` того ж об'єкта = no-op (tween і так `repeat:-1`).
- **⭐ Перспектива підлоги-патча (головне)**: виявлено замірами (структурний тензор по `room-bg.webp` +
  least-squares), що **AI-підлога — 2-точкова, дошки йдуть ДІАГОНАЛЛЮ** до VP1≈(878,178) у горішньому-правому
  куті (НЕ симетричне «віяло» від центру). Патч малювався майже вертикально → «різні кути» (зауваження юзера).
  Переписав геометрію патча на **гомографію площини підлоги**: дошки-смуги йдуть уздовж VP1 (паралельно
  мальованим), поперечні шви — до VP2; per-board `oy` в анімаціях; work-zone/gloss/sparkle з bbox. Килим лишив
  **квадратним до кімнати** (як реальний килим лягає по стінах, не по діагональних дошках) — горизонт 178.
  Патч відцентровано і вписано в килим (не визирає до зриву).

**Перевірено (GPU-прев'ю, 9:16):** typecheck чистий (помилки лише в чужому `akuma-no-yoru-gen`); `npm run
dream-floor` → `validation: OK`, **1235 KB** (60.3%). Усі стани: `couch`(килим+диван) → `carpet`(килим криє
патч, без визирань) → `crowbar`(гнилі дошки **діагональні, паралельні фону**) → `plank`(сабфлор) →
`finish`(нові дошки **діагональні, паралельні фону**, анімація ок) → `reveal/endcard`(before/after+CTA). VP1
заміряно (predicted vs measured кути ±2-3°). Pulse-fix: 13с idle — диван не росте.

**Відкрито/борг:** VP2 (поперечний) оцінено від симетрії — можна дозаміряти, якщо near/far-грані патча різатимуть
око. Питання про діван (розмір/ракурс) лишилось відкритим — юзер перейшов на per-state ревью.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (перевірка вирівнювання патча під перспективу).

---

## 2026-06-09 — Dream Floor CP2-fix#2: ковролін на всю підлогу + 2-точкова діагональ (human review)

**Контекст:** дві правки користувача — (1) кут дощок ще не той; (2) замінити килимок на **ковролін на всю
площу підлоги** → знімаємо → вся підлога прогнила → міняємо **всю** підлогу.

**Зроблено:**
- **Замір перспективи (структурний тензор + least-squares по room-bg.webp):** дошки фону — **2-точкова
  діагональ** до VP1≈(878,178) у верх-правому куті (не центральне віяло). Підтверджено кропом (`floor-zoom`):
  дошки явно йдуть знизу-зліва вгору-направо.
- **Ковролін:** перегенеровано `carpet` → wall-to-wall broadloom (нейтральний greige, без візерунка, edge-to-edge).
- **Геометрія підлоги (`game.ts`):** прибрано малий патч-homography; введено **floorRegion** (4 кутові точки,
  відкалібровані оверлеєм по room-bg — вся видима підлога). Дошки — діагональні смуги до VP1, підрізані
  **маскою** під floorRegion (boardsC.mask). Ковролін мапиться на всю floorRegion; «зняття» = peel scale.y→0 до
  задньої стіни. Субфлор/шви — поперек до VP2. Per-board `oy` в анімаціях, адаптивний stagger (0.8–0.9/N).
- **«Після» = реальна підлога room-bg:** на reveal `boardsC` згасає (alpha→0), відкриваючи **намальовану
  дрім-флор підлогу room-bg** — ідеальні ширина/кут дощок за побудовою. Нові дошки «осідають» у неї.
- **QA-харнес (`__ftf`):** додано `view(state)`+`render()` — синхронно компонує END-візуал кожного стану й
  форсить кадр (бо preview-таб hidden → rAF призупинено, gsap-хук не йде). Дало змогу інспектувати стани.

**Перевірено (GPU-прев'ю, статичні компонування):** typecheck чистий; `validation: OK` (~1207 KB).
`crowbar` — гнила підлога **на всю площу, дошки діагональні**, диван відсунуто. `reveal` — **дрім-флор room-bg**
повністю відкрито, диван повернувся. QA-харнес: усі стани проходять `intro→couch→carpet→crowbar→plank→finish`,
CTA працює, **no logic errors** (тільки headless-SwiftShader shader-init — рендер на реальному GPU ок).

**Відкрито/борг:** анімації довші (вся підлога, ~21 дошка) — харнес-таймінги відстали (не баг); гнилі дошки
широкуваті (стара підлога — припустимо, але можна дрібніше); контактна тінь дивана зеленувата на дереві
(косметика); живі анімації (peel/fly-up) не бачив у прев'ю (hidden-tab rAF) — перевірка на localhost:5063.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (ковролін на всю підлогу + кут).

---

## 2026-06-10 — Dream Floor CP2-fix#3: шахові дошки + 2-VP стики + редактор VP2 (human review)

**Контекст:** ітерація по rotten/new підлозі — (1) дошки були одиночні розтягнуті на всю кімнату → треба
**декілька планок встик уздовж + у шаховому порядку** (як фінал room-bg), нові дошки — під патерн фіналу;
(2) арт rotten завеликий/«як із сараю» → нова текстура з тріщинами+термітами, правильний скейл; (3) головне —
стики планок були **горизонтальні** (по Y), через що дошки «підпиляні одні до одного під кутом» → треба
**другу перспективу (VP2)** для поперечних стиків, керовану вручну зеленим рівнем, як робили VP1.

**Зроблено:**
- **Текстури перегенеровано (gpt-image-1.5):** `floor-rotten` — одна довга стара планка топ-даун: глибокі
  сколи/тріщини вздовж волокон + **термітні ходи** (отвори, галереї, проколи), тепла напівреал, **не** чорна
  сарайна; `floor-new` — одна нова медова дубова планка. webp → `assets/` (разом ~428 KB, бюджет 1.43 MB).
- **Шахова розкладка (`game.ts`):** замість 1 планки на колонку — сітка **`PLANK_N=30` (ширина) × `PLANK_ROWS=6`
  (глибина)** з half-offset stagger (цегляний/шаховий патерн, `(i%2)*0.5`); `stripTexture(...,inset=12)` гасить
  світлі краї слайсів; per-planka темний контур-шов (`poly().stroke #241910/0.5`) ховає реберну смугу.
- **2-VP стики (головне):** введено `VP2` як повноцінну точку сходу. Кути кожної планки тепер =
  (бічна лінія до **VP1**) ∩ (лінія стику до **VP2**) через `lineISect` — раніше стики йшли горизонтально по Y.
  Дошки тепер сходяться у дві точки (VP1 — напрям планок, VP2 — поперечні стики) → читається як справжня
  2-точкова підлога, без «підпиляності».
- **Редактор `?floor` +VP2:** додано **другу зелено-бурштинову пару ручок `Qn/Qf`** (як `Pn/Pf` для VP1).
  Бурштиновий референс-відрізок кладеться вздовж стику, продовжується до горизонту → `vpe2.x`; малюється
  бурштинове віяло VP2. Readout показує `VP1 … VP2 …`; виставлено `window.__vp2`. Користувач тягне Qn/Qf
  уздовж реального стику room-bg і присилає VP2.

- **Скейл ковроліну привʼязано до дощок:** було `CARPET_TILE=1.9` (texture-fill scale > 1 → ZOOM IN, ~0.9
  повтору на всю підлогу = величезні петлі, «заскейлено»). Тепер `CARPET_REPEATS=PLANK_N` і scale рахується
  `(PXmax−PXmin)/(ct.width·PLANK_N)` → **30 повторів у ширину = один на дошку**; ввімкнено `addressMode:"repeat"`
  на джерелі текстури (без нього UV>1 не тайляться). Стало схоже на справжню дрібну broadloom-пряжу.

**Калібровано користувачем (`?floor`):** `VP1=1478`, `VP2=-1212` (обидві на горизонті y=178) — заведено в
константи `game.ts`. VP2 далеко зліва → поперечні стики майже паралельні (гентильне сходження), як на room-bg.

**Перевірено (GPU-прев'ю):** typecheck чистий; `npm run dream-floor` → `validation: OK`, **1191 KB** (58.2%).
`crowbar` — гнила підлога **кількома планками встик у шаховому порядку, стики під природним кутом до VP2**
(не горизонтальні, не «підпиляні»), текстура з тріщинами/термітами у правильному масштабі, диван відсунуто.
`finish` — нові медові дубові планки, та сама шахова розкладка, стики під room-bg. `?floor` — обидві пари
(зелена Pn/Pf + бурштинова Qn/Qf) рендеряться, віяла VP1/VP2 видно, ручки тягаються незалежно, `window.__vp2`.

**Відкрито/борг:** щільність планок виставлено `30×6` (ширина×глибина) на запит; опційний далі — темність шва, рівень зносу.
Живі анімації (peel/fly-up/settle) під новий 2-VP геом не переглянуто покадрово (hidden-tab rAF) — на localhost.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (шахові дошки + 2-VP стики, VP1/VP2 каліброві по room-bg).

---

## 2026-06-10 — Dream Floor CP2-fix#4: вазон/лампа поверх підлоги (cut-out) + редактор ?props

**Контекст:** вазон і лампа запечені в `room-bg` і стоять НА підлозі. Ковролін/дошки (малюються на всю
floorRegion) перекривали їхні основи → виглядало, ніби обʼєкти тонуть у підлозі. Користувач: «вирізати маски
для них, щоб не перекривалися».

**Зроблено:**
- **Cut-out поверх floor-шару:** новий контейнер `props` між `floorLayer` і `couch` у z-порядку. Вазон і лампу
  вирізано з `room-bg` полігонами й перемальовано в `props` через `Graphics().poly(cut).fill({texture: bgTex,
  matrix})`, де `matrix = new Matrix(s,0,0,s,0,oy)` мапить texture-px → design (s=DW/bgW, oy=(DH−bgH)/2) — лягає
  піксель-в-піксель на оригінал. Ключ: НАД краєм підлоги cut-out накладається на ІДЕНТИЧНІ пікселі стіни
  (невидимо), тож тісно обводити треба лише ОСНОВУ (там, де обʼєкт над підлогою). Працює в усіх станах
  (ковролін/дошки/нова), бо `props` завжди над `floorLayer`.
- **Точне трасування:** через `sharp` extract+nearest-zoom кропи room-bg (вазон 4×, лампа 6×) зміряно силуети;
  texture→design конверсія. Вазон: плетений горщик tex x292–343 (вінець) → x301–338 (низ), y376–430. Лампа:
  овальна стопа tex x545–587, y448–464 (треба лише передня половина, нижче краю підлоги).
- **Редактор `?props`** (localhost:5070/?props): ковролін опущено, cut-out'и LIVE зверху, перетягувані вершини
  на кожен силует (зелений=вазон 6 точок, помаранчевий=лампа 8), readout координат, `window.__props` + eval-хук
  `window.__pr={polys,redraw}` для швидкого тюну без ребілда.

**Перевірено (GPU-прев'ю):** typecheck чистий; `npm run dream-floor` → `validation: OK`, ~1192 KB. У станах
`carpet`/`crowbar`/`finish` вазон і лампа стоять ПОВЕРХ підлоги без дерев'яної рамки навколо основи й без
ковроліну на основі. `?props` — обидва силуети перетягуються, координати в readout.

**Відкрито/борг:** контактної тіні під обʼєктами на новій підлозі нема (cut-out без тіні — можна додати мʼяку);
тонка смуга оригінальної підлоги вздовж задньої стіни (край floorRegion не дотягнутий до плінтуса) — помітна під
ковроліном, окремий тюн калібрування, не чіпав (хендтрейс користувача).

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (вазон/лампа більше не перекриваються підлогою).

---

## 2026-06-10 — Dream Floor CP2-fix#5: контактні тіні + смуга біля задньої стіни (поліш)

**Контекст:** перед сайнофом CP2 — два дрібні поліш-пункти від користувача: (1) контактна тінь під вазоном/лампою
(стояли «у повітрі»); (2) тонка смуга оригінальної підлоги між ковроліном і плінтусом біля задньої стіни.

**Зроблено:**
- **Контактні тіні:** новий контейнер `propShadow` між `floorLayer` і `props`. Під кожним cut-out — мʼяка тінь
  (2 еліпси: широка пенумбра α0.10 + тісніше ядро α0.17), центрована на основі. Загасає на reveal разом із
  `boardsC` (щоб не дублювати власні запечені тіні room-bg), відновлюється в `resetAll`. Тепер вазон/лампа
  «стоять» на ковроліні/дошках/новій підлозі.
- **Смуга біля стіни — підтягнув КОРИСТУВАЧ вручну (`?floor`):** мою авто-спробу (через `sharp`-замір вала
  плінтуса, BL 403→396 тощо) відкотили — «стало гірше». Натомість користувач сам перетягнув задню грань у
  редакторі: **BL 245,403→245,399, BR 686,470→695,470, ML -24,451→-20,448** (VP1 1478 / VP2 -1212 без змін).
  Заведено в `FLOOR_PTS`. Ковролін/дошки/нова підлога тепер заходять під плінтус, смуга значно менша.

**Перевірено (GPU-прев'ю):** typecheck чистий; `npm run dream-floor` → `validation: OK`, ~1192 KB. Стан
`carpet`: підлога заходить під плінтус по задній стіні (смуга майже зникла), вазон/лампа з мʼякою контактною
тінню «приземлені». Передано користувачу на live-тест усього флоу.

**Відкрито/борг:** живий end-to-end плейтру анімацій (peel/fly-up/settle/finish-sweep) ще не дивились покадрово
(hidden-tab rAF); `npm run visual` ще не ганяв для dream-floor.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (контактні тіні + задня грань підтягнута користувачем; лишився live-плейтру + visual-ворота).

---

## 2026-06-10 — Dream Floor CP2-fix#6: освітлення ковроліну + тінь дивана поверх підлоги

**Контекст:** користувач — «ковролін відчувається дуже пласким, без тіней і реакції світла». Плюс знайдено:
тінь дивана сиділа в шарі `room` ПІД floorLayer → на ковроліні диван «плавав» без тіні.

**Зроблено:**
- **Тінь дивана піднято над підлогою:** новий контейнер `groundShadow` між `floorLayer` і `propShadow`;
  `couchShadow` переїхав туди з `room`. Альфи пом'якшено (0.16/0.20 → 0.09/0.12) — на світлому ковроліні
  стара щільність читалась як «діра».
- **Освітлювальний пас ковроліну** (діти `carpet`, зриваються разом із ним): (1) **ворс-«хмари»** — той самий
  своч ре-тайлом ×7 multiply α0.3 → м'які тональні плями як у справжнього broadloom; (2) **AO-смуга** вздовж
  задніх стін (ML→BL→BR), 3 стековані стрічки 40/24/12px α0.05/0.06/0.08 → м'який falloff; (3) **теплі плями
  світла** (add-blend, #ffd9a0): від вікна (365,495, ~175×70) і від торшера (449,465); (4) **передня віньєтка**
  — 3 смуги затемнення від y640 вниз (джерела світла ззаду). Без маски: нижче y≈640 floorRegion покриває всю
  видиму канву, а легкий «залаз» плям на низ стіни природний.
- **Звірка-урок:** перший варіант із floor-shaped маскою-дитиною (`carpet.mask = cMask`) ламав рендер —
  ковролін «осідав» і вилазила смуга підлоги room-bg (взаємодія child-mask + multiply/add blend у Pixi v8).
  Маску прибрано — геометричної потреби в ній нема.

**Перевірено (GPU-прев'ю):** `validation: OK`; стан `carpet` — ковролін з тональними плямами, тіні від стін,
теплі плями від вікна/торшера, віньєтка спереду, тінь під диваном на ковроліні. Користувач: «цей проміжний
варіант хороший».

**Git:** init ідентичності (repo-local), 2 коміти в main + push: `75e1b56` (fix-the-floor predecessor),
`b1fb010` (dream-floor D2 draft, CP2 intermediate) → github.com/SerhiiDubei/playableads.

**Відкрито/борг:** ту саму світло-обробку можна за бажанням накласти на дошки (crowbar/plank/finish стани);
live-плейтру анімацій + `npm run visual` досі відкриті до закриття D3.

**Чекпойнт:** 🛑 **CHECKPOINT 2 — awaiting human** (проміжний варіант прийнято користувачем, закомічено).

---

## 2026-06-02 — Phase 0: Контракти й каркас

**Зроблено:**
- **P0-1** — `npm install zod` → `zod@^4.4.3` у dependencies. Додано `npm run test` script (`node --import tsx --test "src/**/*.test.ts"`).
- **P0-2** — `src/assetgen/pipeline/types.ts`:
  - zod-схеми: `BriefSchema` (passthrough на майбутні поля), `AssetEntrySchema`, `FontSchema`, `PlanScreenSchema` / `PlanSchema` (optional, Phase 5), `BuildSchema`, `ValidationSchema`, `EnvelopeSchema`, `StageStatusSchema`, `StageRunRecordSchema`, `RunStatusSchema`, `RunStateSchema`.
  - inferred TS types як single source of truth.
  - `RunContext` + `Stage<In, Out>` як TS-only interfaces (не серіалізовуються).
- **P0-3** — `src/assetgen/pipeline/runDir.ts`:
  - `makeRunId(now?)` — сортований compact ISO + 8 hex chars (e.g. `20260602T131422-a3f1c8d2`).
  - `runDirOf(baseDir, runId)` — pure path join.
  - `ensureRunDir(runDir)` — mkdir -p для `assets/` + `failures/` (Q35).
  - `readRunState` / `writeRunState` / `readEnvelope` / `writeEnvelope` — атомарний запис (tmp → rename) + zod-валідація на write.
  - `read*` повертає `null` коли файла нема (runner розрізнить «свіжий run» vs «corrupt»).
- **P0-4** — `types.test.ts` (15 тестів) + `runDir.test.ts` (14 тестів) у hermetic tmpdir.

**Перевірено:**
- `npm run typecheck` — чистий.
- `npm run test` — **29 tests / 7 suites / 0 fail / 461ms**.
- Що покрите: schema parse OK/throw на valid/invalid, runId формат і унікальність, ensureRunDir idempotent, round-trip Envelope/RunState, null on missing, throw on invalid payload, atomicity (no .tmp residue).

**AC закрито:**
- AC0.1 ✅ — `*.parse(valid)` ok, `parse(invalid)` кидає.
- AC0.2 ✅ — наявні команди не зачеплено (нічого з існуючого не редагувалось, лише додано теку `pipeline/` + один рядок у scripts).
- AC0.3 ✅ — `tsc --noEmit` чистий, `npm run test` зелений.

**Відкрито/борг:**
- `Envelope.plan` навмисне залишений `optional` — справжня форма прибуде у Phase 5. `PlanScreenSchema` має `passthrough`, тож додавання полів не потребуватиме schema-міграції.
- `RunContext` поки тільки `{runId, runDir}`. У Phase 1 додамо logger / abort signal.

**Чекпойнт A:** awaiting — користувач підтверджує форму `Envelope` + `RunState` + `Stage`, тоді стартуємо Phase 1.

---

## Phase 1 — Orchestrator + Validator stage (2026-06-03)

**Зроблено:**
- `pipeline/runner.ts` — `runStages(ctx, stages, seed|null, opts)`: виконує стадії по черзі, пише `run.json` + `envelope.json` після КОЖНОЇ. Fresh-start (seed) або RESUME (читає run.json, пропускає `done`). Gate-стадія ставить run у `needs-approval` і зупиняє; throw → стадія `failed` + run `failed`, решта не виконуються. Інжектований `clock` для детермінізму.
- `pipeline/stages/validate.ts` — `validateStage` обгортає `src/build/validator.ts` як `Stage<Envelope,Envelope>`; читає `envelope.build.htmlPath`, пише `envelope.validation` (enrich-only, не кидає на ok=false).
- `pipeline/runner.test.ts` — 8 кейсів.

**Перевірено:** `tsc` чистий · `npm run test` — **36/36 pass** (fresh-order, resume-skip-done, gate-pause, failure-stops-rest, no-seed-throws, validate ok/fail/missing-build).

**AC закрито:** AC1.1 (Validator як Stage), AC1.2 (run.json після кожної + переходи статусів + resume).

**Відкрито/борг:**
- CHECKPOINT B потребує РЕАЛЬНОГО прогону (run.json з живих стадій) — повноцінний e2e буде після Phase 2 (wire assetgen→build). Зараз resume + run.json доведені юніт-тестами (реальні файли в tmp).
- `validateStage` enrich-only: політику «fail run on !ok» винесемо в CLI/gate (Phase 3-4).

**Чекпойнт B:** review — користувач перевіряє форму `run.json` + що resume працює, тоді Phase 2.

---

## CHECKPOINT B — пройдено (2026-06-03)

**Доведено:** `npm run pipeline:demo` (3 стадії: assetgen[gate]→build→validate) — свіжий прогін став на gate (`needs-approval`), resume добіг до `done` НЕ перезапустивши assetgen (`trace.log` = одна згадка). Реальні `run.json` + `envelope.json` у `out/runs/<id>/`. Користувач підтвердив → старт Phase 2.
**Принагідно:** `docs/dashboard.html` — проєктний хаб (7 вкладок), задеплоєно на gh-pages.

## Phase 2 — START (2026-06-03) ⭐ головна
Мета: реальний `assetgen → build` через Envelope (прибрати хардкод у білдері). P2-1 → wip.

## Phase 2 / P2-1 — assetgen stage emit envelope (2026-06-03)
**Зроблено:** `pipeline/stages/assetgen.ts` — read-only стадія: сканує `out/<style>/*.png` (+ sidecar для prompt/briefVersion) → `envelope.assets[]`. НЕ генерує (нуль витрат). `assetgen.test.ts` — 3 кейси.
**Перевірено:** tsc · **39/39 tests** · demo на реальному cyber-heist → 13 ассетів у envelope.json.
**AC:** AC2.3 ✅. **Далі:** P2-2 (білдер читає envelope.assets замість хардкоду) — РИЗИК CHECKPOINT C (before/after ідентичні).

## Phase 2 / P2-2 — builder reads asset-plan (2026-06-03)
**Зроблено:** винесено `defaultAssetPlan(src, layout)` (keys+extra) з тіла `buildKitPlayable`; білдер читає план через `opts.plan` (дефолт = ідентичний). Хардкод bg/hero/sizes більше не в потоці білда — резолвер, який зможе постачати pipeline-стадія (P2-3).
**Перевірено:** tsc · **41/41 tests** (+contract-lock на defaultAssetPlan) · **golden BEFORE==AFTER байт-у-байт** на всіх 11 шаблонах (CHECKPOINT C no-regression витримано об'єктивно).
**AC:** AC2.1 ✅. **Далі:** P2-3 — `cmdMenu`/menu через раннер (assetgen-стадія постачає план → build-стадія), тоді CHECKPOINT C (твоя фінальна звірка before/after).

## Phase 2 / P2-3 — menu build through the orchestrator (2026-06-03) ✅ Phase 2 done
**Зроблено:** `pipeline/stages/build.ts` (build-стадія обгортає buildKitPlayable) + `pipeline/menu-run.ts` (`buildMenuViaPipeline`: assetgen→build→validate через runStages → out/runs/<id>/ з run.json+envelope+playable). Скрипт `npm run pipeline:menu <style> <layout>`.
**Перевірено:** tsc · 41/41 tests · **golden: pipeline-білд == прямий білд байт-у-байт на всіх 11 шаблонах** → CHECKPOINT C (no-regression) витримано об'єктивно.
**AC:** AC2.2 ✅. Phase 2 (⭐ головна) закрита: assetgen→build тепер ідуть через Envelope+оркестратор, вивід незмінний.
**Далі:** Phase 3 — CLI (`forge run/resume/inspect`).

## Phase 3 — CLI (run/resume/inspect) (2026-06-03) ✅ Phase 3 done
**Зроблено:** `pipeline/cli.ts` — 3 команди над оркестратором: `run <style> [layout]`, `resume <runId>`, `inspect <runId>`. `menu-run.ts`: layout їде в `brief` (passthrough) → resume відбудовує стадії; додано `resumeMenuRun`. Скрипт `npm run pipeline`.
**Перевірено:** tsc · 41/41 tests · вручну: `run cyber-heist endcard`→done+validation ok; `inspect`→стадії з таймстемпами + envelope(13 assets); `resume`→no-op done. → CHECKPOINT D витримано.
**AC:** AC3.1/3.2/3.3 ✅. **Далі:** Phase 4 — gates (cost-preview, human-in-the-loop).

## Phase 4 — cost-preview gate + approve (2026-06-03) ✅ Phase 4 done
**Зроблено:** `pipeline/stages/cost-preview.ts` — gate-стадія: `estimateCost(style)` рахує cached-ассети × $/img, пише `cost.json`, ставить run на `needs-approval`. `menu-run.ts`: опційний gate (`--gate`), resume відновлює gated-стадії з run.json. CLI: `run … --gate` + `approve <runId>` (явний human-override = «overpush»). Envelope-схему не чіпав — cost живе окремим артефактом (CHECKPOINT A frozen).
**Перевірено:** tsc · 43/43 tests (+estimateCost) · вручну: `run --gate`→needs-approval ($0 now / $1.04 regen / 13 cached)→`approve`→done, validation ok; inspect показує всі 4 стадії + cost. → CHECKPOINT E витримано.
**AC:** AC4.1/4.2/4.3 ✅. **Далі:** Phase 5 — planner (намір → plan.screens + assetKeys), останній модуль.

## Phase 5 — Planner (2026-06-03) ✅ Phase 5 done · 🏁 PIPELINE COMPLETE
**Зроблено:** `pipeline/stages/planner.ts` — gate-стадія: screens з template.meta.screenIds + assetKeys зі сканування `out/<style>/` → `envelope.plan`; пауза (`needs-approval`) → план редаговано в `envelope.json` до asset-gen. `assetgen` фільтрує по `plan.assetKeys` (P5-3). CLI: `run … --plan`; inspect показує план.
**Перевірено:** tsc · 45/45 tests (+planner) · вручну: `run --plan showcase`→needs-approval з планом (10 screens, 13 assetKeys)→approve→done; **byte-identical vs golden** (planner-flow не змінив вивід). → CHECKPOINT F витримано.
**AC:** AC5.1/5.2/5.3 ✅.

## 🏁 PIPELINE v1 — END-TO-END (Phases 0-5, checkpoints A-F усі пройдено)
Brief → (planner gate) → (cost gate) → assetgen → build → validate, з run.json/envelope, resume, gates, CLI (run/resume/inspect/approve). 45/45 tests, byte-identical збережено через увесь рефактор. Наступне — продуктові епіки B-J (Brief UI, Style system, ...) поверх готового хребта.

## PRE-1 — Brief ontology dedup (2026-06-03)
**Зроблено:** legacy `Brief` (src/types.ts: build-брифа mechanic+style+copy) → `BuildBrief`; pipeline zod `Brief` лишився канонічним. Оновлено builder.ts/loader.ts/types.ts. Колізія імен прибрана (як Layout→ZoneSpec).
**Перевірено:** tsc · 45/45 tests · endcard byte-identical vs golden. **AC PRE-1 ✅.** Розблокувало епік B (будуватиметься на канонічному Brief).

## PRE-2 — Template Standard T-01 (2026-06-03)
**Зроблено:** `docs/TEMPLATE-STANDARD.md` із скелета → чинний: §1 визначення (lab vs template), §2 manifest-поля, §3 структура (zone-driven, declared assets, endcard+CTA, ≤2MB), §4 вигляд по 7 архетипах, §5 якісні ворота, §6 усталені патерни, §7 процес промоції. **AC PRE-2 ✅.** Розблокувало D (catalog) — однозначний критерій «гра→шаблон».

## PRE-3 — Mechanics list v1 (2026-06-03) · TIER 0 complete
**Зроблено:** `docs/MECHANICS-v1.md` — 14 механік: 10 готових zone-шаблонів (endcard/tap-reveal/pick-hero/progress-reveal/two-choice/match-cluster/feature-grid/feature-list/tutorial/menu5) + 4 lab-ігри (tap-coin/connect/mad-mage/bonanza). Кожна: архетип, екрани, психологія конверсії. Чернетка-дефолт (чекає фіналізації користувача). **AC PRE-3 ✅.**
**TIER 0 (прерквізити) закрито:** PRE-1 (Brief-дедуп) · PRE-2 (template standard) · PRE-3 (механіки). Розблоковано Tier 1 (D→B→C).

## D — Mechanics catalog v1 (2026-06-03) · TIER 1 start
**Зроблено:** `manifest.catalog: "v1"` додано до fruit-bonanza + mad-mage-tower; `TemplateManifest.catalog?` у типах; `src/assetgen/mechanics.ts` — `listMechanics(mode)` поверх `loader.listTemplates`: user=курований v1, dev=всі. CLI `npm run mechanics [-- --dev]`. Розширюваний (manifest → авто). +mechanics.test.ts.
**Перевірено:** tsc · 47/47 tests · `mechanics`→2 v1, `--dev`→6. **AC D (v1) ✅** (combine-2 механік + scaffold-AI-fill → беклог/решта епіків).
**Далі:** B (Brief-агент, CLI) — будується на канонічному `Brief` (PRE-1).

## B — Brief stage (CLI-агент) (2026-06-03)
**Зроблено:** `src/assetgen/brief/` — `UserBrief` (zod: prompt+refs обов'язкові, yellow-поля); `store.ts` (версіонування v1/v2 + нетригерний rollback через `current`-вказівник, інжектований root для тестів); `summarize.ts` (топ-3 механік за збігом промту + v1-бонус → суперкнопка); `cli.ts` (`brief new/list/show/rollback`). `npm run brief`. intake → `briefs/user/<id>/` (gitignored).
**Перевірено:** tsc · 52/52 tests (+5: schema/versioning/rollback/slugify/summarize) · демо: `brief new "tumble slot..."` → 3 yellow-warns + суперкнопка Fruit Bonanza (score 8).
**AC B ✅:** prompt+refs обов'язкові · валідований user-brief · версіонування+нетригерний rollback · summarize→топ-3+суперкнопка · headless. **Далі:** C (planning поверх planner).

## C — Planning layer (2026-06-03) · TIER 1 complete
**Зроблено:** `pipeline/plan-edit.ts` (чисті add/rm screen+asset) + `pipeline plan show|add-screen|rm-screen|add-asset|rm-asset <runId>` у CLI — редагування `envelope.plan` ДО asset-gen (поверх planner-gate з Phase 5). +plan-edit.test.ts.
**Перевірено:** tsc · 55/55 tests · флоу: `run --plan`(пауза)→`plan show`(10 screens/13 keys)→`rm-screen battle`(9)→`rm-asset avatar-frame`(12)→`approve`→assetgen спожив 12 ассетів. «План редагований до asset-gen» (Q29) ✅.
**AC C ✅** (review/edit + downstream споживає). Майлстоуни/uncertainty→ask — агентні поведінки на потім.
**🏁 TIER 1 (P0-ядро) ЗАКРИТО:** D (catalog) + B (brief-агент) + C (planning). Ланцюг Brief→Catalog→Plan→Pipeline з'єднаний на CLI.

## Create-new-mechanic (2026-06-03) 🆕
**Зроблено:** `src/assetgen/scaffold.ts` — `scaffoldMechanic({id,name,desc,baseDir})` → `labs/<id>/{manifest.json (без catalog→draft), game.ts}`; валідація id + guard дублів. CLI `playable new <id>` → **labs/** (було templates/, тепер labs-first). `mechanics.listDrafts()` читає labs/. Studio: `/api/drafts`, `/api/scaffold` + форма «Нова механіка». Спільний scaffolder для CLI+Studio+тестів.
**Перевірено:** tsc · 57/57 tests (+scaffold) · смоук: `playable new`→labs/, Studio create→labs/ + drafts лістить + dup→409.
**Тепер можна:** не лише обирати наявні, а й **створювати нові** механіки (чернетки в labs/), потім промоція за T-01.

## Studio v2 + Agent-2 + refgames base (2026-06-04) 🆕
**Зроблено:** (1) Studio v2 (`src/server/ui-v2.html`, `/v2`) — чат-перший UX, живий бриф механіки, картки-архетипи. (2) Claude Agent SDK вшито (`src/server/agent.ts`, `/api/agent`) — вільний текст→бриф на ПІДПИСЦІ (без API-ключа; `settingSources:[]`+`allowedTools:[]`). (3) Бриф→manifest чернетки (`scaffold.ts` +brief). (4) **refgames knowledge base** (`src/assetgen/refgames/`): rich-схема (7 секцій: identity/core+rubric/gameplay/animations/screens/assets/meta, ранжовані ahaMoments) + zod-валідація на load + Fruit Ninja seed. (5) **Schema-quality test** (`gen-test.ts`, `npm run refgames:gen`): refgame→LLM→game.ts→bundle→validate.
**Перевірено:** tsc · 58/58 tests (+brief-persist) · **наскрізний runtime-тест fruit-ninja**: згенеровано 19KB game.ts ($0.28) → зібралось 594KB/2MB, validation OK → у браузері (Playwright): рендер без помилок, свайпи нарізають фрукти, score→18 тригерить ендкард «AWESOME», CTA «Play Now» → `FbPlayableAd.onCTAClick()` спрацював. Контракт-нюанс пофікшено (заборона `?.` на CTA).
**Висновок:** rich-схема refgames **достатня** для генерації робочого playable з повним циклом (дія→aha→win→CTA). Знання детерміновані, не «з капелюха».
**Відкрито:** база поки 1 гра (треба LLM-деконструктор для росту); генерація ще не вшита в UI Агента 2; візуал code-only (без AI-ассетів).

## refgames v2 — SB3 lessons → schema → regen (2026-06-04) 🆕
**Зроблено:** Проаналізовано повний Scratch-сорс Fruit Ninja (.sb3: 34 спрайти, 31 звук, 1512 блоків) → 3-way порівняння (прототип/HTML/SB3, `FN-3WAY-COMPARISON.md`). Влито уроки в схему refgames: `comboRule` (часове вікно+множник+голос), `specialItems[]` (frenzy/freeze/double/pomegranate), `audioEvents[]` (подія↔звук+варіації), `modes[]`. Оновлено запис fruit-ninja цими даними. Витягнуто 4 .wav з SB3 (slice/combo/bomb/throw, 249KB). Контракт генерації v2: розріз→2 половинки+сік, часове комбо+множник+банер, frenzy-банан, бомби, реальне аудіо через `cfg.assets`.
**Перевірено:** tsc · refgames validate ✓ · перегенеровано → зібралось 926KB/2MB, validation OK · браузер (Playwright): 0 runtime-помилок, score 40 (множник діє, проти 18 у v1), лічильник життів, ендкард «Fruit Master» + CTA · код-інспекція: підтверджено spawnHalf/juiceSplat/COMBO_WINDOW/mult/frenzyT/BOMB/sfx() — усі уроки реалізовані.
**Обмеження:** звук нечутний у harness (вшито, 0 помилок); half-flight/банер не заморожено в кадрі (таймінг), але підтверджено в коді.
**Висновок:** цикл «реальний сорс → схема → генерація» працює: розрив до продакшену звужено за один прохід (логіка+аудіо+половинки). Схема тепер тримає і логіку, і аудіо-мапу.

## kit/motion.ts + v3 regen (2026-06-04) 🆕
**Зроблено:** Декомпільовано Fruit Ninja Retro (Unity, Mono) → реальна модель руху (`MOTION-SYSTEM.md`): фізична арка (час+гравітація, не швидкість), launch майже вертикальний (±10°), ескалація щільності не швидкості, адаптивна складність (rolling-window success). Збудовано `src/assetgen/kit/motion.ts`: `makeArc()` (g=8H/T², v0y=-4H/T → зависання на піку), screen-relative токени, `DifficultyController` (rubber-band). Контракт генерації оновлено: зобов'язує `makeArc`+`DifficultyController`+dt, забороняє `x+=speed`/speed-ramp. Генератор версіонує вивід (`out/<id>-gen-vN.html`).
**Перевірено:** tsc · 6/6 motion-тестів (апекс 72%±5%, політ 2.2с±0.15, dt-незалежність 30/120fps <3%, зависання vy<20, slice-window≥1.2с) · v3 згенеровано → 927KB OK · код v3 юзає makeArc/DifficultyController/deltaMS, 0 анти-патернів · браузер: фрукти злітають знизу арками й зависають (старт-кадр), розріз у apex-band → score 30 → win-ендкард + CTA.
**Висновок:** головну болю «все літає» виправлено фундаментально — рух тепер фізична арка з зависанням, dt-correct, ескалація щільності. v2 (до) і v3 (після) клацабельні поруч.
**Відкрито:** раз бачив передчасний ендкард score-0 (не відтворюється, ймовірно rAF-throttle); візуал ще code-only (кружечки, не спрайти).

## refgames v4 — AI assets + full-game (2026-06-04) 🆕
**Зроблено:** `gen-assets.ts` — генерує fruit sprite-sheet (3×2 → sharp-slice) + bomb + dojo-bg через gpt-image-1.5, ОПТИМІЗУЄ (trim→resize→webp, джерела в assets/_src/ не інлайняться) → 111KB webp (~$0.13). Контракт генерації v4: спрайти замість кружечків (Assets.load webp, half-slice через маску, juice), ПРИБРАНО стоп на score (повноцінна timed-гра ~25с), STICKY CTA весь час, БОМБА=м'який штраф (життя, не game-over), frenzy без бомб.
**Перевірено:** tsc · v4 згенеровано 1114KB/2MB OK · код: 0 score-stop, sticky CTA (рядок 97), "game continues — never finish from bomb" (238) · браузер: рендер додзьо-фон + спрайти фруктів + кавун розрізаний навпіл з соком + score 90 (НЕ зупинилось на 30) + таймер + 3 життя + sticky CTA; CTA спрацював ПІД ЧАС гри (ctaDuringPlay:1); 0 runtime-помилок.
**Висновок:** трансформація code-only→продакшн-вигляд за один прохід. v2(кружечки,стоп) ↔ v4(арт,повноцінна гра) клацабельні.
**Відкрито:** half-slice через маску працює, але можна точніше; bg 7KB трохи м'який; ще нема motion-lint гейта.

## refgames v5→v6 — 3 покращення (2026-06-04) 🆕
**Зроблено (ідеї 1,2,5):** контракт генерації +: (1) розріз УЗДОВЖ свайпу (atan2 кут, обернена маска) + світний слід-лезо; (2) ПОСТІЙНІ плями соку на фоні (накопичуються) + slow-mo+zoom на великих комбо; (5) всі 4 спец-предмети (frenzy/freeze/double/pomegranate, glow-кольори). v5 впав на pointermove (null.x — Pixi обходив знищені інтерактивні діти) → додано правило СТАБІЛЬНІСТЬ (interactiveChildren=false на ігрових шарах, ручний хіт-тест, removeChild перед destroy) → v6.
**Перевірено:** v6 1118KB/2MB OK · код: atan2/trailLayer/stainLayer/slowMo/4×Special присутні; interactiveChildren=false на world/stain/game/trail · браузер: стрес-різання 6 свайпів → 0 console-помилок (баг null.x усунено) · ендкард «TIME'S UP» (завершення по таймеру, не score) + sticky CTA · pomegranate-спец видно (фіолетовий glow).
**Висновок:** 3 фічі вшито + регресію виправлено правилом у контракті (наступні генерації не впадуть). v6 — найкраща версія.
**Відкрито:** слід-лезо не заморожено в кадрі (згасає 0.2с); точність half-cut по кутах можна ще полірувати; motion-lint гейт ще не зроблено.

## refgames v7 + deploy (2026-06-04) 🆕
**Зроблено:** AI splatter-асети (2×2 white solid-fill sheet → slice → splat1..4.webp, ~$0.05) для плям соку на стіні; контракт: плями = Sprite(splatN).tint=колір фрукта (не Graphics-blob). Згенеровано v7. Задеплоєно на gh-pages як fruit-ninja.html (worktree ../gh-pages-deploy).
**Перевірено:** v7 1185KB/2MB OK · браузер: стіна вкрита кольоровими плямами соку (splat-спрайти тоновані), Combo x11 банер, score 685, 0 runtime-помилок · splat alpha виміряно (19% opaque, суцільна заливка — не контур; пастка білий-на-білому) · gh-pages URL https://serhiidubei.github.io/playableads/fruit-ninja.html → 200 (відкривається на телефоні).
**Висновок:** повний playable з якісними асетами публічно доступний за посиланням для мобільного тесту.

## refgames v8 — flesh-reveal slicing (2026-06-04) 🆕
**Зроблено:** AI fruit-halves аркуш (3×2 зрізи з м'якоттю: кавун+насіння, яблуко серцевина, апельсин дольки, полуниця, лимон, слива з кісточкою) → half1..6.webp (~$0.06). Контракт: на розрізі ховаємо цілий фрукт (шкірка) → показуємо halfN (зріз-м'якоть) як 2 половинки через маску по куту свайпу. Видно соковиту середину (ефект «3д нутрощів»). v8 згенеровано, задеплоєно (fruit-ninja.html).
**Перевірено:** v8 1333KB/2MB OK · код рядок 174: new Sprite(tex["half"+fruitN+".webp"]) · браузер: 0 runtime-помилок (маска half стабільна), розрізані половинки з м'якоттю видно, стіна в плямах соку, score працює · gh-pages оновлено v8.
**Висновок:** розріз тепер реалістичний — шкірка зовні, м'якоть на зрізі (як SB3 Left/Right костюми).

## Plan sync (2026-06-04) 🆕
**Зроблено:** Синхронізовано плани з реальністю. Створено `docs/REFGAMES-BACKLOG.md` (трек R: R-01..10 done, R-11..17 todo). PRODUCT-PLAN: додано трек R, E/F+/G+/J → `partial (via R)`, UI → `done v2`. ROADMAP: T-01 todo→done (TEMPLATE-STANDARD чинний), додано refgames-track секцію + примітку S-02 (labs-first де-факто діє).
**Перевірено:** доки звірені між собою (T-01 розбіжність усунено); BUILD-LOG = джерело стейджів.
**Висновок:** документи знову = джерело правди; refgames-трек видимий у роадмепі/беклозі.

## NEW GAME: Akuma No Yoru (Demon Slayer Night) (2026-06-04) 🆕🆕
**Контекст:** новий референс — Unity 2D екшн-платформер з мілі-боєм (декомпільовано Assembly-CSharp, 36K рядків: PlayerController/PlayerCombat/EnemyHealth, вороги amphibian/crow). Дистильовано в **swipe-survival**: демони НАСУВАЮТЬСЯ, рубаєш свайпом, є життя.
**Зроблено:** (1) `kit/motion.ts` +`makeApproach` (загрози до цілі, dt-correct, screen-rel) +2 тести. (2) **УЗАГАЛЬНЕНО генератор** `gen-test.ts` — `buildContract(g,imageKeys,audioKeys)` робить БУДЬ-ЯКУ гру зі схеми (асети динамічні, рух arc/approach за брифом). (3) refgame-запис `akuma-no-yoru`. (4) `gen-akuma-assets.ts` — AI демони(6)/воїн/ніч-фон/кров (~$0.25, webp), реюз sfx fruit-ninja. (5) Генерація v1→v3.
**Перевірено:** tsc · 66/66 тестів · v1 баг (ріг: демони зливали 3 життя за 6с→endcard) → знайдено дебаг-глобалом (running=false, gtl заморожено) → фікс контракту (end лише по таймеру, грейс, щедрий хіт-радіус, повільні демони) → v2 (гра йде всі 27с, kills+score 0→40 при влучанні) → v3 (компактна назва, демони 0.10-0.14sh/s, score 25 у тесті, CTA cta:1). Браузер: демони видимі, кров на стіні, атмосфера, 0 runtime-err (лише gsap transformOrigin warning — безпечно).
**Деплой:** gh-pages → https://serhiidubei.github.io/playableads/akuma-no-yoru.html
**Висновок:** конвеєр зробив ДРУГУ, зовсім іншу гру (екшн замість слешера фруктів) тим самим шляхом — підтвердив, що генератор справді generic. makeApproach + generic-contract — нові переюзовні цеглини.
**Відкрито:** баланс життів (зливаються при пасивній грі, але гра не обривається); gsap transformOrigin warning у контракт-заборону; назва демонів-half (зараз poof, не розруб навпіл).

## Akuma No Yoru → ПРАВИЛЬНА дистиляція: керований платформер (2026-06-04) 🆕🆕
**Контекст:** попередня akuma була swipe-survival — ХИБНИЙ жанр. Реальна гра (itch osakastudios, декомпіляція) = Castlevania-лайк 2D піксель-екшн-ПЛАТФОРМЕР: героїня бігає/стрибає/рубає. Користувач підтвердив помилку («ти ж бачив у C# що персонаж бігає й б'ється»). Залочено: екранний D-pad+ATTACK, піксель-арт.
**Зроблено:** (1) `kit/motion.ts` +`makePlatformerBody` (dt-correct, 2nd-order кінематика для dt-незалежного апекса) +3 тести (11 total). (2) Схема +`playableKind?:"slasher"|"platformer"`. (3) Переписано games.json akuma → платформер (coreAction tap, керований). (4) gen-test.ts: рефактор buildContract на спільні блоки + ГІЛКА `platformerContract` (D-pad+attack, makePlatformerBody, камера-скрол, фон-cover, ground-tile, ручний хітбокс, makeApproach-вороги, reach-goal→win, ad-rig, pose-swap анімація, dev-хук __btns). (5) `gen-akuma-assets.ts` → ПІКСЕЛЬ-арт (hero_idle/run/attack/jump консистентні, demon1-3, gothic bg з кривавим місяцем, ground, reused sfx). v5→v6.
**Перевірено:** tsc · 69/69 тестів · v5 баг (фон не покривав при скролі) → знайдено скриншотом → фікс контракту (bgLayer екранно-фіксований cover, ground тайл по WORLD_W, щедрий per-tick attack-хітбокс) → v6. Браузер (через __state/__btns + hold-across-realtime бо rAF тротлиться в evaluate): heroX 576→1156 (біг), worldScroll 0→484 (камера+паралакс), facing flip, grounded→false (стрибок), enemies спавн, lives=5 тримаються; фон ПОКРИВАЄ весь екран; reach-goal → «You Survived!» ендкард + sticky CTA; 0 console-помилок/warnings.
**Деплой:** gh-pages → https://serhiidubei.github.io/playableads/akuma-no-yoru.html (замінив swipe-версію).
**Висновок:** генератор тепер робить і КЕРОВАНІ платформери (новий playableKind). makePlatformerBody — нова тестована цеглина. Помилку жанру виправлено в СХЕМІ (корінь), фікси — у контракті.
**Відкрито:** attack-kill підтверджено кодом (per-tick щедрий хітбокс), але не зміряно score у браузері (rAF-тротл+флапи Playwright); rAF тротлиться під час blocking evaluate — для тесту керованих ігор юзати hold-across-realtime + __state.

## Financial Foundation — стилізована «башта потреб» + виразніша фізика (2026-06-26) 🆕
**Зроблено:** `labs/financial-foundation/game.ts` — (1) ВЕЖА: замість майже однакових блоків (196/188×46, ±2px джиттер) ввів `TOWER_SPECS[]` — 5 боргів різної ширини/висоти (150–214 × 40–56), з вбудованим нахилом (`dx` ±11..22) та tilt (`rot` ±0.045..0.085). Широкі слеби віддані довгим лейблам (College Fund, Credit Cards) → текст лишається читабельним. Стек тепер кумулятивний (`bottomY` cursor) — блоки різної висоти стикуються з рівним GAP. `STACK_H`/`TOWER_N` рахуються зі специфікації. (2) ФІЗИКА: `wobbleTick` тепер рухає КОЖЕН блок незалежно — sway (амплітуда 3→15px росте догори) + tilt-wobble, кожен на власній частоті/фазі (`swayAmp/swayFreq/swayPh/rotAmp/rotPh`), масштабовані майстер-вобблом `k`. `MAX_AMP` піднято ×1.4→×1.75. Вежа жвавіша й «top-heavy», читається як готова впасти. (3) УСПІХ: блоки тепер вирівнюються і по `x`, і по `rotation`→0 (`back.out(1.5)`, stagger 0.04) — хитка купа миттю стає монолітною рівною колоною. `resetAll` відновлює rest-pose з `baseX/baseY/baseRot`.
**Перевірено:** `tsc --noEmit` — 0 помилок у financial-foundation (інші labs-ігри мали свої pre-existing TS6133, не торкав) · build OK 745.5KB/2MB (36.4%), validation OK · браузер (?dbg, mobile 375×812): воббл-фаза — блоки різних розмірів, нахилені під різними кутами зі зсувами, між кадрами рухаються незалежно (різні пози) → хитко/стилізовано; success — ідеально вирівняна центрована колона + золотий блок у слоті, "Foundation Secured!"; 0 console-помилок.
**AC закрито:** (1) башта стилізованіша + блоки різних розмірів → нестабільніший вигляд; (2) фізика рухів виразніша/нестабільніша перед вставкою блоку.
**Відкрито:** немає; візуальний контраст «хитка купа → монолітна основа» підсилено.

## Financial Foundation — арт-апгрейд: контекстні блоки + 3-станний фон + VFX (2026-06-26) 🆕
**Зроблено:** (A) БРИФ `styles/financial-foundation.brief.json` v1.0.0→1.1.0: +5 контекстних clay-блоків (block-mortgage/college/car/credit/groceries — pre-colored бари з ліпленою емблемою на лівому краю: дім/капелюх/авто/картка/сумка) +2 емоційні фони (bg-tension — темний моторошний з тривожним бурштином; bg-rescue — золотий сонячний промінь). (B) ГЕНЕРАЦІЯ: `run.ts` → 7 нових асетів gpt-image-1.5 (~$0.82, 54с, блоки ct=6 alpha / фони ct=2); `build-financial-foundation-assets.ts` → webp, total 275.6KB (бюджет 1.43MB). (C) `labs/financial-foundation/game.ts`: (1) `BLOCK_KEYS[]` — вежа тепер юзає bespoke спрайт на блок без тінту, лейбл зсунуто праворуч від емблеми (x=+0.13w, fit 0.78w). (2) Фон: 3 stacked full-viewport шари (calm база / tension / rescue), `setMood()` кросфейдить альфу на переходах FSM (start→calm, enterPause→tension, runSuccess→rescue), процедурний tint-overlay як фолбек. (3) VFX/PFX процедурні (zero-weight): `puff` (клейовий пил на base-joint при k>0.55 у воблі + при near-fall), `sparkleBurst` (star-particles на grab + на slot/колоні при успіху), `screenFlash` (білий relief-спалах), `buildMotes` (7 амбієнтних порошинок), золоте конфеті-дощ на успіху.
**Перевірено:** `tsc --noEmit` 0 ff-помилок · build OK 971KB/2MB (47.4%), validation OK · браузер (?dbg, mobile): WOBBLE — 5 блоків з емблемами (дім/картка/авто/капелюх/сумка), кожен у своєму кольорі, лейбли праворуч від іконки, calm-фон; PAUSE/near-fall — фон кросфейднув у темний tension, іскри+пил, вежа в критичному нахилі, золотий блок зʼявився; SUCCESS — фон розквітнув у золотий rescue, конфеті-дощ, вежа вирівняна в монолітну колону, "Foundation Secured!"; 0 console-помилок. Емблеми згенерувалися чисто й читабельно на дрібному блоці (всупереч ризику дрібної деталі).
**AC закрито:** (1) блоки стилізовані під контекст + більше ефектів; (2) фон змінний/динамічний — 3 емоційні стани (хитання→майже падіння→порятунок); (3) VFX/PFX додано де валідно (пил, іскри, конфеті, спалах, порошинки).
**Відкрито:** block-debt.webp лишився в assets/ але більше не юзається (нешкідливо, 24KB); за бажанням — AI-генерувати ще багатші блоки чи прибрати block-debt з брифу.

## Financial Foundation — 3 полірувальні апгрейди: преміальні блоки + idle-дихання + тонший фон (2026-06-26) 🆕
**Зроблено:** За запитом юзера — всі 3 запропоновані доробки. (1) ПРЕМІАЛЬНІ БЛОКИ: бриф v1.1.0→1.2.0, 5 блоків переписано багатшими промптами (детальніші ліплені емблеми: котедж із димарем/вікном, mortarboard із ґудзиком, авто з кабіною, картка з золотим чипом+смугою, паперова сумка з зеленню+фруктом) + `quality:high` overrides. Видалено старі PNG → регенеровано лише 5 (run.ts, ~$1.75, 6.5K tok кожен ct=6 vs ~1.9K medium). Оптимізовано webp, total 274KB. (2) IDLE-ДИХАННЯ (`game.ts`): `freezePose()` знімає позу на enterPause, `idleBreathTick()` у тікері додає лагідний живий тремор навколо неї поки вежа застигла на критичному нахилі (стани pause/drag), кожен блок на власній фазі, верхні тремтять сильніше — стек не виглядає мертво-замороженим поки гравець думає. (3) ТОНШИЙ КРОСФЕЙД ФОНУ: `moodTick()` у тікері — tension-фон наростає ПРОПОРЦІЙНО нахилу (wob.amp/MAX_AMP × 0.55) під час хитання замість різкого вмикання на паузі; enterPause доводить до повної напруги швидким 0.45с, success цвіте золотим градуально 1.15с.
**Перевірено:** `tsc` 0 ff-помилок · build OK 969KB/2MB (47.3%), validation OK · браузер (?dbg): WOBBLE — преміальні блоки чіткі, фон уже ледь потемнів (пропорційна напруга); PAUSE — фон повністю в tension, idle-тремор іде без помилок (вежа жива, не заморожена); SUCCESS — золоте цвітіння градуальне, блоки в рівній колоні з чіткими емблемами; 0 console-помилок.
**AC закрито:** всі 3 запропоновані покращення.
**Відкрито:** idle-тремор навмисно тонкий (±1.6px верх) — складно зловити на статик-скриншоті, але код коректний і без помилок; block-debt.webp досі unused.

## Financial Foundation — заповнення сцени + преміальний шрифт (2026-06-26) 🆕
**Зроблено:** За фідбеком юзера (багато пустого неба зверху + дешеві системні шрифти). (1) ЗАПОВНЕННЯ СЦЕНИ (`game.ts`): введено `TOWER_TOP=188` (раніше магічне 300) — вежа піднята вище; блоки збільшено (BW 196→214, BH 46→50, GAP 8→11, TOWER_SPECS w×~1.05 h×~1.18, STACK_H ~274→~330); платформа 300×46→340×52; hook 60→58, success-текст 250→120 (над новим верхом вежі), label fontSize 21→23, TRAY_Y 678→660; impulse-beam прив'язано до TOWER_TOP. Композиція тепер заповнює кадр: title→вежа→платформа, без мертвого неба. (2) ПРЕМІАЛЬНИЙ ШРИФТ: завантажено Baloo 2 (800, latin, 18.6KB woff2) у `src/assetgen/fonts/Baloo2-800-Latin.woff2` (округлий, тактильний — пасує claymation-арту + casual-cute мудборду брифа). Вшито base64 через `fontFace()` у HTML head (`build-financial-foundation.ts`, replace `</style>`), `styles/financial-foundation.json` font.family→`"Baloo 2", system-ui, Arial`, у `main()` додано `await document.fonts.load('800 30px "Baloo 2"')` перед рендером тексту (з 1.5с таймаут-фолбеком). Увесь текст гри — вага 800, тож одного woff2 досить.
**Перевірено:** `tsc` 0 ff-помилок · build OK 994KB/2MB (48.5%), validation OK · браузер: fonts.check('Baloo 2')=true; WOBBLE — вежа заповнює кадр, hook «Don't let it fall down.» в один рядок новим шрифтом, верх не порожній; SUCCESS — «Foundation Secured!» вище, насичена композиція; ENDCARD — CTA/headline округлим Baloo 2; 0 console-помилок. Прямо vs стартовий скрин: помітно повніше й преміальніше.
**AC закрито:** (1) сцена заскейлена/піднята — заповнено пусте місце зверху; (2) шрифт замінено на преміальний округлий, що пасує арту й контексту.
**Відкрито:** залишок місця внизу під платформою (ground — норм); block-debt.webp досі unused.

## Financial Foundation — фікс пікселізації країв (HiDPI resolution) (2026-06-26) 🆕
**Зроблено:** За фідбеком (зубчасті/пікселізовані краï об'єктів). Корінь — Pixi `Application.init` рендерив у `resolution:1`, а на retina/HiDPI-дисплеї канвас upscale-вся браузером → jaggies. `game.ts`: додано `resolution: Math.min(window.devicePixelRatio||1, 3)` + `autoDensity:true` в `app.init` (antialias вже був true). autoDensity тримає CSS-розмір логічним, тож уся layout-математика на `app.screen` лишилась без змін.
**Перевірено:** build OK, validation OK · браузер: dpr=2 → backing canvas 375×812→750×1624 (нативна щільність); краï блоків/тексту/емблем тепер чіткі й згладжені (WOBBLE + SUCCESS зняті); 0 console-помилок. Прямо vs скрин юзера — зубці зникли.
**AC закрито:** краï згладжено (HiDPI-рендер).
**Відкрито:** немає.

## Financial Foundation — реальні об'єкти + фізика зчленованого стека (2026-06-26) 🆕
**Зроблено:** За запитом юзера — (А) фізика руху вежі все ще «бажала кращого» + (Б) тестово перевести блоки-бруски в РЕАЛЬНІ об'єкти зі збереженням фізики, зробити привабливіше. (1) РЕАЛЬНІ ОБ'ЄКТИ: бриф +5 ключів `obj-house/college/car/credit/groceries` з промптами під клей-тойс зі стек-дизайном (пласка основа, повний об'єкт, центрований, transparent), `quality:high`, size 1024². Згенеровано (`run.ts`, 5 нових, skip існуючих, ~$0.90, ct=6 alpha), оптимізовано webp (640px, ~64-90KB). Об'єкти: будинок=іпотека, стос книг+магістерська шапка=коледж, авто=автокредит, стос карток=кредитки, паперова сумка з городиною=продукти. Старі block-*.webp (6 шт) прибрано з assets/ (не інлайняться). (2) ФІЗИКА — повна заміна шарів-синусів на ЗЧЛЕНОВАНИЙ ПРУЖИННИЙ СТЕК (`game.ts`): кожен об'єкт — сегмент ланцюга на шарнірі біля нижнього ребра; на кожному суглобі торсійна пружина до rest+lean, top-heavy ДЕстабілізуюча гравітація (sin(кут)·loadAbove — позитивний зворотний зв'язок: що більше нахил, то сильніше валиться = справжній тейтер), в'язке демпфування, випадковий драйв; sub-step ×3, кути клемпляться (±0.72). `applyPose()` обходить ланцюг від бази вгору → стек = одна фіз-зв'язана вежа. Одна симуляція на всі біти через gsap-твіни `phys{grav,noise,lean,rest,stiff,damp}`: build (grav46/noise22 наростають) → held near-fall (grav↓11, lean→1, легкий тремор) → success (grav0/noise0/rest→0/stiff150 — стек випрямляється у вертикальну колону). Прибрано `wobbleTick/freezePose/idleBreathTick/moodTick`, додано `physicsStep/applyPose/resetPhysics/moodDrive`. Геометрія: BW 214→156, GAP +11→−8 (об'єкти вкладаються в щільний стек), TOWER_OBJECTS під істинний аспект кожного спрайта (без сквошу), STACK_H ~408, платформа 340→250.
**Перевірено:** `tsc --noEmit` 0 ff-помилок · build OK 1331.9KB/2MB (65.0%), validation OK · браузер 390×844: (?dbg) WOBBLE — щільна вежа реальних клей-об'єктів тейтерить по кривій, фіз-нахил живий і органічний; PAUSE (normal) — драматичний near-fall нахил, tension-фон, золотий блок «Life Insurance» влетів у трей з glow, слот пульсує + рука-хінт; SUCCESS — стек чисто випрямляється у вертикальну колону, rescue-фон; ENDCARD — headline + золотий блок-герой + «Calculate My Coverage» CTA, secured-колона притлумлена ззаду; 0 console-помилок (ad_loaded→game_start→failsafe→foundation_secured). Об'єкти консистентні за клей-стилем і впізнавані.
**AC закрито:** (А) фізика — реалістичний зчленований тейтер замість механічної синусоїди; (Б) реальні об'єкти замість брусків зі збереженням і покращенням фізики, привабливіший дизайн.
**Відкрито:** прибрано підписи блоків (Mortgage/College...) — об'єкти впізнавані самі; за бажанням юзера можна повернути дрібні теги-підписи. block-*.webp лишились у out/ (для фолбеку), з assets/ прибрано. Чекаю human-checkpoint перед перепакуванням zip/комітом.

### ↳ ре-тюнінг фізики: нестабільність явно відчутна до вставки (2026-06-26)
**Зроблено:** За фідбеком — held-фаза раніше «паркувалась»: завмирала на нахилі з ледь помітним тремором. Тепер нестабільність явно й безперервно відчувається до моменту вставки Life Insurance. (1) ПЕР-СУГЛОБОВА ЖОРСТКІСТЬ `stiffMul[i]=1.5−i·0.13` — база тримається твердо, верхні суглоби пухкі → реалістичний top-heavy тейтер. (2) РЕКУРЕНТНІ NEAR-TOPPLE РИВКИ (`physicsStep`): кожні ~0.82–1.64с поштовх швидкості у верхні об'єкти переважно «в бік падіння» (72%), потім пружини відловлюють стек з краю; магнітуда масштабується `phys.grav/20` → ривки наростають крізь build-up і тримають напругу всю фазу очікування; на піку — creak + пил. (3) ЖИВІША HELD-ФАЗА: grav 11→23, noise 4→12, damp 6.4→4.6 (метастабільно — бореться з гравітацією, не падає). Build-up: grav 46→52, noise 22→26, damp→4.8, ease power2.in (різкіша ескалація).
**Перевірено:** `tsc` 0 ff-помилок · build OK 1331.9KB/2MB, validation OK · браузер 390×844: HELD — два кадри з інтервалом 1.3с показують ВИДИМО різні пози (сумка/авто/картки під різними кутами) → стек реально лурчить і відновлюється, не паркується; near-fall драматичний (верх перехилений вправо, база тримає); SUCCESS — чисто випрямляється у вертикальну колону з золотим блоком у слоті; 0 console-помилок.
**AC закрито:** фізика реалістичніша + нестабільність явно відчутна аж до вставки блока.

### ↳ читабельність тексту + камера ближче (заповнення кадру) + soft-wall (2026-06-26)
**Зроблено:** За фідбеком — (1) читабельність текстів і (2) забагато пустого місця зверху/знизу (камеру ближче/змінити FOV, але без вильоту вежі за екран при хитанні). (1) ТЕКСТИ: hook («Don't let it fall down.») — додано білий contour (stroke 4px) + м'яка тінь → читається і на calm (світлий), і на tension (темний слейт) фоні; success («Foundation Secured!») — золотий fill отримав темно-коричневий contour 6px + тінь → не зливається із золотим rescue-фоном. Усі макс-ширини тексту прив'язано до `TEXT_W=CONTENT_HALF_W*2−28` (~316), щоб не обрізались у вужчому кадрі (hook/success/headline). (2) КАМЕРА БЛИЖЧЕ: `layout()` тепер contain по CONTENT-боксу (`CONTENT_HALF_W=172`, `CONTENT_TOP=44`, `CONTENT_BOT=666`), центрованому на вежі, а не по всьому 400×720 канвасу → кадр заповнений, мертве небо/підлога мінімальні. (3) SOFT-WALL (`physicsStep`): обхід ланцюга рахує найширшу точку стека; якщо перевищує `LEAN_XMAX=150` — пропорційно підтягує всі суглоби назад → вежа лурчить/хитається скільки завгодно драматично, але НІКОЛИ не вилазить за межі кадру (margin 22px до CONTENT_HALF_W). Виміряно worst-case через тимчасовий `__ff.maxhw()` (DBG): held ~110–161 без стіни, зі стіною ≤150 у всіх фазах. Лін трохи побільшав (leanBias/grav/lurch підняті назад до драматичних, бо стіна тепер гарантує безпеку).
**Перевірено:** `tsc` 0 ff-помилок · build OK 1332.8KB/2MB (65.1%), validation OK · браузер 390×844: CALM — hook читабельний (білий contour), кадр заповнений; HELD — драматичний нахил вправо, верх біля краю але В межах (стіна тримає), hook чіткий на темному фоні; SUCCESS — «Foundation Secured!» повністю в кадрі, золото з темним contour читабельне; ENDCARD — headline + золотий блок-герой + «Calculate My Coverage» CTA + Replay, усе вміщається й читається; 0 console-помилок на всіх прогонах.
**AC закрито:** (1) усі тексти читабельні (contour/тінь під динамічний фон, ширини в межах кадру); (2) камера ближче — заповнено пусте місце зверху/знизу, при цьому soft-wall гарантує, що вежа при хитанні не вилазить за екран.
**Відкрито:** на дуже високих екранах (≈0.46) лишається помірний bg-gutter зверху/знизу (вежа займає всю ширину → ширино-обмежений масштаб; далі заповнювати лише коштом ще тоншого лину). `__ff.maxhw/reseths` лишив як QA-хелпери (тільки під ?dbg).

### ↳ безперервний бічний rock (без «зависань») + довший failsafe (2026-06-26)
**Зроблено:** За фідбеком — (1) wobble-вежа часто «зависала» на куті ніби вперлась і в стані спокою; (2) +2с до автовирішення. (1) ПОСТІЙНИЙ SWAY-ДРАЙВ (`game.ts`): додано `phys.sway` + `swayPhase` (advance `dt*SWAY_FREQ`, 2.5 rad/s) — у `physicsStep` кожен суглоб отримує безперервний осцилюючий момент `phys.sway*sin(swayPhase+i*0.5)*loadAbove` (хвиля, що біжить угору ланцюгом) → вежа ЗАВЖДИ рухається з боку в бік, ніколи не паркується. Твіни: build sway→8, held sway→13, success sway→0. Зменшено одно­бічність (leanBias 0.048→0.034, lurch-bias 0.72→0.58, held noise 12→9, damp 4.6→4.0) щоб гойдалась симетричніше, а не пінилась праворуч. (2) SOFT-WALL FIX: попередня оцінка ширини ігнорувала, що повернутий об'єкт виступає далі (`halfW*|cos|+halfH*|sin|`, rotated-AABB) — через це реальний рендер сягав 173 (>frame 172) і ледь кліпав. Виправлено формулу, `LEAN_XMAX 150→156`, `CONTENT_HALF_W 172→174`. (3) FAILSAFE: `manifest.autoPlayMs 6000→8000` (+2с до самовставки).
**Перевірено:** `tsc` 0 ff-помилок · build OK 1333KB/2MB (65.1%), validation OK · браузер 390×844 (?dbg): HELD — 3 кадри з інтервалами показують виразне гойдання право↔ліво (верх перетинає центр), стек НІКОЛИ не завмирає; `__ff.maxhw`=160.3 < frame 174 (margin ~14px, без кліпу); SUCCESS — sway→0, чиста вертикальна колона; 0 console-помилок. autoPlay тепер 8000ms.
**AC закрито:** (1) вежа завжди в русі з боку вбік до вставки insurance (зникли «зависання»); (2) +2с до автовирішення.
**Відкрито:** немає (sway тримається під soft-wall, стіна спрацьовує лише на рідкісних lurch-піках, тож без «биття об стіну»).

### ↳ балансування «на грані» плавною хвилею замість маятника-об-стіну (2026-06-26)
**Зроблено:** За фідбеком — рух виглядав як маятник, що б'ється від стінки до стінки (різкі удари + відскок), а не балансування на грані з плавною хвилею по тілу й відчуттям ваги. Діагноз: (а) lurch-ривки = буквальні поштовхи швидкості («різкі удари»); (б) soft-wall спрацьовував на піках (амплітуда впиралась у стіну → «відскок»). Виправлено: (1) ПРИБРАНО lurch-поштовхи зовсім — замість них лише тихий creak + пилинка на повільному таймері (відчуття натуги без ударів). (2) SWAY → ПЛАВНА ХВИЛЯ БАЛАНСУВАННЯ: `SWAY_FREQ 2.5→1.35` (повільно, вагомо); драйв = сума ДВОХ несумірних хвиль (`sin(φ+i·0.55)·0.72 + sin(0.63φ+i·0.85+2.1)·0.4`), що біжать угору ланцюгом з фазовим лагом → база зміщується, верх тягнеться слідом з вагою, усе тіло гойдається як одна хвиля; ніколи не повторюється як метроном. (3) АМПЛІТУДА ПІД СТІНОЮ: ключове відкриття — на низькій частоті зсув ∝ драйв/жорсткість, тож sway навіть 5-13 давав ~0.15 рад/суглоб і впирався в стіну; знижено до `sway 2.4`, `grav 9`, `damp 4.4` → стала амплітуда maxHW=125.7, entry-transient=108.9, обидва « стіни (156) і « кадру (174) → стіна НЕ спрацьовує, відскоків немає. Build пом'якшено (grav 16, sway 1.1). На екстремумах вежа плавно сповільнюється й розвертається (вага), а не відбивається.
**Перевірено:** `tsc` 0 ff-помилок · build OK 1332.9KB/2MB, validation OK · браузер 390×844 (?dbg): HELD — `__ff.maxhw` steady=125.7, entry=108.9 (« 156, стіна мовчить); кадри в часі показують плавну хвилю S-кривої, що перетікає тілом, м'які розвороти на краях, БЕЗ ривків і відскоків; SUCCESS — sway→0, чиста вертикальна колона; 0 console-помилок.
**AC закрито:** балансування «на грані» плавною хвилею по всьому тілу з відчуттям ваги; прибрано різкі удари та відскок від «стінки».
**Відкрито:** немає. (soft-wall лишається лише як аварійний запобіжник на ~30px вище за робочу амплітуду.)

### ↳ фікс «зависання» на ?dbg: dbg більше не вимикає автоплей (2026-06-26)
**Зроблено:** Юзер вдруге впіймав «застрягання» на стадії wobble («Don't let it fall down», блок не з'являється) — бо прев'ю лишалось на `?dbg`, а dbg-режим навмисно вимикав авто-enterPause+failsafe (для ручного кроку). Розділено прапори: `DBG=/dbg/` тепер дає ЛИШЕ console-хелпери `window.__ff` + maxhw-пробу, але ад АВТОПРОГРЕСУЄ як у проді; ручний крок (вимкнення автоплею) тепер вимагає окремого `?step`. Змінено 3 гейти DBG→MANUAL: idleTick-failsafe, success→endcard, start→enterPause. `__ff`-хуки й maxhw лишились на DBG. Тепер залишковий `?dbg` URL ніколи не виглядає «застряглим».
**Перевірено:** `tsc` 0 ff-помилок · build OK 1332.9KB/2MB, validation OK · браузер: `/?dbg` — за ~10с сам дійшов до `state=end` (ендкард, блок Life Insurance) БЕЗ ручного кроку; `/?dbg&step` — лишається `wobble` (ручне утримання для QA працює); 0 console-помилок.
**AC закрито:** жодна «дебаг»-адреса не блокує прогрес; проста адреса й `?dbg` обидві автоплеяться, `?step` — лише для ручного QA.
**Відкрито:** README-HANDOFF.md QA-секцію треба підправити при перепакуванні (тепер `?dbg`=автоплей+консоль, `?step`=ручний крок).
