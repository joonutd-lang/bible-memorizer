import * as React from "react";
import {cn} from "@/lib/utils";

export function Table({className, ...props}: React.HTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse", className)} {...props} />;
}

export function TableHeader({className, ...props}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-zinc-200/70", className)} {...props} />;
}

export function TableBody({className, ...props}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-zinc-100", className)} {...props} />;
}

export function TableRow({className, ...props}: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-zinc-50/60", className)} {...props} />;
}

export function TableHead({className, ...props}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-10 px-2 text-left text-xs font-medium text-zinc-600", className)}
      {...props}
    />
  );
}

export function TableCell({className, ...props}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-2 py-2 text-sm text-zinc-900", className)} {...props} />;
}

