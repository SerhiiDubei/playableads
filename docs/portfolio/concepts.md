# Portfolio · 9 Playable Concepts (Meta, EN markets)

Згенеровано мульти-агентним пайплайном: 4 ресерчери (3 вертикалі + Meta-комплаєнс) →
18 гіпотез → 54 адверсаріальні вердикти (compliance / engagement / feasibility) →
синтез з застосованими фіксами. Повні специфікації: [portfolio.json](portfolio.json),
повний ресерч: [research-full.json](research-full.json).

| # | Vertical | ID | Brand | Mechanic | Input | Donor |
|---|---|---|---|---|---|---|
| 1 | nutra | slice-your-spark-smoothie | **Zestful** | Fruit-Ninja слайсер → склянка енергії | swipe | fruit-ninja-gen v8 |
| 2 | nutra | routine-tower-stack | **Habistack** | Кран-вежа звичок (2/5 пре-стек) | tap | mad-mage-tower |
| 3 | insurance/home | home-kitchen-hotspot-stamp | **HavenNest Home** | Hotspot-інспекція кухні, штампи COVERED | tap | dream-floor scaffold |
| 4 | house | power-wash-patio-reveal | **HydroHaven** | Power-wash clean-reveal (stamp-mask) | swipe | new stamp-mask engine |
| 5 | insurance/health | health-planmatch-30s-quiz | **ClearPath Plans** | Квіз 3 питання + profile-tray | pick | fix-the-floor FSM |
| 6 | nutra | greens-catch-glass | **Brimful** | Лови інгредієнти склянкою | drag | fruit-ninja-gen spawn |
| 7 | house | budget-slider-bath-morph | **RenoScope** | Бюджет-слайдер $6K→$25K live-морф | slider | fix-the-floor + dream-floor drag |
| 8 | house | dream-kitchen-three-picks | **DreamSlate Kitchens** | Конфігуратор кухні за 3 вибори | pick | dream-floor FSM |
| 9 | insurance/life | life-umbrella-drag-catch | **Evergreen Life** | Drag-парасоля над сім'єю | drag | hand-build + makeArc |

## Ключові комплаєнс-інваріанти (вшиті у специфікації)

- **Nutra:** жодних body-transformation, before/after тіл, negative self-perception;
  FDA-дисклеймер на endcard читабельним кеглем; знижка — легальна винагорода замість result-claims;
  бейджі заморожені як назви інгредієнтів (boost/immunity/detox/burn заборонені); 18+.
- **Insurance:** TPMO-дисклеймер дослівно (health); «TYPICALLY COVERED» з кваліфікатором (home);
  без псевдо-урядової стилістики (жодних печаток/орлів/червоно-синьої гами); Financial/Housing SAC
  зафіксовані в чеклістах запуску; «Licensed agents in [State]» — лише з доказами.
- **House:** Housing SAC; estimates марковані «est.»; verified-only слоти для цифр
  (рейтинги/кількість ремонтів рендеряться лише з дзеркалом на лендінгу).
- **Усі:** перші 3с — стимул без тексту; rigged-easy чесний (ширше вікно, не autocomplete);
  кожен видимий об'єкт реагує на інпут; endcard Continue-framed з ≥2 верифікованими Cialdini-слотами;
  працює muted; CTA в thumb-зоні ≥44px.

## Build-процес на креатив

spec → `labs/<id>/{manifest.json, game.ts}` + `styles/<id>.json` →
`npx tsx src/assetgen/build-lab.ts <id>` → Meta-validate →
`node tools/qa-lab.mjs <id>` (Playwright 375/393px + console errors + скріншоти) →
ітерації до зеленого → AI-asset pass (gpt-image-1.5) → фінальний build → gh-pages.
