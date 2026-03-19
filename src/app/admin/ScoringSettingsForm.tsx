"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {CardContent} from "@/components/ui/card";
import {updateScoringSettings} from "@/app/actions/updateScoringSettings";
import type {ScoringOptions} from "@/lib/grading/grading";

export default function ScoringSettingsForm({
  initial,
}: {
  initial: ScoringOptions;
}) {
  const tAdmin = useTranslations("admin");
  const tCommon = useTranslations("common");

  const [passThreshold, setPassThreshold] = useState<number>(initial.passThreshold);
  const [caseSensitive, setCaseSensitive] = useState<boolean>(initial.caseSensitive);
  const [ignorePunctuation, setIgnorePunctuation] = useState<boolean>(initial.ignorePunctuation);
  const [collapseWhitespace, setCollapseWhitespace] = useState<boolean>(initial.collapseWhitespace);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await updateScoringSettings({
        passThreshold,
        caseSensitive,
        ignorePunctuation,
        collapseWhitespace,
      });
      setSaved(true);
    } catch {
      setError(tCommon("errorOccurred"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CardContent className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-800">{tAdmin("passThreshold")}</label>
        <input
          type="number"
          min={0}
          max={100}
          value={passThreshold}
          onChange={(e) => setPassThreshold(Number(e.target.value))}
          className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          {tAdmin("caseSensitive")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ignorePunctuation}
            onChange={(e) => setIgnorePunctuation(e.target.checked)}
          />
          {tAdmin("ignorePunctuation")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={collapseWhitespace}
            onChange={(e) => setCollapseWhitespace(e.target.checked)}
          />
          {tAdmin("collapseWhitespace")}
        </label>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={onSave} disabled={submitting}>
          {submitting ? tCommon("loading") : tAdmin("saveSettings")}
        </Button>
        {saved ? <span className="text-sm text-emerald-700">{tAdmin("saveSettings")}</span> : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </CardContent>
  );
}

