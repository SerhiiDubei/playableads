// Генерує docs/KIT.md з CATALOG + GROUPS — людиночитний/агентночитний опис бібли.
// Запуск: npm run catalog. Єдине джерело правди = catalog.ts / groups.ts (тут лише рендер у markdown).
import { writeFileSync, mkdirSync } from "node:fs";
import { CATALOG } from "./kit/catalog.js";
import { GROUPS } from "./kit/groups.js";

function md(): string {
  const L: string[] = [];
  L.push("# Kit Bible — компоненти + групи\n");
  L.push("> Згенеровано з `kit/catalog.ts` + `kit/groups.ts` (`npm run catalog`). Не редагувати вручну.\n");

  L.push("## Компоненти (цеглинки)\n");
  L.push("Шар (`layer`): `background` = рамка лежить ПІД контентом; `content` = над. Це і є «рухати взад/перед».\n");
  L.push("| id | родина | що це | kind | resizable | layer | слоти | рівні | ассети |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const c of Object.values(CATALOG)) {
    L.push(`| \`${c.id}\` | ${c.family} | ${c.summary} | ${c.kind} | ${c.resizable ? "так" : "ні"} | ${c.layer} | ${c.slots.join(", ")} | ${(c.levels ?? ["—"]).join("/")} | ${c.assets.join(", ")} |`);
  }
  L.push("");

  L.push("### Як генерувати асети (рецепт на компонент)\n");
  for (const c of Object.values(CATALOG)) {
    if (!c.gen) continue;
    L.push(`**${c.id}** (${c.gen.size}px) — _${c.gen.prompt}_`);
    for (const k of c.gen.constraints) L.push(`  - ${k}`);
    if (c.notes) L.push(`  - ⚠️ ${c.notes}`);
    L.push("");
  }

  L.push("## Групи (сім'ї елементів + правила)\n");
  L.push("Зона каже ДЕ; група каже ХТО і ЗА ЯКИМИ ПРАВИЛАМИ. Композитор валідує ці правила.\n");
  L.push("| група | що це | компонент | зони | max | рівень | intent | read-only |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const g of Object.values(GROUPS)) {
    L.push(`| \`${g.id}\` | ${g.summary} | ${g.component} | ${g.zones.join("/")} | ${g.max} | ${g.level} | ${g.intent} | ${g.readonly ? "так" : "—"} |`);
  }
  L.push("");
  L.push("### Глобальні правила екрана\n");
  L.push("- Рівно **1 primary** на екран, і він — у зоні `actions` (thumb-зона).");
  L.push("- Група лягає лише у свої дозволені зони.");
  L.push("- `read-only` групи не мають `onclick`.");
  L.push("- Кількість елементів у групі ≤ `max`.");
  return L.join("\n") + "\n";
}

mkdirSync("docs", { recursive: true });
writeFileSync("docs/KIT.md", md());
console.log(`-> docs/KIT.md (${Object.keys(CATALOG).length} компонентів, ${Object.keys(GROUPS).length} груп)`);
