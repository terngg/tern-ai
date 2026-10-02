"use client";
import { useId, useState, type ComponentProps } from "react";
/** Keep HTML constraints, but render errors in the product instead of browser bubbles. */
export function Form({
  children,
  onSubmit,
  onInput,
  ...props
}: ComponentProps<"form">) {
  const [error, setError] = useState("");
  const errorId = useId();
  return (
    <form
      {...props}
      noValidate
      onInput={(event) => {
        setError("");
        if (event.target instanceof HTMLElement)
          event.target.removeAttribute("aria-invalid");
        onInput?.(event);
      }}
      onSubmit={(event) => {
        const field = event.currentTarget.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >(":invalid");
        if (field) {
          event.preventDefault();
          const label =
            field.labels?.[0]?.textContent?.trim().split("\n")[0] ||
            field.name ||
            "This field";
          setError(
            `${label}: ${field.validity.valueMissing ? "This field is required." : field.validity.typeMismatch ? "Enter a valid value." : field.validity.tooShort ? `Use at least ${field.minLength} characters.` : field.validationMessage}`,
          );
          field.setAttribute("aria-invalid", "true");
          field.setAttribute("aria-describedby", errorId);
          field.focus();
          return;
        }
        setError("");
        onSubmit?.(event);
      }}
    >
      {children}
      {error && (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
