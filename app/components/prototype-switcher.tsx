// ⚠️ PROTOTYPE tooling: floating bar that cycles `?variant=` on the current route.
// Never ships: hidden in production builds.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function usePrototypeVariant(keys: string[]) {
  const [searchParams] = useSearchParams();
  const current = searchParams.get("variant") ?? keys[0];
  return keys.includes(current) ? current : keys[0];
}

export function PrototypeSwitcher({
  variants,
}: {
  variants: { key: string; name: string }[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const keys = variants.map((v) => v.key);
  const current = usePrototypeVariant(keys);
  const index = keys.indexOf(current);

  function go(step: number) {
    const next = keys[(index + step + keys.length) % keys.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 font-mono">
        {current} ({variants[index].name})
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
