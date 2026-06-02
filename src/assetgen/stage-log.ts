/**
 * Lightweight pipeline-stage logger.
 *
 * Чому це окремий модуль:
 * Хочемо бачити в реальному часі ЯКА стадія pipeline зараз працює і скільки
 * займає. Усі рядки проходять через одну функцію `formatStage()` (нижче) —
 * формат лога тюниться в одному місці, без розкиданих console.log по коду.
 */

const t0 = Date.now();

export type StageEvent = {
  /** ms від першого імпорту модуля */
  elapsedMs: number;
  /** до якої фази pipeline належить стадія */
  phase: "gen" | "build" | "validate" | "write" | "summary";
  /** дот-нотація стадії, напр. "load.btn-frame" або "compose.html" */
  stage: string;
  /** тривалість цієї стадії в ms (якщо була виміряна через timed()) */
  durationMs?: number;
  /** розмір output цієї стадії в байтах, якщо доречно */
  bytes?: number;
  /** будь-яка додаткова інфа (шлях файлу, лічильник, тощо) */
  note?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
//                              USER ZONE
// ─────────────────────────────────────────────────────────────────────────────
// Тут ти вирішуєш ЯК виглядає кожен рядок лога. Поверни рядок який буде
// надрукований через console.log. У тебе є все в `ev`:
//   ev.elapsedMs   — ms від старту (число)
//   ev.phase       — "gen" | "build" | "validate" | "write" | "summary"
//   ev.stage       — текстова стадія, напр. "load.bg" або "validate"
//   ev.durationMs? — скільки тривала ця стадія (опційно)
//   ev.bytes?      — розмір output (опційно)
//   ev.note?       — пояснення (опційно)
//
// Можна:
//   • використати ANSI: \x1b[36m (cyan), \x1b[32m (green), \x1b[33m (yellow),
//     \x1b[35m (magenta), \x1b[90m (grey), \x1b[1m (bold), \x1b[0m (reset)
//   • індентувати за phase або за крапками в stage
//   • конвертувати ms→s, bytes→KB
//   • показувати/ховати note
//
// Зараз стоїть тимчасовий дефолт. Перепиши на свій смак (5-10 рядків).
export function formatStage(ev: StageEvent): string {
  const C = { reset: "\x1b[0m", grey: "\x1b[90m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", magenta: "\x1b[35m", bold: "\x1b[1m" };
  const phaseColor: Record<string, string> = { gen: C.magenta, build: C.cyan, validate: C.yellow, write: C.green, summary: C.bold };
  const time = `${C.grey}[${(ev.elapsedMs / 1000).toFixed(2)}s]${C.reset}`;
  const phase = `${phaseColor[ev.phase] ?? ""}${ev.phase.padEnd(8)}${C.reset}`;
  const dur = ev.durationMs != null ? ` ${C.grey}${String(ev.durationMs).padStart(5)}ms${C.reset}` : " ".repeat(8);
  const size = ev.bytes != null ? ` ${C.green}${(ev.bytes / 1024).toFixed(1).padStart(7)}KB${C.reset}` : " ".repeat(10);
  const note = ev.note ? ` ${C.grey}— ${ev.note}${C.reset}` : "";
  return `${time} ${phase} ${ev.stage.padEnd(28)}${dur}${size}${note}`;
}
// ─────────────────────────────────────────────────────────────────────────────

export const events: StageEvent[] = [];

/** Залогувати миттєву подію (без тривалості) — старт фази, мітка, нотатка. */
export function logStage(
  phase: StageEvent["phase"],
  stage: string,
  opts: { durationMs?: number; bytes?: number; note?: string } = {}
): void {
  const ev: StageEvent = { elapsedMs: Date.now() - t0, phase, stage, ...opts };
  events.push(ev);
  console.log(formatStage(ev));
}

/** Виміряти async-блок і автоматично залогувати тривалість. */
export async function timed<T>(
  phase: StageEvent["phase"],
  stage: string,
  fn: () => Promise<T> | T,
  extras?: { bytesFromResult?: (r: T) => number; note?: string }
): Promise<T> {
  const start = Date.now();
  const r = await fn();
  logStage(phase, stage, {
    durationMs: Date.now() - start,
    bytes: extras?.bytesFromResult?.(r),
    note: extras?.note,
  });
  return r;
}

/** Сума по фазах для фінального звіту. */
export function summary(): { totalMs: number; byPhase: Record<string, number> } {
  const totalMs = events.length ? events[events.length - 1].elapsedMs : 0;
  const byPhase: Record<string, number> = {};
  for (const e of events) {
    if (e.durationMs != null) byPhase[e.phase] = (byPhase[e.phase] ?? 0) + e.durationMs;
  }
  return { totalMs, byPhase };
}
