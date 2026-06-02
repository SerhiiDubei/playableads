# Architecture v1 — цільовий pipeline з вшитими рішеннями (2026-06-02)

Глибше/ширше за `audit.md`: бере 10-кроковий маніфест-pipeline і **вшиває рішення сесії** (посилання `Qxx` → `brief-decisions.md`).
Статус коду: ✅ є · 🟨 частково · 🟥 нема.

```
[0 Brief] → [1 Context-fill] → [2 Plan: screen+flow] → [✋ approve plan]
   → [3 Component breakdown] → [4 Asset-gen (+cost gate)] → [5 Compose] → [6 Zones]
   → [7 Build single-file] → [8 Validate: zones+Meta] → [9 Visual tests] → файл
        ▲ human-in-the-loop на кожному майлстоуні; перебити будь-коли; overpush ▲
```

---

## Наскрізні шари (діють на всіх кроках)

| Шар | Рішення | Код |
|---|---|---|
| **Два режими** `dev` / `user` | dev = код+довчання+порушення правил; user(дизайнер) = без коду, інпут+правки в межах конструктора (Q14) | 🟥 |
| **Human-in-the-loop** | майлстоуни з approve; перебити будь-коли (Q10); невпевненість→питати (Q30); червона **overpush** «роби з того що маєш» | 🟥 |
| **Інтерактивний viewport / мокап** | грейбокс-перегляд: агент показує що додав, об'єкти рухомі/масштабовані без зміни механіки (Q14,Q29; S1) | 🟨 (є fixed-stage 400×860, нема редактора) |
| **Версіонування + відкат** | усе версіюється; нетригерний відкат до попередньої версії (Q25) | 🟨 (версія лише в `StyleBrief`) |
| **Cost-awareness** | prediction вартості перед asset-gen, свідоме підтвердження (Q32); зберігати невдачі для debug (Q35) | 🟨 (є cost-tracking post-factum) |
| **Critics — відкладені** | style/semantic critic НЕ зараз, щоб не роздувати pipeline; можливо паралельні агенти потім (Q20,Q43) | 🟥 (свідомо) |

---

## Кроки pipeline

### 0. Brief stage 🟥 (Епік B, P0)
Вхід дизайнера: продукт+куди ведемо / теза / ідеї+файли / опц.референс (Q06). **fast-flow vs deep-flow** (Q21). Поле-інпут **на всіх етапах** + перетяг референсів (Q24). Обов'язкові: **промт + реферальні зображення**; «жовті» поля з ворнінгом (Q09,Q22). Фінал: **summarize-agent** → топ-3 рішення + поле-інпут + **«суперкнопка» фіналізації** + розкладка механік (Q06). User-brief версіонується (Q25).
*Гап:* немає User-Brief як сутності; є лише `StyleBrief`. Спершу зняти дубль онтології «Brief».

### 1. Context-fill agent 🟥 (Епік I, P1)
Дозаповнює відсутнє (ЦА/ніша/tone/конкуренти) — «збігати почитати про нішу» (Q08).

### 2. Planning: screen + flow 🟥 (Епік C, P0)
**Механіка диктує базу екранів** + код (Q28); довжина — тільки час, 30с не фіксуємо, базово 10-15с + поле експериментів (Q27); 1-екран…15-екран (Q26). Planner невпевнений → питає (Q30).
*Звʼязок із кодом:* у нас уже є `kit/flow.ts` (на session-гілці) — purpose/scene/mechanic/transitions + `validateFlow`. Кандидат на ядро цього кроку.

### ✋ Approve plan 🟥 (Епік C)
Plan **редагований ДО asset-gen** через UI — показати що саме згенерується (прототипний підхід, Q29).

### 3. Component breakdown 🟨 (Епік D, P0)
Динамічна розбивка (зараз — фіксовані 13 kit-ключів). Механіки = **методи/функції**, комбінуються (Q13). Опис — **гібрид scaffold+AI-fill** (Q14). Каталог поповнює розробник кодом + **bucket із сесій** (Q15). 10 механік у v1, необмежено архітектурно (Q11).

### 4. Asset generation ✅🟨 (Епік F, P1)
**gpt-image-1.5** лишаємо (Q31). **Cost-prediction gate** перед gen (Q32). Fail ×3 → **перерендер з модифікованим промтом** (Q33). Невдачі → debug-сховище (Q35). Редагування — повний toolkit (Q34).
*Є:* `run.ts` (retry/skip/cost), `compose.ts` (IP-anchor+isolation). *Гап:* cost-gate UI, retry-modified-prompt, edit-toolkit, fail-store.

### 5. Composition ✅ (Епік D/E)
kit (single source) + groups/recipes (session-гілка). Стиль ↔ механіка **незалежні** (Q19); guard-tips механіки докидаються параметрами.

### 6. Zones ✅🟨 (Епік G, P1)
`BASE ⊕ ARCHETYPE` (`ZoneSpec`), primary CTA → thumb-зона, overlay. Прапор **`experimental`** для порушень (Q37). **Variability:** 1 асет → 20 варіацій → human-feedback → база знань (Q39). Непорушні правила — **з тестів** (Q36 🟥).

### 7. Build single-file ✅
Інлайн усього, base64, `FbPlayableAd.onCTAClick()`. (`build/inliner`, `bundler`).

### 8. Validate ✅ (Епік H, P2)
**Meta-gate лишаємо:** розмір + CTA + no-redirect/no-external (Q41). **No fail-with-warning** (Q44). Lint зон (6 hard + 6 soft) — `layouts/lint.ts`. Animation: GSAP + AI-SVG, тест ваги (Q38).

### 9. Visual regression ✅🟥
8 viewports + zone-assertions (`visual-test.ts`, на session-гілці — авто-визначення екранів). **Коли запускати — Q42 відкрито** (треба пояснити політику: always-before-output vs CI).

---

## Метрики й цілі
- **Головна метрика — автономна якість** (Q04); вторинні: час ідея→файл, install-rate, варіації.
- **Пропускна:** 20-100 playable/тиждень (Q03).
- **Через рік:** майже 100% автономна 0→файл (Q01,Q50).

## Відкриті архітектурні рішення
- Multi-agent vs single-model оркестрація (Q47).
- UI-пріоритет (Q48), open vs closed (Q49).
- Точна семантика visual-regression / semantic-critic (Q42,Q43).
- Зняти напругу «фабрика vs інструмент» (Q01 vs Q05): v1 = інструмент із сильними defaults.
