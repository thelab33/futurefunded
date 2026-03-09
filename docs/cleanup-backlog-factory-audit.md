# FutureFunded cleanup backlog — post RC1

Factory sanity audit passes with 0 blocking issues.

Review-only items remaining:
- 53 CSS class candidates unused on current public homepage
- 4 CSS data-ff hook candidates unused on current public homepage
- 9 HTML data-ff meta-only hooks

Decision:
- Do not block release
- Revisit in post-launch cleanup pass
- Remove only after confirming no hidden templates / future states depend on them
