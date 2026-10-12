"use client";

import { useEffect, useState, type CSSProperties } from "react";

export function DashboardCelebration() {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFinished(true), 2600);
    return () => clearTimeout(timer);
  }, []);
  if (finished) return null;
  return (
    <div className="dashboard-confetti" aria-hidden="true">
      {Array.from({ length: 40 }, (_, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative list that never reorders.
          key={i}
          style={
            {
              "--x": `${(i * 37) % 100}vw`,
              "--drift": `${((i * 19) % 160) - 80}px`,
              "--delay": `${(i % 7) * 70}ms`,
              "--spin": `${(i % 2 ? 1 : -1) * (240 + i * 17)}deg`,
              backgroundColor: ["#8524d6", "#c49aee", "#e8b94f", "#6350bc"][
                i % 4
              ],
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
