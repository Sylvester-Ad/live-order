import { Button } from "../../../components/ui/button";
import type { ProductOptionGroup } from "../../../lib/product-options";

type Props = {
  groups: ProductOptionGroup[];
  disabled?: boolean;
  onChange(groups: ProductOptionGroup[]): void;
};

function newGroup(): ProductOptionGroup {
  return { id: crypto.randomUUID(), name: "", choices: [""] };
}

export function ProductOptionsEditor({ groups, disabled = false, onChange }: Props) {
  return (
    <fieldset className="grid gap-4" disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">Product options (optional)</legend>
      <p className="text-sm text-ink-muted">
        Add choices such as sizes or colours. Choices do not have separate prices or stock.
      </p>
      {groups.map((group, groupIndex) => (
        <section className="rounded-panel border border-border bg-white p-4" key={group.id} aria-label={`Option group ${groupIndex + 1}`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-48 flex-1 gap-2 text-sm font-medium text-ink">
              Group name
              <input
                aria-label={`Option group ${groupIndex + 1} name`}
                className="min-h-11 rounded-control border border-border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                maxLength={50}
                onChange={(event) => onChange(groups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))}
                value={group.name}
              />
            </label>
            <Button
              onClick={() => onChange(groups.filter((item) => item.id !== group.id))}
              size="sm"
              type="button"
              variant="secondary"
            >
              Remove group
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {group.choices.map((choice, choiceIndex) => (
              <div className="flex items-end gap-3" key={`${group.id}-${choiceIndex}`}>
                <label className="grid flex-1 gap-2 text-sm font-medium text-ink">
                  Choice {choiceIndex + 1}
                  <input
                    aria-label={`${group.name || `Option group ${groupIndex + 1}`} choice ${choiceIndex + 1}`}
                    className="min-h-11 rounded-control border border-border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    maxLength={50}
                    onChange={(event) => onChange(groups.map((item) => item.id === group.id
                      ? { ...item, choices: item.choices.map((value, index) => index === choiceIndex ? event.target.value : value) }
                      : item))}
                    value={choice}
                  />
                </label>
                <Button
                  aria-label={`Remove choice ${choiceIndex + 1} from ${group.name || `option group ${groupIndex + 1}`}`}
                  onClick={() => onChange(groups.map((item) => item.id === group.id
                    ? { ...item, choices: item.choices.filter((_value, index) => index !== choiceIndex) }
                    : item))}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button
                onClick={() => onChange(groups.map((item) => item.id === group.id ? { ...item, choices: [...item.choices, ""] } : item))}
                size="sm"
                type="button"
                variant="secondary"
              >
                Add choice
              </Button>
            </div>
          </div>
        </section>
      ))}
      <div>
        <Button onClick={() => onChange([...groups, newGroup()])} size="sm" type="button" variant="secondary">
          Add option group
        </Button>
      </div>
    </fieldset>
  );
}
