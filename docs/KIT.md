# Kit Bible — компоненти + групи

> Згенеровано з `kit/catalog.ts` + `kit/groups.ts` (`npm run catalog`). Не редагувати вручну.

## Компоненти (цеглинки)

Шар (`layer`): `background` = рамка лежить ПІД контентом; `content` = над. Це і є «рухати взад/перед».

| id | родина | що це | kind | resizable | layer | слоти | рівні | ассети |
|---|---|---|---|---|---|---|---|---|
| `button` | action | Інтерактивна кнопка-дія. Рамка тягнеться 9-slice під будь-яку ширину, лейбл — поверх. | nine-slice | так | background | label | primary/default/tertiary | btn-frame |
| `panel` | container | Контейнер-підкладка під вкладений контент (статистика, картки, списки). | nine-slice | так | background | children | — | panel-frame |
| `bar` | indicator | Прогрес/смуга (HP, XP, gauge). Трек 9-slice + fill-шар поверх. | nine-slice | так | background | fill, value | — | bar-track |
| `pill` | display | Компактний бейдж «іконка + значення» (валюта, лічильник). Зазвичай read-only. | nine-slice | так | background | icon, value | — | panel-frame |
| `banner` | media | Заголовок-стрічка: арт-банер + текст поверх писемної смуги (локалізовний). | text-overlay | ні | content | label | — | banner |
| `iconBtn` | action | Квадратна іконка-дія (back, settings, sound, plus, check, close). | fixed | ні | content | icon | — | ic-back, ic-settings, ic-sound, ic-plus, ic-check, ic-close |
| `avatar` | media | Портрет у рамці: кругле фото героя + декоративна рамка поверх. | composite | ні | composite | portrait | — | avatar-frame |
| `text` | display | Текстовий заголовок екрана (без асету, лише стиль). Легкий, локалізовний. | text-overlay | так | content | label | — |  |
| `hero` | media | Велике зображення героя/персонажа на сцені (background-шар сцени). | fixed | ні | background | image | — | hero |
| `stepper` | indicator | Індикатор прогресу рівнів/кроків (• • •). Показує, де гравець у послідовності. | text-overlay | так | content | dots, current | — |  |
| `toast` | display | Транзитна плашка-фідбек («Level Complete», «Wrong!»). Сама з'являється і зникає. | text-overlay | так | overlay | label | — |  |

### Як генерувати асети (рецепт на компонент)

**button** (360px) — _ornate fantasy UI button frame, horizontal, empty center for text_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - 9-slice safe margins: незмінні кути, тягнеться середина
  - порожній центр (текст накладається кодом)
  - ⚠️ Рівні: primary (більший+glow), default, tertiary (приглушений). Текст НЕ запікати в арт.

**panel** (320px) — _fantasy UI panel/parchment frame, empty interior_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - 9-slice, товсті незмінні кути
  - нейтральний порожній центр
  - ⚠️ Background-шар: усе вкладене лягає поверх. Сам нічого не клікає.

**bar** (360px) — _fantasy UI progress bar track, empty groove_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - 9-slice горизонтальний трек
  - порожня канавка під fill

**banner** (340px) — _fantasy title ribbon/banner, blank writable band in center_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - порожня писемна смуга по центру (titleY рахується з арту)
  - горизонтальний, симетричний
  - ⚠️ Текст накладається кодом на titleY — не запікати назву гри в картинку.

**iconBtn** (96px) — _single fantasy UI icon glyph in round frame_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - впізнаваний силует, читається на 48px

**hero** (520px) — _full-body fantasy hero, heroic pose_
  - gpt-image-1.5, transparent PNG (native alpha)
  - isolated single object, nothing else in frame
  - symmetric vertically + horizontally (центрування тексту залежить від цього)
  - IP-anchor: назвати референс-гру
  - contain, центрований, тінь додається кодом
  - ⚠️ Не kit-функція, а media-хелпер у білдері (div з background-image).

## Групи (сім'ї елементів + правила)

Зона каже ДЕ; група каже ХТО і ЗА ЯКИМИ ПРАВИЛАМИ. Композитор валідує ці правила.

| група | що це | компонент | зони | max | рівень | intent | read-only |
|---|---|---|---|---|---|---|---|
| `nav` | Навігація: back/close. Завжди в HUD, приглушена, повертає назад. | icon | hud | 2 | tertiary | navigate | — |
| `currency` | Валюта/лічильники (золото, гем). HUD, read-only. | pill | hud | 3 | default | display | так |
| `heading` | Текстовий заголовок екрана (легкий, для коротких title-зон). | text | title | 1 | default | display | — |
| `logo` | Банер-лого (важкий арт-ribbon). Лише у високих title-зонах (menu). | banner | title | 1 | default | display | — |
| `hero` | Герой/персонаж на сцені. Зона stage, background-шар. | hero | stage | 1 | default | display | — |
| `offers` | Товари магазину (buy ×N). Зона stage, кожен default з ціною. | btn | stage | 6 | default | purchase | — |
| `menu` | Пункти головного меню. Зона actions, один primary. | btn | actions | 6 | default | navigate | — |
| `checkout` | Головна дія екрана (Buy/Claim/Install). Зона actions, ОДИН primary у thumb. | btn | actions | 2 | primary | claim | — |
| `target` | Ігровий тап-об'єкт (ворог/ціль). У stage. Це primary-дія геймплею (не кнопка). | hero | stage | 1 | primary | play | — |
| `gauge` | Живий індикатор (HP/прогрес гри). Оновлюється кодом. read-only. | bar | hud/title/actions/stage | 2 | default | display | так |
| `slots` | Цілі для з'єднання (сокети/гнізда). У stage, display. Куди тягнути pieces. | hero | stage | 6 | default | display | — |
| `pieces` | Перетягувані фішки (гема/штекери). play-група — головна дія drag-гри. | hero | stage | 6 | default | play | — |
| `progress` | Індикатор рівнів/кроків (• • •). Показує прогрес у послідовності. | stepper | hud/title | 1 | default | display | так |

### Глобальні правила екрана

- Рівно **1 primary** на екран, і він — у зоні `actions` (thumb-зона).
- Група лягає лише у свої дозволені зони.
- `read-only` групи не мають `onclick`.
- Кількість елементів у групі ≤ `max`.
