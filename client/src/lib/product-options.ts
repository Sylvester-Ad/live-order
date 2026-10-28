export type ProductOptionGroup = {
  id: string;
  name: string;
  choices: string[];
};

export type ProductOptions = Record<string, string[]>;

export type ProductOptionsParseResult =
  | { ok: true; value: ProductOptions }
  | { ok: false; message: string };

export function readProductOptionGroups(options: unknown):
  | { supported: true; groups: ProductOptionGroup[] }
  | { supported: false } {
  if (options == null) return { supported: true, groups: [] };
  if (typeof options !== "object" || Array.isArray(options)) return { supported: false };

  const groups: ProductOptionGroup[] = [];
  for (const [index, [name, choices]] of Object.entries(options).entries()) {
    if (!Array.isArray(choices) || !choices.every((choice) => typeof choice === "string")) {
      return { supported: false };
    }
    groups.push({ id: `option-${index}`, name, choices: [...choices] });
  }
  return { supported: true, groups };
}

export function parseProductOptions(groups: ProductOptionGroup[]): ProductOptionsParseResult {
  const result: ProductOptions = {};
  const groupNames = new Set<string>();

  for (const group of groups) {
    const name = group.name.trim();
    if (!name) return { ok: false, message: "Enter a name for every option group." };
    const normalizedName = name.toLocaleLowerCase();
    if (groupNames.has(normalizedName)) {
      return { ok: false, message: "Option group names must be unique." };
    }
    groupNames.add(normalizedName);

    if (group.choices.length === 0) {
      return { ok: false, message: `Add at least one choice to ${name}.` };
    }

    const choices: string[] = [];
    const normalizedChoices = new Set<string>();
    for (const rawChoice of group.choices) {
      const choice = rawChoice.trim();
      if (!choice) return { ok: false, message: `Complete or remove each choice in ${name}.` };
      const normalizedChoice = choice.toLocaleLowerCase();
      if (normalizedChoices.has(normalizedChoice)) {
        return { ok: false, message: `Choices in ${name} must be unique.` };
      }
      normalizedChoices.add(normalizedChoice);
      choices.push(choice);
    }

    Object.defineProperty(result, name, {
      configurable: true,
      enumerable: true,
      value: choices,
      writable: true,
    });
  }

  return { ok: true, value: result };
}
