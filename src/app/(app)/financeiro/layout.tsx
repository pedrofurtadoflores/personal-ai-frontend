"use client"

import { Suspense } from "react"
import { FinanceShell } from "@/components/finance/shell"

/** Área Financeiro (ver financeiro.md). O mês fica na URL; por isso o Suspense. */
export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <FinanceShell>{children}</FinanceShell>
    </Suspense>
  )
}
