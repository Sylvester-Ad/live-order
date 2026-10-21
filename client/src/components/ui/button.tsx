import type { ButtonHTMLAttributes, Ref } from "react";

import { buttonClassName, type ButtonSize, type ButtonVariant } from "./button-styles";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: Ref<HTMLButtonElement>;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ref,
  ...props
}: ButtonProps) {
  return <button className={buttonClassName(variant, size, className)} ref={ref} {...props} />;
}
