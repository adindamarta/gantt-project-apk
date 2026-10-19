import type { Dependency } from '../types';

const adjacency = (deps: Dependency[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const d of deps) {
    const list = map.get(d.predecessorId) ?? [];
    list.push(d.successorId);
    map.set(d.predecessorId, list);
  }
  return map;
};

/** Apakah `start` dapat mencapai `target` lewat graf ketergantungan? */
export function canReach(deps: Dependency[], start: string, target: string): boolean {
  const graph = adjacency(deps);
  const stack = [start];
  const seen = new Set<string>();
  let guard = 0;
  while (stack.length > 0 && guard < 50_000) {
    guard += 1;
    const node = stack.pop() as string;
    if (node === target && node !== start) return true;
    for (const next of graph.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return false;
}

/**
 * Menambahkan sisi predecessor -> successor akan membentuk siklus
 * bila successor sudah dapat mencapai predecessor.
 */
export function wouldCreateCycle(
  deps: Dependency[],
  predecessorId: string,
  successorId: string,
): boolean {
  if (predecessorId === successorId) return true;
  return canReach(deps, successorId, predecessorId);
}

/** Cari siklus pertama yang ditemukan (untuk peringatan di UI). */
export function findCycle(deps: Dependency[]): string[] | null {
  const graph = adjacency(deps);
  const stateMap = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];

  const visit = (node: string): string[] | null => {
    const status = stateMap.get(node) ?? 0;
    if (status === 1) {
      const at = path.indexOf(node);
      return path.slice(at >= 0 ? at : 0);
    }
    if (status === 2) return null;
    stateMap.set(node, 1);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      const found = visit(next);
      if (found) return found;
    }
    path.pop();
    stateMap.set(node, 2);
    return null;
  };

  const nodes = new Set<string>();
  for (const d of deps) {
    nodes.add(d.predecessorId);
    nodes.add(d.successorId);
  }
  for (const node of nodes) {
    if ((stateMap.get(node) ?? 0) !== 0) continue;
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
