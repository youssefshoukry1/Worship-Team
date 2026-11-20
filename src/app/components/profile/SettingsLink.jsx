'use client';

import Link from 'next/link';
import { rememberSettingsRoute, returnFromSettings, settingsParent } from '../../utils/profileNavigation';

// Only links followed from the Profile settings flow participate in its stack.
export default function SettingsLink({ href, children, ...props }) {
  const onNavigate = event => {
    const parent = settingsParent();
    if (!parent) return;
    if (parent.split(/[?#]/)[0] === href) {
      event.preventDefault();
      returnFromSettings();
    } else if (href !== '/normal_UserProfile') {
      rememberSettingsRoute(href);
    }
  };
  return <Link {...props} href={href} onNavigate={onNavigate}>{children}</Link>;
}
