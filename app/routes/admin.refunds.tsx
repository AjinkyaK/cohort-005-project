import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { z } from "zod";
import { AlertTriangle, ReceiptText } from "lucide-react";
import type { Route } from "./+types/admin.refunds";
import { requirePlatformAdmin } from "~/lib/access.server";
import {
  approveRefundRequest,
  declineRefundRequest,
  getOpenRefundRequests,
  getResolvedRefundRequests,
} from "~/lib/refund-requests.server";
import { PaymentTransferStatus, RefundStatus } from "~/db/schema";
import { parseFormData, parseParams } from "~/lib/validation";
import { cn, formatDuration, formatPrice } from "~/lib/utils";
import { RefundStatusBadge } from "~/components/refund-status-badge";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";

export function meta() {
  return [
    { title: "Refund Requests — Cadence" },
    { name: "description", content: "Review Open Refund Requests" },
  ];
}

// Any missing or unknown view falls back to the Open list.
const searchSchema = z.object({
  view: z.enum(["open", "resolved"]).catch("open"),
});

type RefundsView = z.infer<typeof searchSchema>["view"];

export async function loader({ request }: Route.LoaderArgs) {
  await requirePlatformAdmin(request);
  const { view } = parseParams(
    Object.fromEntries(new URL(request.url).searchParams),
    searchSchema
  );
  if (view === "resolved") {
    return { view, resolvedRequests: getResolvedRefundRequests() };
  }
  return { view, requests: getOpenRefundRequests() };
}

const refundActionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
    // Entered in dollars, like other prices; stored in cents.
    amountRefunded: z.coerce
      .number({ message: "Enter the Amount Refunded." })
      .min(0, "The Amount Refunded can't be negative."),
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  const { userId } = await requirePlatformAdmin(request);

  const formData = await request.formData();
  // An empty box would coerce to 0, so treat it as missing.
  if (formData.get("amountRefunded") === "") formData.delete("amountRefunded");

  const parsed = parseFormData(formData, refundActionSchema);
  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const result =
    parsed.data.intent === "approve"
      ? approveRefundRequest(
          parsed.data.refundId,
          userId,
          Math.round(parsed.data.amountRefunded * 100)
        )
      : declineRefundRequest(parsed.data.refundId, userId);

  if (result.ok) return { success: true };

  switch (result.reason) {
    case "not-found":
      throw data("Refund Request not found.", { status: 404 });
    case "already-resolved":
      throw data("This Refund Request has already been resolved.", {
        status: 409,
      });
    case "team-licence":
      throw data("Approving a Team Licence Refund Request isn't supported yet.", {
        status: 409,
      });
  }
}

type OpenRefundRequest = ReturnType<typeof getOpenRefundRequests>[number];
type ResolvedRefundRequest = ReturnType<typeof getResolvedRefundRequests>[number];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatWatchedTime(seconds: number) {
  return formatDuration(Math.floor(seconds / 60), true, false, false);
}

function PurchaseKindBadge({ kind }: { kind: OpenRefundRequest["purchaseKind"] }) {
  return kind === "team-licence" ? (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
      Team Licence
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      Individual Purchase
    </span>
  );
}

const headerCell =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

function DeclineButton({ refundId }: { refundId: number }) {
  // On success the request leaves the Open list, taking this row with it.
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      onSubmit={(event) => {
        if (
          !confirm(
            "Decline this Refund Request? Nothing will be given back and the learner keeps their access."
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="decline" />
      <input type="hidden" name="refundId" value={refundId} />
      <Button type="submit" variant="outline" size="sm" disabled={busy}>
        {busy ? "Declining..." : "Decline"}
      </Button>
    </fetcher.Form>
  );
}

function ApproveForm({ request }: { request: OpenRefundRequest }) {
  // On success the request leaves the Open list, taking this row with it.
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error =
    fetcher.data && "errors" in fetcher.data
      ? fetcher.data.errors.amountRefunded
      : undefined;
  const inputId = `amount-refunded-${request.id}`;

  return (
    <fetcher.Form
      method="post"
      className="space-y-1"
      onSubmit={(event) => {
        if (
          !confirm(
            "Approve this Refund Request? The learner loses access to the course, and this can't be undone."
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="approve" />
      <input type="hidden" name="refundId" value={request.id} />
      <label htmlFor={inputId} className="block text-xs text-muted-foreground">
        Amount Refunded ($)
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          name="amountRefunded"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={(request.refundAmount / 100).toFixed(2)}
          aria-invalid={error ? true : undefined}
          className="h-8 w-28"
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Approving..." : "Approve"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fetcher.Form>
  );
}

function OpenRefundRequestRow({ request }: { request: OpenRefundRequest }) {
  const { progress } = request;

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{request.buyer.name}</div>
        <div className="text-sm text-muted-foreground">{request.buyer.email}</div>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/courses/${request.course.slug}`}
          className="font-medium hover:underline"
        >
          {request.course.title}
        </Link>
        <div className="mt-1">
          <PurchaseKindBadge kind={request.purchaseKind} />
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <div>Bought {formatDate(request.purchasedAt)}</div>
        <div className="text-muted-foreground">
          Paid {formatPrice(request.amountPaid)}
        </div>
        <div className="font-medium">
          Refund Amount {formatPrice(request.refundAmount)}
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        {progress ? (
          <>
            <div>{formatWatchedTime(progress.watchedSeconds)} watched</div>
            <div className="text-muted-foreground">
              {progress.completedLessons} of {progress.totalLessons} lessons
              completed
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">
            Not tracked for a Team Licence
          </div>
        )}
      </td>
      <td className="max-w-sm px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{request.reason}</p>
        <div className="mt-1 text-muted-foreground">
          Raised {formatDate(request.requestedAt)}
        </div>
      </td>
      <td className="space-y-2 px-4 py-3">
        {request.purchaseKind === "individual" ? (
          <ApproveForm request={request} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Team Licence approval coming soon
          </p>
        )}
        <DeclineButton refundId={request.id} />
      </td>
    </tr>
  );
}

const paymentTransferStatusLabel: Record<PaymentTransferStatus, string> = {
  [PaymentTransferStatus.Pending]: "Pending",
  [PaymentTransferStatus.Succeeded]: "Succeeded",
  [PaymentTransferStatus.Failed]: "Failed",
  [PaymentTransferStatus.Canceled]: "Canceled",
  [PaymentTransferStatus.RequiresAction]: "Requires Action",
};

function ResolvedRefundRequestRow({
  request,
}: {
  request: ResolvedRefundRequest;
}) {
  const approved = request.status === RefundStatus.Approved;

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{request.buyer.name}</div>
        <div className="text-sm text-muted-foreground">{request.buyer.email}</div>
      </td>
      <td className="px-4 py-3">
        <Link
          to={`/courses/${request.course.slug}`}
          className="font-medium hover:underline"
        >
          {request.course.title}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm">
        <RefundStatusBadge status={request.status} />
        <div className="mt-1 text-muted-foreground">
          {request.resolvedAt && formatDate(request.resolvedAt)}
          {request.resolvedBy && <> by {request.resolvedBy.name}</>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        {approved && request.amountRefunded !== null && (
          <div className="font-medium">
            {formatPrice(request.amountRefunded)}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {approved && request.paymentTransferStatus && (
          <div
            className={cn(
              request.moneyStillOwed && "font-medium text-destructive"
            )}
          >
            {paymentTransferStatusLabel[request.paymentTransferStatus]}
          </div>
        )}
        {request.moneyStillOwed && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertTriangle className="size-3" />
            Money still owed
          </div>
        )}
      </td>
      <td className="max-w-sm px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{request.reason}</p>
        <div className="mt-1 text-muted-foreground">
          Raised {formatDate(request.requestedAt)}
        </div>
      </td>
    </tr>
  );
}

function ViewSwitch({ view }: { view: RefundsView }) {
  const tab = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium",
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="mb-6 inline-flex gap-1 rounded-lg bg-muted p-1">
      <Link to="/admin/refunds" className={tab(view === "open")}>
        Open
      </Link>
      <Link to="/admin/refunds?view=resolved" className={tab(view === "resolved")}>
        Resolved
      </Link>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground/50" />
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function OpenRefundRequestsTable({ requests }: { requests: OpenRefundRequest[] }) {
  if (requests.length === 0) {
    return <EmptyState message="There are no Open Refund Requests." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={headerCell}>Buyer</th>
                <th className={headerCell}>Course</th>
                <th className={headerCell}>Purchase</th>
                <th className={headerCell}>Progress</th>
                <th className={headerCell}>Reason</th>
                <th className={headerCell}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <OpenRefundRequestRow key={request.id} request={request} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ResolvedRefundRequestsTable({
  requests,
}: {
  requests: ResolvedRefundRequest[];
}) {
  if (requests.length === 0) {
    return <EmptyState message="No Refund Requests have been resolved yet." />;
  }

  // Resolved is final: this table offers no actions (GLOSSARY.md, Approved).
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={headerCell}>Buyer</th>
                <th className={headerCell}>Course</th>
                <th className={headerCell}>Resolution</th>
                <th className={headerCell}>Amount Refunded</th>
                <th className={headerCell}>Payment Transfer Status</th>
                <th className={headerCell}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <ResolvedRefundRequestRow key={request.id} request={request} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function HydrateFallback() {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2 h-5 w-80" />
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Refund Requests</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Refund Requests</h1>
        <p className="mt-1 text-muted-foreground">
          {loaderData.view === "resolved"
            ? "Approved and Declined Refund Requests, most recently resolved first"
            : "Open Refund Requests waiting for a decision, oldest first"}
        </p>
      </div>

      <ViewSwitch view={loaderData.view} />

      {loaderData.view === "resolved" ? (
        <ResolvedRefundRequestsTable requests={loaderData.resolvedRequests} />
      ) : (
        <OpenRefundRequestsTable requests={loaderData.requests} />
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Refund Requests.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Access denied";
      message =
        typeof error.data === "string"
          ? error.data
          : "Only Platform Admins can access this page.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
