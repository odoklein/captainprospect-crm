"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { submitDemo, type DemoState } from "@/app/demo/actions";
import { demo } from "@/content/demo";
import { findInterest } from "@/content/offers";
import { demoFields, validateDemo, type DemoErrors, type DemoField } from "@/lib/demo-schema";
import { ButtonLink, cx } from "@/components/ui/primitives";

const initialState: DemoState = { status: "idle", errors: {}, values: {} };
const f = demo.form;

/** Demo request form: name, email, company, team size. Works without JavaScript (server action). */
export function DemoForm({ plan }: { plan?: string }) {
  const [state, formAction, pending] = useActionState(submitDemo, initialState);
  const [clientErrors, setClientErrors] = useState<DemoErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const errors: DemoErrors = { ...state.errors, ...clientErrors };
  const errorCount = demoFields.filter((k) => errors[k]).length;
  const selectedPlan = findInterest(plan);

  useEffect(() => {
    if (state.status === "success") successRef.current?.focus();
    if (state.status === "error") {
      // Server-side errors (JS on): move focus to the first invalid field.
      const first = demoFields.find((k) => state.errors[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      else summaryRef.current?.focus();
    }
  }, [state]);

  const readForm = () => Object.fromEntries(new FormData(formRef.current!).entries()) as Record<string, string>;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    setSubmitted(true);
    const { errors: next } = validateDemo({ ...readForm(), plan: undefined });
    setClientErrors(next);
    if (Object.keys(next).length > 0) {
      e.preventDefault();
      const first = demoFields.find((k) => next[k]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  };

  // After a first submit, re-check a field as soon as it changes so errors disappear while typing.
  const revalidate = (field: DemoField) => {
    if (!submitted && !clientErrors[field]) return;
    const { errors: next } = validateDemo({ ...readForm(), plan: undefined });
    setClientErrors((prev) => ({ ...prev, [field]: next[field] }));
  };

  if (state.status === "success") {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-[24px] border border-line bg-white p-8 sm:p-10">
        <h2 ref={successRef} tabIndex={-1} className="font-display-tight text-3xl font-light">
          {f.success.title}
        </h2>
        <p className="text-muted">{f.success.body}</p>
        <ButtonLink href="/" variant="ghost">
          {f.success.back}
        </ButtonLink>
      </div>
    );
  }

  const serverFailed = state.status === "error" && Object.keys(state.errors).length === 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={onSubmit}
      noValidate
      aria-describedby="demo-required-note"
      className="flex flex-col gap-6 rounded-[24px] border border-line bg-white p-6 sm:p-10"
    >
      <fieldset className="flex flex-col gap-5">
        <legend className="font-display-tight mb-1 text-2xl font-normal">{f.legend}</legend>
        <p id="demo-required-note" className="-mt-2 text-[14px] text-muted">
          {f.requiredNote}
        </p>

        {errorCount > 0 || serverFailed ? (
          <p
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            className="rounded-[12px] border border-[#B42318]/30 bg-[#B42318]/[.06] px-4 py-3 text-[15px] text-[#8A1C13]"
          >
            {serverFailed ? f.errors.server : f.errors.summary(errorCount)}
          </p>
        ) : null}

        <Field
          name="name"
          label={f.fields.name.label}
          error={errors.name}
          input={(p) => (
            <input
              {...p}
              type="text"
              autoComplete={f.fields.name.autoComplete}
              placeholder={f.fields.name.placeholder}
              defaultValue={state.values.name}
              onChange={() => revalidate("name")}
            />
          )}
        />
        <Field
          name="email"
          label={f.fields.email.label}
          error={errors.email}
          input={(p) => (
            <input
              {...p}
              type="email"
              inputMode="email"
              autoComplete={f.fields.email.autoComplete}
              placeholder={f.fields.email.placeholder}
              defaultValue={state.values.email}
              onChange={() => revalidate("email")}
              spellCheck={false}
            />
          )}
        />
        <Field
          name="company"
          label={f.fields.company.label}
          error={errors.company}
          input={(p) => (
            <input
              {...p}
              type="text"
              autoComplete={f.fields.company.autoComplete}
              placeholder={f.fields.company.placeholder}
              defaultValue={state.values.company}
              onChange={() => revalidate("company")}
            />
          )}
        />
        <Field
          name="teamSize"
          label={f.fields.teamSize.label}
          error={errors.teamSize}
          input={(p) => (
            <select {...p} defaultValue={state.values.teamSize ?? ""} onChange={() => revalidate("teamSize")}>
              <option value="" disabled>
                {f.fields.teamSize.placeholder}
              </option>
              {f.teamSizes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        />

        {selectedPlan ? (
          <p className="rounded-[12px] bg-paper px-4 py-3 text-[15px]">
            {f.planLabel} : <strong className="font-semibold">{selectedPlan.name}</strong>
            <input type="hidden" name="plan" value={selectedPlan.id} />
          </p>
        ) : null}

        {/* Honeypot, hidden from people and assistive tech. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Ne pas remplir
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </fieldset>

      <p className="text-[13px] leading-relaxed text-muted">{f.consent}</p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-14 items-center justify-center rounded-full bg-navy px-7 text-base font-medium text-white transition-colors hover:bg-navy-deep disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? f.submitting : f.submit}
      </button>
    </form>
  );
}

type InputProps = {
  id: string;
  name: string;
  required: true;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  className: string;
};

function Field({
  name,
  label,
  error,
  input,
}: {
  name: DemoField;
  label: string;
  error?: string;
  input: (props: InputProps) => ReactNode;
}) {
  const id = `demo-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-medium">
        {label}
      </label>
      {input({
        id,
        name,
        required: true,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
        className: cx(
          "h-12 w-full rounded-[12px] border bg-paper px-4 text-base text-ink placeholder:text-muted transition-colors",
          "focus-visible:border-navy focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose",
          error ? "border-[#B42318]" : "border-line hover:border-ink/30",
        ),
      })}
      {error ? (
        <p id={errorId} className="text-[14px] text-[#B42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
