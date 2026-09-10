# Accounting Invariants

1. A posted transaction has at least two journal lines.
2. Every line has exactly one positive amount: debit or credit.
3. Sum(debit) equals sum(credit) for each transaction.
4. Every account used by a transaction is active and belongs to the transaction business.
5. A posted journal is immutable. Corrections create one reversing journal with swapped debit/credit amounts.
6. Invoice issuance posts debit receivable and credit revenue atomically.
7. Invoice payment posts debit cash/bank and credit receivable atomically with payment and invoice-balance updates.
8. Reports derive from `transaction_lines`, never mock totals.
9. An idempotency key returns the original completed write and must not create a second financial event.

Any schema or API change that violates an invariant is a release blocker.
