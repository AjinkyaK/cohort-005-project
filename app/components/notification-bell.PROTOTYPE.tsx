// ⚠️ PROTOTYPE: throwaway. Answers the wayfinder ticket
// "Prototype the in-app bell and dropdown" (issue #21).
// Lives on branch prototype/notification-bell and is never merged.
//
// Question: how should Notifications look in the app?
// Three variants of the bell on the existing app layout (every route under it),
// switchable with ?variant=A|B|C and the floating bar (or ← / →):
//   A  Knock stock popover: Knock's own NotificationIconButton + popover, top-right
//   B  Sidebar bell + compact dropdown, Cadence-styled, next to the logo
//   C  "Notifications" sidebar item + right-hand slide-over inbox with full detail
//
// Data: the signed-in person's REAL Knock feed (live over Knock's websocket).
// Only `refund-request-decided` exists in Knock today, so B and C also mix in
// SAMPLE items for events 1–3, marked "sample", so all three events can be judged.
// A shows only what Knock renders itself (it can't take samples).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  KnockProvider,
  KnockFeedProvider,
  NotificationIconButton,
  NotificationFeedPopover,
  useKnockFeed,
} from "@knocklabs/react";
import type { FeedItem } from "@knocklabs/client";
import "@knocklabs/react/dist/index.css";
import {
  Bell,
  CircleCheck,
  CircleX,
  Receipt,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  PrototypeSwitcher,
  usePrototypeVariant,
} from "~/components/prototype-switcher";

const VARIANTS = [
  { key: "A", name: "Knock stock popover" },
  { key: "B", name: "Sidebar bell + dropdown" },
  { key: "C", name: "Slide-over inbox" },
];

type KnockFeedConfig = {
  apiKey: string;
  feedChannelId: string;
  userId: string;
  userToken: string;
} | null;

type Slots = {
  sidebarHeader: ReactNode;
  sidebarNav: ReactNode;
  mainTopBar: ReactNode;
};

export function NotificationsPrototype({
  config,
  children,
}: {
  config: KnockFeedConfig;
  children: (slots: Slots) => ReactNode;
}) {
  const variant = usePrototypeVariant(VARIANTS.map((v) => v.key));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The feed renders only when someone is signed in.
  if (!config || !mounted) {
    return (
      <>
        {children({ sidebarHeader: null, sidebarNav: null, mainTopBar: null })}
        <PrototypeSwitcher variants={VARIANTS} />
      </>
    );
  }

  return (
    <KnockProvider
      key={config.userId} // a DevUI person switch remounts with the new token
      apiKey={config.apiKey}
      user={{ id: config.userId }}
      userToken={config.userToken}
      identificationStrategy="skip" // only the server identifies recipients
      enabled={Boolean(config.userId && config.userToken)}
    >
      <KnockFeedProvider feedId={config.feedChannelId}>
        {children({
          sidebarHeader: variant === "B" ? <VariantB /> : null,
          sidebarNav: variant === "C" ? <VariantC /> : null,
          mainTopBar: variant === "A" ? <VariantA /> : null,
        })}
        <PrototypeSwitcher variants={VARIANTS} />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

// ─── Shared: Knock items + samples → what Cadence shows ───────────────────────

type EventKey =
  | "refund-request-decided"
  | "refund-request-raised"
  | "seat-claimed";

type Notification = {
  id: string;
  event: EventKey | string;
  title: string;
  detail: string | null;
  url: string;
  insertedAt: string;
  read: boolean;
  sample: boolean;
  knockItem?: FeedItem;
};

/** Cadence writes the copy from the event key + trigger data, not Knock's template. */
function describe(
  event: string,
  data: Record<string, any>
): { title: string; detail: string | null } {
  switch (event) {
    case "refund-request-decided":
      return data.decision === "approved"
        ? {
            title: `Your refund for ${data.course_title} is on its way`,
            detail: data.note ?? null,
          }
        : {
            title: `Your refund request for ${data.course_title} was declined`,
            detail: `${data.note ?? ""} You can raise a new Refund Request.`.trim(),
          };
    case "refund-request-raised":
      return {
        title: `${data.buyer_name} raised a Refund Request for ${data.course_title}`,
        detail: data.reason ? `“${data.reason}”` : null,
      };
    case "seat-claimed":
      return {
        title: `${data.student_name} claimed a Seat on ${data.course_title}`,
        detail: `${data.claimed} of ${data.seats} Seats claimed`,
      };
    default:
      return { title: event, detail: null };
  }
}

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

const SAMPLES: (Omit<Notification, "title" | "detail" | "read" | "sample"> & {
  data: Record<string, any>;
})[] = [
  {
    id: "sample-raised",
    event: "refund-request-raised",
    url: "/admin/refunds",
    insertedAt: minutesAgo(4),
    data: {
      buyer_name: "Priya Shah",
      course_title: "TypeScript Generics in Depth",
      reason: "The course wasn't what I expected from the description.",
    },
  },
  {
    id: "sample-seat",
    event: "seat-claimed",
    url: "/team",
    insertedAt: minutesAgo(52),
    data: {
      student_name: "Marcus Lee",
      course_title: "React Router from Scratch",
      claimed: 7,
      seats: 10,
    },
  },
  {
    id: "sample-approved",
    event: "refund-request-decided",
    url: "/dashboard",
    insertedAt: minutesAgo(60 * 26),
    data: {
      decision: "approved",
      course_title: "Intro to SQL",
      note: "Approved — sorry the pacing didn't suit you.",
    },
  },
];

function useCadenceNotifications() {
  const { feedClient, useFeedStore } = useKnockFeed();
  const items = useFeedStore((s) => s.items);
  const loading = useFeedStore((s) => s.loading);
  const unseenCount = useFeedStore((s) => s.metadata.unseen_count);
  const [sampleRead, setSampleRead] = useState<Set<string>>(new Set());
  const [samplesSeen, setSamplesSeen] = useState(false);

  useEffect(() => {
    feedClient.fetch();
  }, [feedClient]);

  const real: Notification[] = items.map((item) => ({
    id: item.id,
    event: item.source.key,
    ...describe(item.source.key, (item.data ?? {}) as Record<string, any>),
    url: ((item.data as any)?.url as string) ?? "/",
    insertedAt: item.inserted_at,
    read: Boolean(item.read_at),
    sample: false,
    knockItem: item,
  }));
  const samples: Notification[] = SAMPLES.map((s) => ({
    ...s,
    ...describe(s.event, s.data),
    read: sampleRead.has(s.id),
    sample: true,
  }));

  const all = [...real, ...samples].sort((a, b) =>
    b.insertedAt.localeCompare(a.insertedAt)
  );

  return {
    notifications: all,
    loading,
    badgeCount: unseenCount + (samplesSeen ? 0 : samples.length),
    unreadCount: all.filter((n) => !n.read).length,
    markSeen() {
      feedClient.markAllAsSeen();
      setSamplesSeen(true);
    },
    markRead(n: Notification) {
      if (n.knockItem) feedClient.markAsRead(n.knockItem);
      else setSampleRead((prev) => new Set(prev).add(n.id));
    },
    markAllRead() {
      feedClient.markAllAsRead();
      setSampleRead(new Set(SAMPLES.map((s) => s.id)));
    },
  };
}

function EventIcon({ n, className }: { n: Notification; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  if (n.event === "refund-request-raised")
    return <Receipt className={cn(cls, "text-amber-500")} />;
  if (n.event === "seat-claimed")
    return <UserPlus className={cn(cls, "text-sky-500")} />;
  if (n.title.includes("declined"))
    return <CircleX className={cn(cls, "text-rose-500")} />;
  return <CircleCheck className={cn(cls, "text-emerald-500")} />;
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 60 / 24)}d ago`;
}

function SampleTag() {
  return (
    <span className="rounded bg-fuchsia-500/15 px-1 text-[10px] font-medium uppercase text-fuchsia-600">
      sample
    </span>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Variant A: Knock's stock components, top-right of the main column ────────

function VariantA() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-end border-b bg-background/80 px-6 backdrop-blur">
      <NotificationIconButton
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
      />
      <NotificationFeedPopover
        buttonRef={buttonRef}
        isVisible={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

// ─── Variant B: bell beside the logo, compact Cadence dropdown ────────────────

function VariantB() {
  const feed = useCadenceNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          feed.markSeen();
        }}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        <Badge count={feed.badgeCount} className="absolute -right-1 -top-1" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={feed.markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={feed.unreadCount === 0}
            >
              Mark all as read
            </button>
          </div>
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {feed.notifications.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {feed.loading ? "Loading…" : "You're all caught up."}
              </li>
            )}
            {feed.notifications.map((n) => (
              <li key={n.id}>
                <Link
                  to={n.url}
                  onClick={() => {
                    feed.markRead(n);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex gap-3 px-4 py-3 hover:bg-accent",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <EventIcon n={n} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "line-clamp-2 text-sm",
                        !n.read && "font-medium"
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {timeAgo(n.insertedAt)}
                      {n.sample && <SampleTag />}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Variant C: sidebar nav item + right slide-over inbox with full detail ────

function VariantC() {
  const feed = useCadenceNotifications();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = feed.notifications.filter(
    (n) => filter === "all" || !n.read
  );
  const dayMs = 24 * 60 * 60_000;
  const groups = [
    {
      label: "Today",
      items: shown.filter(
        (n) => Date.now() - new Date(n.insertedAt).getTime() < dayMs
      ),
    },
    {
      label: "Earlier",
      items: shown.filter(
        (n) => Date.now() - new Date(n.insertedAt).getTime() >= dayMs
      ),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          feed.markSeen();
        }}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        <Badge count={feed.badgeCount} className="ml-auto" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-[28rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-5">
              <h2 className="font-semibold">Notifications</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center justify-between border-b px-5 py-2">
              <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
                {(["all", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded px-2.5 py-1 capitalize",
                      filter === f && "bg-background shadow-sm"
                    )}
                  >
                    {f}
                    {f === "unread" && ` (${feed.unreadCount})`}
                  </button>
                ))}
              </div>
              <button
                onClick={feed.markAllRead}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Mark all as read
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {groups.length === 0 && (
                <p className="pt-10 text-center text-sm text-muted-foreground">
                  {feed.loading ? "Loading…" : "Nothing here."}
                </p>
              )}
              {groups.map((g) => (
                <section key={g.label}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </h3>
                  <div className="space-y-2">
                    {g.items.map((n) => (
                      <article
                        key={n.id}
                        className={cn(
                          "rounded-lg border p-4",
                          !n.read && "border-primary/40 bg-primary/5"
                        )}
                      >
                        <div className="flex gap-3">
                          <EventIcon n={n} className="mt-0.5 size-5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{n.title}</p>
                            {n.detail && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {n.detail}
                              </p>
                            )}
                            <div className="mt-3 flex items-center gap-3 text-xs">
                              <Link
                                to={n.url}
                                onClick={() => {
                                  feed.markRead(n);
                                  setOpen(false);
                                }}
                                className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/90"
                              >
                                View
                              </Link>
                              {!n.read && (
                                <button
                                  onClick={() => feed.markRead(n)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  Mark as read
                                </button>
                              )}
                              <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                                {n.sample && <SampleTag />}
                                {timeAgo(n.insertedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
