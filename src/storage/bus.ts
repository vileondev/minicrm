/** Barramento mínimo: qualquer gravação avisa as views (sidebar, kanban, badges da lista). */
const listeners = new Set<() => void>();

export const onDataChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const emitDataChange = (): void => listeners.forEach((fn) => fn());
