// Wiederkehrende UI-Primitive. Bewusst klein gehalten: nur was mehrfach gebraucht wird.
import { Fragment } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";

export function cx(...parts) { return parts.filter(Boolean).join(" "); }

export function Button({ variant = "secondary", size, block, icon: Icon, children, className, ...rest }) {
  return (
    <button
      type="button"
      className={cx("btn", `btn--${variant}`, size && `btn--${size}`, block && "btn--block", className)}
      {...rest}
    >
      {Icon && <Icon size={size === "sm" ? 16 : 18} aria-hidden="true" />}
      {children}
    </button>
  );
}

// Icon-Buttons brauchen immer ein zugängliches Label
export function IconButton({ icon: Icon, label, variant, size = 20, className, ...rest }) {
  return (
    <button type="button" className={cx("icon-btn", variant && `icon-btn--${variant}`, className)}
      aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}

// Sticky-Kopf für Unterseiten (mit Zurück) und kompakte Seiten
export function PageHeader({ title, back, actions }) {
  return (
    <header className={cx("page-header", back && "page-header--back")}>
      {back && <IconButton icon={ArrowLeft} label="Zurück" onClick={back} />}
      <h1 className="page-header__title">{title}</h1>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

// Großer Kopf für die Hauptbereiche (Start, Trainingsbuch, Team, Auswertung)
export function PageIntro({ eyebrow, title, actions }) {
  return (
    <div className="page-intro">
      <div>
        {eyebrow && <p className="page-intro__eyebrow">{eyebrow}</p>}
        <h1 className="page-intro__title">{title}</h1>
      </div>
      {actions && <div className="page-intro__actions">{actions}</div>}
    </div>
  );
}

export function Section({ title, hint, action, large, children, className }) {
  return (
    <section className={cx("section", className)}>
      {(title || action) && (
        <div className="section__head">
          {title && <h2 className={cx("section__title", large && "section__title--lg")}>{title}</h2>}
          {hint && <span className="section__hint">{hint}</span>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} className="empty__icon" aria-hidden="true" />}
      {title && <p className="empty__title">{title}</p>}
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  );
}

// Listenzeile: als Button (onClick) oder statisch
export function Row({ lead, title, meta, excerpt, trail, onClick, chevron, className, ...rest }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={cx("row", className)} onClick={onClick} {...rest}>
      {lead && <span className="row__lead">{lead}</span>}
      <span className="row__main">
        <span className="row__title">{title}</span>
        {meta && <span className="row__meta">{meta}</span>}
        {excerpt && <span className="row__excerpt">{excerpt}</span>}
      </span>
      {trail && <span className="row__trail">{trail}</span>}
      {chevron && <ChevronRight size={18} className="row__chev" aria-hidden="true" />}
    </Tag>
  );
}

// Meta-Zeile mit dezenten Trennern: <Meta items={["U16w", "90 min"]} />
// Umbrochen wird zwischen den Einträgen; kurze Einträge ("90 min") bleiben zusammen.
export function Meta({ items }) {
  const list = items.filter(Boolean);
  return list.map((it, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="sep" aria-hidden="true"> · </span>}
      <span className={typeof it === "string" && it.length <= 18 ? "meta-item" : undefined}>{it}</span>
    </Fragment>
  ));
}

export function Field({ label, hint, error, htmlFor, children, aside }) {
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          <span>{label}</span>{aside && <span className="text-3">{aside}</span>}
        </label>
      )}
      {children}
      {error ? <p className="field__error" role="alert">{error}</p> : hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

// Einfachauswahl als Chips. options: [{ value, label, meta? }]
export function ChoiceChips({ label, options, value, onChange, scroll }) {
  return (
    <div className={cx("chips", scroll && "chips--scroll")} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.label}
          {o.meta && <span className="chip__meta">{o.meta}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ label, options, value, onChange, block }) {
  return (
    <div className={cx("segmented", block && "segmented--block")} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className="segmented__item" aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={16} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", icon: Icon, children }) {
  return (
    <div className={cx("notice", `tone-${tone}`)}>
      {Icon && <Icon size={18} className="notice__icon" aria-hidden="true" />}
      <div>{children}</div>
    </div>
  );
}

// Datumsblock für Listen im Trainingsbuch
export function DateBlock({ iso, today }) {
  const d = new Date(iso + "T12:00:00");
  return (
    <span className={cx("date-block", iso === today && "date-block--today")}>
      <span className="date-block__day" aria-hidden="true">{d.getDate()}</span>
      <span className="date-block__wd" aria-hidden="true">{d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "")}</span>
      <span className="sr-only">{d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</span>
    </span>
  );
}
