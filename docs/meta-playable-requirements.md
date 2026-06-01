# Meta (Facebook/Instagram) Playable Ads — Технічні вимоги

> Джерело: офіційна документація Meta for Developers + Meta Business Help Center.
> Дата фіксації: 2026-06-01. Перевіряти періодично — Meta змінює специфікації.

## Формат та розмір файлу

| Тип | Ліміт |
|-----|-------|
| Single HTML file (`index.html`) | **≤ 2 MB** |
| `index.html` всередині zip | ≤ 2 MB |
| Zip-архів цілком | **≤ 5 MB**, **< 100 файлів** |

- **Один HTML-файл**: усі ассети (JS, CSS, зображення, звуки) інлайняться як **base64 / data URI** прямо в `index.html`.
- **Zip-формат**: `index.html` має лежати в корені архіву. Підтримується на всіх плейсментах iOS та Android.

## Обовʼязковий код

- **CTA**: при кліку по call-to-action ВИКЛИКАТИ `FbPlayableAd.onCTAClick()`.
  Meta перехоплює цей виклик і веде користувача в потрібний App Store / Google Play.
  ```js
  // На кнопці install / CTA:
  ctaButton.addEventListener('click', function () {
    FbPlayableAd.onCTAClick();
  });
  ```

## Заборони (часті причини реджекту)

- **Жодних JS-редиректів** — "One or more assets contains JavaScript redirect code".
- **Жодного зовнішнього мережевого завантаження** — не можна тягнути картинки/шрифти/скрипти по HTTP. Усе має бути інлайн.
- **Зовнішні JS-бібліотеки** — лише якщо вони мініфіковані та вшиті прямо в код (jQuery тощо не лінкувати з CDN).
- Антивірус може ловити false-positive → помилка "Unsupported HTML For Playable Ad".

## Плейсменти

- Facebook Stories
- Facebook Newsfeed
- Audience Network Interstitial
- Audience Network Rewarded
- Instagram Feed & Instagram Stories (через Placement Asset Customization)

## Обмеження кампанії

- **Objective**: тільки **App Installs**.
- Lead-in відео не показуються для Audience Network плейсментів.

## Орієнтація та розміри

- Vertical / Portrait — мастхев для mobile feed (рекомендовано **1080×1920**).
- Square та Landscape підтримуються для Audience Network.
- Креатив має підтримувати ресайз під різні плейсменти/орієнтації.

## Тестування

- iPad **не підтримується** для тесту playable — тестувати на мобільних.
- Перед запуском ганяти через Meta Playable Validator у Ads Manager.

## Практичні висновки для нашого тулчейну

1. **Бюджет 2 MB на single-file — найжорсткіше обмеження.** Усе (геймплей + ассети) має влізти після base64 (+~33% оверхед на кодування). Реальний бюджет «сирих» ассетів ≈ 1.4 MB.
2. Білдер ОБОВʼЯЗКОВО має:
   - інлайнити всі ассети в один HTML;
   - вставляти `FbPlayableAd.onCTAClick()` на CTA;
   - валідувати розмір та відсутність зовнішніх запитів/редиректів ПЕРЕД видачею.
3. Краще цілитись у single-file 2 MB (працює скрізь), а zip 5 MB тримати як запасний для важчих креативів.
