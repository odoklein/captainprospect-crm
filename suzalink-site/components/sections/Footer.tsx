import Link from "next/link";
import { site } from "@/content/site";
import { Logo } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { Container } from "@/components/ui/primitives";

/** 14. Footer: large logo, five link columns, FR/EN switch, socials, copyright. */
export function Footer() {
  const { footer } = site;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-paper pt-20 pb-10">
      <Container>
        <div className="grid gap-14 lg:grid-cols-[320px_1fr] lg:gap-20">
          <div className="flex flex-col gap-6">
            <Link href="/" className="w-fit rounded-md" aria-label="Suzalink, accueil">
              <Logo className="h-24 w-auto sm:h-28" title="" />
            </Link>
            <p className="max-w-[34ch] text-muted">{footer.tagline}</p>
          </div>

          <nav aria-label="Pied de page" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {footer.columns.map((col) => (
              <div key={col.title}>
                <h2 className="eyebrow text-muted">{col.title}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-[15px] text-ink/85 underline-offset-4 hover:text-ink hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-6 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-muted">
            © {year} {footer.copyright}
          </p>

          <div className="flex items-center gap-6">
            <div role="group" aria-label={footer.languages.label} className="flex rounded-full border border-line p-1 text-[13px] font-medium">
              <span aria-current="true" className="rounded-full bg-navy px-3 py-1 text-white" lang="fr">
                {footer.languages.current}
              </span>
              <button
                type="button"
                disabled
                lang="en"
                title={footer.languages.other.note}
                className="cursor-not-allowed rounded-full px-3 py-1 text-muted"
              >
                {footer.languages.other.code}
                <span className="sr-only"> — {footer.languages.other.note}</span>
              </button>
            </div>

            <ul className="flex items-center gap-2">
              {footer.socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    className="grid size-10 place-items-center rounded-full border border-line text-ink/75 hover:border-ink/30 hover:text-ink"
                  >
                    <Icon name={s.icon} className="size-[18px]" />
                    <span className="sr-only">Suzalink sur {s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </footer>
  );
}
