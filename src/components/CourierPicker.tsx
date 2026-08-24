/**
 * Choosing a courier, in the one place both screens get it from.
 *
 * Two forms ask: an admin dispatching an order to a customer, and a supplier
 * in the portal saying what is on its way to us. They were two free-text
 * boxes, which is how one carrier ends up spelled three ways.
 *
 * A SELECT WHEN WE HAVE A LIST, A TEXT BOX WHEN WE DO NOT. An empty dropdown
 * is a form nobody can complete, and this list starts empty on a fresh
 * database — so until an admin adds the first courier both screens keep
 * working exactly as they did. The fallback is not a nicety; it is what stops
 * this change breaking dispatch on day one.
 *
 * Whatever is already stored is always an option, even when it is not on the
 * list — an archived courier, or a name typed before the list existed. Without
 * that, opening an old order and saving it would silently blank a courier that
 * has been delivering parcels for a year. courierOptions() folds it in.
 *
 * A server component with no state of its own: the caller passes the options
 * and the current value, and the form does the rest.
 */
export function CourierPicker({
  name = "courier",
  value,
  options,
  labelClassName,
  inputClassName,
  label = "Courier",
}: {
  name?: string;
  value: string | null;
  /** From courierOptions(), which already includes `value` if it is unlisted. */
  options: string[];
  labelClassName: string;
  inputClassName: string;
  label?: string;
}) {
  const current = value ?? "";

  return (
    <label className="block">
      <span className={labelClassName}>{label}</span>
      {options.length > 0 ? (
        <select name={name} defaultValue={current} className={inputClassName}>
          {/* Optional, and it says so rather than looking unanswered. */}
          <option value="">Not set</option>
          {options.map((courier) => (
            <option key={courier} value={courier}>
              {courier}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          defaultValue={current}
          placeholder="Optional"
          className={inputClassName}
        />
      )}
    </label>
  );
}
