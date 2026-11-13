import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const readSrc = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");

describe("Global Vertical Scroll & Mobile PWA Viewport Regression", () => {
  it("keeps html and body as non-locking document scroll containers in src/index.css", () => {
    const css = readSrc("src/index.css");

    // Root cause regression guard: `html, body { overflow-x: hidden }` forces CSS `overflow-y: auto`
    // on both html and body, turning body into a 0-scroll nested container that traps touch/wheel events
    // when paired with `body { overscroll-behavior-y: none }`.
    expect(css).not.toMatch(/html\s*,\s*body\s*\{[^}]*overflow-x\s*:\s*hidden/s);
    expect(css).not.toMatch(/body\s*\{[^}]*overscroll-behavior-y\s*:\s*none/s);
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-x\s*:\s*hidden/s);
    expect(css).not.toMatch(/overflow-y\s*:\s*hidden/);
    expect(css).not.toMatch(/(?:html|body)\s*\{[^}]*(?<![a-z-])height\s*:\s*100(?:vh|dvh|%)/s);

    expect(css).toMatch(/html\s*\{[^}]*overflow-x\s*:\s*clip;/s);
    expect(css).toMatch(/html\s*\{[^}]*overscroll-behavior-y\s*:\s*contain;/s);
    expect(css).toMatch(/body\s*\{[^}]*overflow-x\s*:\s*clip;/s);
  });

  it("uses non-locking flex layout with overflow-x-clip and min-w-0 in src/App.tsx", () => {
    const appTsx = readSrc("src/App.tsx");

    expect(appTsx).toContain("min-h-dvh overflow-x-clip");
    expect(appTsx).toContain("flex-1 min-w-0 max-w-6xl w-full mx-auto");
    expect(appTsx).not.toMatch(/<div[^>]*className="[^"]*min-h-dvh[^"]*overflow-hidden/);
  });

  it("contains overscroll chaining and supports internal scrolling across modals and mobile drawer", () => {
    const modalShell = readSrc("src/components/ui/ModalShell.tsx");
    const tourGuide = readSrc("src/components/TourGuide.tsx");
    const authModal = readSrc("src/components/AuthModal.tsx");
    const itemDetail = readSrc("src/components/ItemDetailModal.tsx");
    const installModal = readSrc("src/components/InstallInstructionsModal.tsx");
    const shortcutsModal = readSrc("src/components/KeyboardShortcutsModal.tsx");
    const navbar = readSrc("src/components/Navbar.tsx");

    expect(modalShell).toContain("overflow-y-auto");
    expect(modalShell).toContain("overscroll-contain");

    expect(tourGuide).toContain("overflow-y-auto overscroll-contain");
    expect(tourGuide).toContain("max-h-[90dvh]");
    expect(tourGuide).toContain("min-h-0 flex-1 overscroll-contain");

    expect(authModal).toContain("overscroll-contain");
    expect(authModal).toContain("max-h-[92dvh]");
    expect(authModal).toContain("min-h-0 flex-1 overscroll-contain");

    expect(itemDetail).toContain("overscroll-contain");
    expect(itemDetail).toContain("max-h-[92dvh]");
    expect(itemDetail).toContain("min-h-0 flex-1 overscroll-contain");

    expect(installModal).toContain("overscroll-contain");
    expect(installModal).toContain("max-h-[90dvh]");

    expect(shortcutsModal).toContain("overscroll-contain");
    expect(shortcutsModal).toContain("max-h-[90dvh]");

    expect(navbar).toContain("max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain");
    expect(navbar).toContain("pb-20");
  });
});
