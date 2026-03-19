import * as React from "react";
import {cn} from "@/lib/utils";

export function Card({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-zinc-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 border-b border-zinc-200/70", className)} {...props} />;
}

export function CardTitle({className, ...props}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-none tracking-tight", className)} {...props} />;
}

export function CardContent({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 border-t border-zinc-200/70", className)} {...props} />;
}

