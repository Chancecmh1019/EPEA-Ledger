# EPEA Ledger

**Ephemera Ledger · 浮生誌**

A personal ledger for the small transactions that make up everyday life.

EPEA Ledger brings income, expenses, cash movements, and credit card activity into a calm, cohesive space. Its name reflects a simple idea: everyday moments may be fleeting, but their financial traces deserve clarity and continuity. A purchase, a repayment, or a short note becomes part of a history that remains understandable over time.

The application pairs a literary visual character with explicit financial meaning. A quiet paper background, deep ink tones, green and warm coral accents, and deliberate typography give every screen a shared visual language. Beneath that presentation, records retain their identity, account ownership, and revision history.

## A Clearer Picture of Personal Finances

EPEA Ledger distinguishes the movement of money from a known account balance. Cash income and cash expenses contribute to cash movement; an opening cash amount provides the starting point for a balance. Credit card purchases and refunds are tracked separately from cash, while repayments connect cash outflow to a reduction in card liability.

Unknown opening balances and credit limits remain visibly unknown. The application does not silently invent a starting balance or turn missing information into zero. Negative values in financial summaries remain visible, and the dashboard's visual scale does not alter the underlying figures.

Explicit adjustments carry a reason and an effective time. Historical descriptions that mention a correction remain ordinary records unless their meaning has been established. This preserves the original history instead of rewriting it to produce a preferred total.

## Everyday Records with Context

Each transaction can hold an amount, a date, a description, a note, a payment method, and an urgency marker. Income, expenses, card repayments, and explicit adjustments have distinct accounting roles.

The recording screen puts the amount first, defaults to an expense, and remembers the last successfully used payment method. Descriptions and notes are optional for ordinary entries. The record archive groups transactions by day and offers search and filters for dates, transaction types, and payment methods. Editing and deletion are visible actions, supported by confirmation and revision checks. Deletion removes a transaction from the active ledger while retaining its historical trace in the database.

A daily spending summary accompanies quick entry, while the overview provides views of the current week, month, year, and the most recent thirty days. A compact daily or monthly bar chart shows income and spending without decorative financial metaphors. These views share the same accounting rules, so their totals have a consistent basis.

## Continuity Across Sessions

Google sign-in ties the ledger to a verified, stable Google account identifier. Account ownership comes from server-verified identity, and records belonging to different accounts remain separate. Supabase provides persistent storage for transactions and their audit history.

Synchronization has visible states. Confirmed records, pending operations, failed requests, and conflicts are treated separately. Pending changes do not enter confirmed totals before the server acknowledges them, and repeated requests retain stable identifiers to avoid creating duplicate transactions.

Local drafts and pending operations support recovery when a save fails. The editor retains entered information, and a recovery export includes confirmed records, pending changes, and financial settings. Cached data that has not been verified is explicitly marked as such.

## A Comfortable Mobile Experience

EPEA Ledger is organized around four direct destinations: recording, history, overview, and account. It uses native scrolling and visible editing and deletion controls. Its layout adapts to narrow screens, safe areas, and changes in the available viewport when an on-screen keyboard appears.

Record dialogs preserve the surrounding page position and restore focus after closing. Search and editing remain connected to their place in the archive, while reduced-motion preferences support a quieter experience. The interface is written in Traditional Chinese, with New Taiwan Dollar amounts and Taipei-based calendar periods.

## History without Silent Changes

The project includes a Python history-restoration utility that preserves original record identifiers and transaction fields. It checks existing cloud records, refuses mismatched history, and verifies restored data. It does not create balancing transactions or automatically reclassify historical corrections.

Financial settings, including opening balances and a credit limit, are currently stored per account in the browser. Transaction history is stored in the cloud. This distinction is part of the application's current scope, and browser-local settings are not presented as synchronized account data.

## Privacy and Integrity

Server-side identity verification establishes ownership for every ledger request. Database access is restricted to the server, and privileged credentials are kept outside browser code. Revision checks protect against conflicting edits, while database constraints and audit records support traceable changes.

Private transaction archives, environment credentials, recovery files, and generated audit outputs are excluded from the repository. The public project contains the application and its supporting source, rather than an individual's financial history.

## Built With

EPEA Ledger uses React and TypeScript for the interface, Tailwind CSS for styling, and lightweight native charts for financial visualization. An Express API verifies Google identity and connects to Supabase PostgreSQL. Vite provides the application build pipeline.

## Author

Created by **Chancecmh1019**.

- GitHub: [Chancecmh1019](https://github.com/Chancecmh1019)
- Email: [chance5234972@gmail.com](mailto:chance5234972@gmail.com)
