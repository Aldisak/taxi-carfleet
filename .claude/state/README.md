# Taxi fleet system — agent assignments

Give every agent `00-PROJECT-CONTEXT.md` plus its numbered assignment. Nothing else is needed.

| # | Assignment | Depends on |
|---|---|---|
| 00 | Project context (shared, read first) | – |
| 01 | Data model & backend core | – |
| 02 | Dispatcher web app | 01 |
| 03 | Driver PWA | 01, 02 |
| 04 | Customer PWA | 01–03 |
| 05 | Notifications (SMS + push) | 01–04 |
| 06 | Common routes, zones & pricing | backend after 01; UI after 02, 04 |
| 07 | Reports, audit & tenant onboarding | 01–06 |
| 08 | Infra, CI/CD & operations | schema from 01; finish before 02 goes live |
| 09 | Business analytics & decision-grade reports | 01–08 (extends the 07 reports foundation) |

Suggested run order: 01 → (08 ∥ 02) → 03 → 04 → 06 → 05 → 07 → 09.
Ship 01 + 02 + 08 first and put them in front of the real dispatcher before continuing.
