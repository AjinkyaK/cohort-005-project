import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  KnockFeedProvider,
  KnockProvider,
  NotificationFeedPopover,
  NotificationIconButton,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";

export type NotificationBellProps = {
  apiKey: string;
  feedChannelId: string;
  userId: string;
  userToken: string;
};

/** Asks the server for a freshly signed User Token before the current one expires. */
async function refreshUserToken(): Promise<string | void> {
  const response = await fetch("/api/knock-token");
  if (!response.ok) return;
  const body: unknown = await response.json();
  if (!hasUserToken(body)) return;
  return body.userToken;
}

function hasUserToken(body: unknown): body is { userToken: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "userToken" in body &&
    typeof body.userToken === "string"
  );
}

/**
 * The signed-in person's in-app feed: Knock's stock bell and popover, live
 * over Knock's websocket. Client only. The server already identified every
 * recipient, so the browser never does.
 */
export function NotificationBell({
  apiKey,
  feedChannelId,
  userId,
  userToken,
}: NotificationBellProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <TopBar />;

  return (
    <KnockProvider
      key={userId} // a DevUI person switch remounts with the new person's feed
      apiKey={apiKey}
      user={{ id: userId }}
      userToken={userToken}
      onUserTokenExpiring={refreshUserToken}
      identificationStrategy="skip"
      enabled={Boolean(userId && userToken)}
    >
      <KnockFeedProvider feedId={feedChannelId}>
        <TopBar>
          <Bell />
        </TopBar>
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center justify-end border-b bg-background/80 px-6 backdrop-blur">
      {children}
    </div>
  );
}

function Bell() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <NotificationIconButton
        ref={buttonRef}
        onClick={() => setOpen((isOpen) => !isOpen)}
      />
      <NotificationFeedPopover
        buttonRef={buttonRef}
        isVisible={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
