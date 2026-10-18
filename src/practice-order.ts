import type { Question } from "./content";

type HistoryPlan = { questionIds: readonly string[] };

/** Copy before shuffling: authored content, option indices and saved plans stay intact. */
export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function variedPool(
  pool: readonly Question[],
  history: readonly HistoryPlan[] = [],
  random = Math.random,
): Question[] {
  const result = shuffled(pool, random);
  if (result.length < 2) return result;
  const ids = new Set(result.map((q) => q.id));
  // History is newest first. Reuse its actual plan order, not a new tracking key.
  const previous = history
    .find((attempt) => attempt.questionIds.some((id) => ids.has(id)))
    ?.questionIds.find((id) => ids.has(id));
  if (result[0].id === previous) {
    const other = 1 + Math.floor(random() * (result.length - 1));
    [result[0], result[other]] = [result[other], result[0]];
  }
  return result;
}

/** Keep every task/section slot; vary the authored variants within each task type. */
export function variedPracticeOrder(
  plan: readonly Question[],
  history: readonly HistoryPlan[] = [],
  random = Math.random,
): Question[] {
  const pools = new Map<string, Question[]>();
  for (const question of plan) {
    const pool = pools.get(question.type) ?? [];
    pool.push(question);
    pools.set(question.type, pool);
  }
  const orders = new Map(
    [...pools].map(([type, pool]) => [type, variedPool(pool, history, random)]),
  );
  const positions = new Map<string, number>();
  return plan.map((question) => {
    const index = positions.get(question.type) ?? 0;
    positions.set(question.type, index + 1);
    return orders.get(question.type)![index];
  });
}
