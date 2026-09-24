import { STATUS_LABEL } from "../lib/training.js";

// Ruhiger Status einer Planung: Ring (offen), halb gefüllt (vorbereitet), gefüllt (durchgeführt)
export function PlanStatus({ status, label }) {
  return (
    <span className={`pstatus pstatus--${status}`}>
      <span className="pstatus__mark" aria-hidden="true" />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
