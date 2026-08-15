import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

type ExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

// Plain `<a target="_blank">` clicks are silently swallowed by the desktop
// app's webview (Tauri/WKWebView has no native "new tab" to open into), so
// external links must be routed through the opener plugin's system-browser
// call when running there; in a regular browser tab this is a no-op and the
// normal target="_blank" navigation is left to happen.
export function ExternalLink({ href, onClick, ...rest }: ExternalLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented) return
    if (isTauri()) {
      e.preventDefault()
      void openUrl(href)
    }
  }

  return <a href={href} target="_blank" rel="noopener noreferrer" {...rest} onClick={handleClick} />
}
