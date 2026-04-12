import { Button as REButton } from "@react-email/components";
import type { ReactNode } from "react";

interface ButtonProps {
  href: string;
  children: ReactNode;
}

export function Button({ href, children }: ButtonProps) {
  return (
    <REButton
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: "#fff",
        color: "#000",
        padding: "0 20px",
        textDecoration: "none",
        borderRadius: "0",
        border: "6px solid #000",
        borderImage:
          "url('https://unpkg.com/@sakun/system.css@0.1.11/dist/button-default.svg') 60 / 1 / 0 stretch",
        fontFamily: "'Departure Mono', 'Courier New', Courier, monospace",
        fontSize: "12px",
        lineHeight: "normal",
      }}
    >
      {children}
    </REButton>
  );
}
