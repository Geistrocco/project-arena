"use client";

import { useFormStatus } from "react-dom";

export function SubmitNominationButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return <button className="btn-primary" disabled={disabled || pending} type="submit" aria-disabled={disabled || pending}>
    {pending ? "Odosielam…" : "Zverejniť nomináciu"}
  </button>;
}
