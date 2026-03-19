"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {assignMemorizationItem} from "@/app/actions/assignMemorizationItem";
import type {MemorizationItemType} from "@/app/actions/createMemorizationItem";

export default function AdminAssignItemForm({
  students,
  items,
}: {
  students: {id: string; display_name: string | null; email: string; role: string}[];
  items: {
    id: string;
    type: MemorizationItemType;
    title: string;
    reference: string | null;
    version: string | null;
    fixed_text: string;
    is_active: boolean;
  }[];
}) {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");

  const versionOptions = useMemo(() => ["개역개정", "개역한글", "KJV", "NIV"], []);

  const [userId, setUserId] = useState(students[0]?.id ?? "");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const [assignedFixedTextOverride, setAssignedFixedTextOverride] = useState("");
  const [assignedVersionOverride, setAssignedVersionOverride] = useState("");

  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = items.find((it) => it.id === itemId);

  const confirmOverride = () => {
    if (!assignedFixedTextOverride.trim()) return;
    setOverrideConfirmed(true);
  };

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await assignMemorizationItem({
        userId,
        itemId,
        dueDate: dueDate || undefined,
        assignedFixedTextOverride: assignedFixedTextOverride.trim() || undefined,
        assignedVersionOverride: assignedVersionOverride.trim() || undefined,
      });

      setAssignedFixedTextOverride("");
      setAssignedVersionOverride("");
      setOverrideConfirmed(false);
    } catch {
      setError(tCommon("errorOccurred"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-800">{tAdmin("selectUser")}</label>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setOverrideConfirmed(false);
            }}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name ?? s.email}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-800">{tAdmin("selectItem")}</label>
          <select
            value={itemId}
            onChange={(e) => {
              setItemId(e.target.value);
              setAssignedFixedTextOverride("");
              setAssignedVersionOverride("");
              setOverrideConfirmed(false);
            }}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.reference ?? it.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("dueDate")}</label>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("assignedFixedOverride")}</label>
        <Textarea
          value={assignedFixedTextOverride}
          onChange={(e) => {
            setAssignedFixedTextOverride(e.target.value);
            setOverrideConfirmed(false);
          }}
          className="min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("assignedVersionOverride")}</label>
        <select
          value={assignedVersionOverride}
          onChange={(e) => setAssignedVersionOverride(e.target.value)}
          disabled={selectedItem?.type !== "bible"}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:opacity-50"
        >
          <option value="">{selectedItem?.version ?? ""}</option>
          {versionOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {assignedFixedTextOverride.trim() ? (
          !overrideConfirmed ? (
            <Button variant="outline" onClick={confirmOverride} disabled={!assignedFixedTextOverride.trim()}>
              {tAdmin("confirmFixedText")}
            </Button>
          ) : (
            <span className="text-sm text-emerald-700">{tAdmin("confirmFixedText")}</span>
          )
        ) : null}

        <Button
          onClick={onSubmit}
          disabled={
            submitting ||
            !userId ||
            !itemId ||
            (assignedFixedTextOverride.trim() ? !overrideConfirmed : false)
          }
        >
          {submitting ? tCommon("loading") : tAdmin("assignButton")}
        </Button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </CardContent>
  );
}

