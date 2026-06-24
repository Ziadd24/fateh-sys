# Scope: Frontend Category Switcher

## Architecture
- public/index.html: HTML frontend layout
- public/app.js: Frontend state management and DOM manipulation logic
- public/styles.css: Styling for switcher tabs/links (clean and responsive)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Assess & Explore | Find current files, test setups, and styling setup | None | DONE |
| 2 | HTML Implementation | Add Tabs / links for "Pharmacies", "Warehouse", "Exporters" | M1 | IN_PROGRESS (0fa735a1) |
| 3 | JS Implementation | Track current category, support switching context, adjust DOM filtering | M2 | IN_PROGRESS (0fa735a1) |
| 4 | CSS Refinement | Clean and responsive CSS for tabs/links | M2 | IN_PROGRESS (0fa735a1) |
| 5 | Pharmacies Prep | Prepare the UI structure to load Dashboard UI in Pharmacies context | M3 | IN_PROGRESS (0fa735a1) |
| 6 | Verification | Run Reviewer, Challenger, and Forensic Auditor to ensure all clean, pass E2E/units | M4, M5 | PLANNED |

## Interface Contracts
- Switching state tracked in frontend (e.g. `currentCategory` in app.js or localStorage or data-attribute)
- Filtered view elements shown/hidden based on active category context
