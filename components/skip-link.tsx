"use client";
// Capability pages reload on hashchange, so skipping must move focus without
// touching the URL fragment (which holds the link's keys).
export function SkipLink() {
  return (
    // biome-ignore lint/a11y/useValidAnchor: a skip link stays a link for assistive tech; onClick only avoids the hash navigation.
    <a
      className="skip"
      href="#main"
      onClick={(event) => {
        const main = document.getElementById("main");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView();
      }}
    >
      Skip to content
    </a>
  );
}
