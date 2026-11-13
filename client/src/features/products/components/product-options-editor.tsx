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
      <div className="grid gap-1 text-sm text-ink-muted">
        <p><span className="font-semibold text-ink">Option group:</span> the question customers answer, such as Colour.</p>
        <p><span className="font-semibold text-ink">Choices:</span> the answers they can pick, such as Black, White, Red, or Blue.</p>
        <p>Customers choose one answer from each group. Stock is shared across all choices.</p>
      </div>
      {groups.map((group, groupIndex) => (
        <section className="rounded-panel border border-border bg-white p-4" key={group.id} aria-label={`Option group ${groupIndex + 1}`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-48 flex-1 gap-2 text-sm font-medium text-ink">
              Option group name
              <input
                aria-label={`Option group ${groupIndex + 1} name`}
                className="min-h-11 rounded-control border border-border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                maxLength={50}
                onChange={(event) => onChange(groups.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))}
                placeholder="e.g. Colour"
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                    placeholder={choiceIndex === 0 ? "e.g. Black" : "Another choice"}
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
                Add another choice
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
      <section aria-label="Customer option preview" className="grid gap-2 rounded-panel border border-border bg-canvas p-4">
        <h3 className="text-sm font-bold text-ink">Preview of customer choices</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-muted">No options added. Customers will order this product without choosing a variation.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {groups.map((group, groupIndex) => {
              const choices = group.choices.map((choice) => choice.trim()).filter(Boolean);
              return (
                <li className="min-w-0" key={group.id}>
                  <p className="text-sm font-semibold text-ink">{group.name.trim() || `Option group ${groupIndex + 1}`}</p>
                  {choices.length > 0
                    ? <p className="mt-1 break-words text-sm text-ink-muted">{choices.join(" · ")}</p>
                    : <p className="mt-1 text-sm text-ink-muted">Add at least one choice.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </fieldset>
  );
}
