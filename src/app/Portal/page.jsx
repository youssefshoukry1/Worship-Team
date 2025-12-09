"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Portal() {
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState(null);

  useEffect(() => {
    setMounted(true);
    setPortalRoot(document.body);

    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {portalRoot &&
        createPortal(
          <div style={{ position: "fixed", top: 0, left: 0 }}>
            Portal is working!
          </div>,
          portalRoot
        )}
    </>
  );
}
