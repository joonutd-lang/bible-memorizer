"use client";

import {useMemo, useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {CardContent} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {createMemorizationItem, type MemorizationItemType} from "@/app/actions/createMemorizationItem";

export default function AdminCreateItemForm() {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");

  const versionOptions = useMemo(
    () => ["개역개정", "개역한글", "KJV", "NIV"],
    []
  );

  const [type, setType] = useState<MemorizationItemType>("bible");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [version, setVersion] = useState(versionOptions[0]);
  const [rawText, setRawText] = useState("");
  const [fixedText, setFixedText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [notes, setNotes] = useState("");
  const [difficulty, setDifficulty] = useState<number>(1);

  const [fixedConfirmed, setFixedConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmFixed = () => {
    const cleaned = fixedText.trim();
    if (!cleaned) return;
    setFixedConfirmed(true);
  };

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await createMemorizationItem({
        type,
        title,
        reference: reference.trim() || undefined,
        version: type === "bible" ? version : undefined,
        rawText,
        fixedText,
        meaning: meaning.trim() || undefined,
        notes: notes.trim() || undefined,
        difficulty,
      });

      // Reset fields for next entry
      setTitle("");
      setReference("");
      setRawText("");
      setFixedText("");
      setMeaning("");
      setNotes("");
      setDifficulty(1);
      setFixedConfirmed(false);
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
          <label className="text-sm font-medium text-zinc-800">{tAdmin("type")}</label>
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as MemorizationItemType;
              setType(next);
              setFixedConfirmed(false);
            }}
            className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            <option value="bible">{tAdmin("typeBible")}</option>
            <option value="vocab">{tAdmin("typeVocab")}</option>
            <option value="custom">{tAdmin("typeCustom")}</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-800">{tAdmin("difficulty")}</label>
          <Input
            type="number"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            min={1}
            step={1}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("titleLabel")}</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("reference")}</label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("version")}</label>
        <select
          value={version}
          onChange={(e) => {
            setVersion(e.target.value);
            setFixedConfirmed(false);
          }}
          disabled={type !== "bible"}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:opacity-50"
        >
          {versionOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("rawText")}</label>
        <Textarea value={rawText} onChange={(e) => setRawText(e.target.value)} className="min-h-[140px]" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("fixedText")}</label>
        <Textarea
          value={fixedText}
          onChange={(e) => {
            setFixedText(e.target.value);
            setFixedConfirmed(false);
          }}
          className="min-h-[160px]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {!fixedConfirmed ? (
          <Button variant="outline" onClick={confirmFixed} disabled={!fixedText.trim()}>
            {tAdmin("confirmFixedText")}
          </Button>
        ) : null}

        <Button
          onClick={onSubmit}
          disabled={
            submitting ||
            !title.trim() ||
            !rawText.trim() ||
            !fixedText.trim() ||
            !fixedConfirmed
          }
        >
          {submitting ? tCommon("loading") : tAdmin("createItemButton")}
        </Button>
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("meaning")}</label>
        <Textarea value={meaning} onChange={(e) => setMeaning(e.target.value)} className="min-h-[120px]" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("notes")}</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[90px]" />
      </div>
    </CardContent>
  );
}

