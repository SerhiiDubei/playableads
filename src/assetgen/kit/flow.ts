// FLOW = блупринт ПЕРЕД розкладкою. Спершу з'ясовуємо: що екран робить (purpose),
// яка в нього механіка (mechanic) і КУДИ він веде (transitions). Лише потім креслимо сітку (recipe).
// validateFlow ловить биті переходи / недосяжні екрани / відсутність шляху до CTA.

export type Transition = { on: string; to: string }; // подія → екран ("CTA" = install/onCTAClick)

// scene = атмосфера/беат екрана → мапиться на обробку фону (не нова картинка, а світло/фокус)
export type Scene = "world" | "focus" | "celebration";

export interface ScreenSpec {
  id: string;
  purpose: string;        // функція екрана (нащо він)
  archetype: string;      // який зональний архетип кресити
  scene: Scene;           // атмосфера: world (продати світ) / focus (тихий фон під гру) / celebration (нагорода)
  mechanic?: string;      // інтерактивна механіка, якщо це гра (tap-to-attack, drag, match...)
  transitions: Transition[]; // взаємодія з іншими екранами
}

export type Flow = { entry: string; cta: string; screens: ScreenSpec[] };

export function validateFlow(f: Flow): string[] {
  const errs: string[] = [];
  const ids = new Set(f.screens.map((s) => s.id));
  if (!ids.has(f.entry)) errs.push(`entry "${f.entry}" не існує серед екранів`);
  if (!ids.has(f.cta)) errs.push(`cta-екран "${f.cta}" не існує`);

  for (const s of f.screens)
    for (const t of s.transitions)
      if (t.to !== "CTA" && !ids.has(t.to)) errs.push(`${s.id}: перехід "${t.on}" → неіснуючий екран "${t.to}"`);

  // досяжність з entry (BFS)
  const seen = new Set<string>([f.entry]);
  const q = [f.entry];
  while (q.length) {
    const id = q.shift();
    const sc = f.screens.find((s) => s.id === id);
    if (!sc) continue;
    for (const t of sc.transitions) if (t.to !== "CTA" && !seen.has(t.to)) { seen.add(t.to); q.push(t.to); }
  }
  for (const s of f.screens) if (!seen.has(s.id)) errs.push(`екран "${s.id}" недосяжний з entry "${f.entry}"`);

  // мусить існувати шлях до CTA (інакше плейабл не веде до інсталу)
  if (!f.screens.some((s) => s.transitions.some((t) => t.to === "CTA")))
    errs.push(`жоден екран не веде до CTA — немає install-дії`);

  // піклування про юзера: ігровий екран мусить мати тихий фон (scene:focus), щоб інтерактив читався
  for (const s of f.screens)
    if (s.mechanic && s.scene !== "focus")
      errs.push(`${s.id}: має механіку "${s.mechanic}", але scene="${s.scene}" — гра мусить бути scene:focus (фон не повинен конкурувати)`);

  return errs;
}

// ASCII-схема графа для блупринту (щоб «розкреслити» було видно текстом).
export function flowDiagram(f: Flow): string {
  const lines = [`entry: ${f.entry}   cta-screen: ${f.cta}`];
  for (const s of f.screens) {
    const tag = s.mechanic ? ` [🎮 ${s.mechanic}]` : "";
    lines.push(`• ${s.id} (scene:${s.scene})${tag} — ${s.purpose}`);
    for (const t of s.transitions) lines.push(`    —[${t.on}]→ ${t.to}`);
  }
  return lines.join("\n");
}
