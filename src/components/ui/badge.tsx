import * as React from "react";
import {cn} from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {variant?: "default" | "secondary" | "destructive"}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700",
        className
      )}
      {...props}
    />
  );
}

