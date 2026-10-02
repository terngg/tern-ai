"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
export function SecretInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="ui-secret">
      <input
        {...props}
        aria-label={
          props["aria-label"] ||
          (props.name === "key"
            ? "API key"
            : props.name === "password"
              ? "Password"
              : undefined)
        }
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCapitalize="none"
      />
      <button
        type="button"
        className="ui-icon-button"
        aria-label={visible ? "Hide secret" : "Show secret"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
