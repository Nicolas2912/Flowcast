import type { PropsWithChildren } from "react";

import { cn } from "../../lib/cn";

type CardProps = PropsWithChildren<{
  className?: string;
}>;

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/15 bg-white/8 p-6 shadow-float backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}
