Prioritized Improvements
1. Run Lighthouse against a production build (Highest Impact, Low Complexity)
The report was run against localhost:5173 (Vite dev server). Dev mode serves 676 individual script files, unminified. A vite build + vite preview would immediately fix:

Unminified JS: est. savings of 9,200 KiB (LCP improvement ~7.25s)
682 requests collapsed into a handful of bundled chunks
This alone could move the score from ~51 to 80+
2. Code-split / lazy-load heavy libraries (High Impact, Medium Complexity)
Even after production bundling, these libraries are large and many aren't needed on the landing page:

Library	Transfer Size	Unused %	Action
chunk-LZYMYQ3D (likely React DOM)	3.4 MB	15%	Unavoidable core dep, but ensure tree-shaking
framer-motion	1.6 MB	14%	Lazy-load; only import needed components (LazyMotion + domAnimation)
lucide-react	1.5 MB	-	Switch to explicit named imports (import { Icon } from 'lucide-react') to tree-shake
react-markdown + remark-gfm + micromark	~500 KB combined	58-74%	Lazy-load via React.lazy() -- only needed on chat/content pages
react-syntax-highlighter	243 KB	56%	Lazy-load -- only needed when rendering code blocks
bip39	410 KB	-	Lazy-load -- only needed for wallet/crypto features
posthog-js	223 KB	40%	Load async/deferred, not blocking initial render
3. Lazy-load route-level stores and pages (High Impact, Medium Complexity)
Several first-party stores are loaded eagerly and are large:

Module	Size
dialecticStore.ts	306 KB
aiStore.ts	193 KB
dialecticStore.documents.ts	186 KB
organizationStore.ts	140 KB
dialecticStore.selectors.ts	130 KB
HeroAnimation.tsx	109 KB
Use route-based code splitting (React.lazy + Suspense) so stores/pages only load when the user navigates to them.

4. Reduce LCP element render delay (High Impact, Low-Medium Complexity)
The LCP element is a <p> tag on the marketing hero section. The LCP breakdown shows:

TTFB: 6ms (fine)
Element render delay: 2,354ms -- the text can't render until all blocking JS executes
Fix: ensure the landing page's critical HTML/CSS renders before heavy JS. Consider SSR or pre-rendering the landing page, or at minimum ensure the hero section doesn't depend on JS to display.

5. Optimize HeroAnimation.tsx (Medium Impact, Low Complexity)
This component is 109 KB and loads on the landing page. If it contains complex framer-motion animations, consider:

Simplifying the animation
Loading the animation after first paint via requestIdleCallback or intersection observer
Using CSS animations for the initial view
6. Defer PostHog initialization (Low-Medium Impact, Low Complexity)
PostHog adds 100 KB transfer + 73ms main thread time. Initialize it after the page has rendered (e.g., in a useEffect or via setTimeout) rather than blocking the initial load.

7. Reduce unused CSS (Low Impact, Low Complexity)
~25 KiB of unused CSS. Minor compared to the JS issues, but easy to address with Tailwind's purge config if not already enabled for production.

TL;DR Priority Order
Re-run Lighthouse on a production build -- the single biggest issue is testing against dev mode
Lazy-load framer-motion, react-markdown, react-syntax-highlighter, bip39, lucide-react via code splitting
Route-level code splitting for dialetic/AI/org pages and their stores
Ensure hero section renders without waiting for JS (SSR or static HTML)
Defer PostHog loading
Optimize HeroAnimation component size
