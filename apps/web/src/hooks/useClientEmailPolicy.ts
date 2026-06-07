'use client';

import { useCallback, useEffect, useState } from 'react';

export function useClientEmailPolicy() {
  const [confirmBeforeClientEmail, setConfirmBeforeClientEmail] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/msp/client-email-policy')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfirmBeforeClientEmail(data.confirmBeforeClientEmail !== false);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const askToEmailClient = useCallback(
    (message: string) => {
      if (!confirmBeforeClientEmail) return true;
      return window.confirm(message);
    },
    [confirmBeforeClientEmail]
  );

  return { confirmBeforeClientEmail, loaded, askToEmailClient };
}
