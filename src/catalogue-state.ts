import { sections, type Section } from "./content";

export type CatalogueState = {
  selectedSections: Section[];
  search: string;
  index: number;
};

const storageKey = `pte:catalogue:${import.meta.env.BASE_URL}`;
const defaults = (): CatalogueState => ({
  selectedSections: sections.map((section) => section.id),
  search: "",
  index: 0,
});

// Only tab-local UI preferences: no answers, learner profile or URL search data.
export function readCatalogueState(): CatalogueState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      saved?.version === 1 &&
      Array.isArray(saved.selectedSections) &&
      saved.selectedSections.every((id: unknown) =>
        sections.some((section) => section.id === id),
      ) &&
      new Set(saved.selectedSections).size === saved.selectedSections.length &&
      typeof saved.search === "string" &&
      typeof saved.index === "number" &&
      Number.isSafeInteger(saved.index) &&
      saved.index >= 0
    )
      return {
        selectedSections: saved.selectedSections,
        search: saved.search,
        index: saved.index,
      };
  } catch {
    // Blocked storage and old/corrupt snapshots cannot prevent practice.
  }
  return defaults();
}

export function writeCatalogueState(state: CatalogueState) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ version: 1, ...state }),
    );
  } catch {
    // The live state remains usable when tab storage is unavailable or full.
  }
}
