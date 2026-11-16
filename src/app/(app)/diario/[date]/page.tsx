"use client"

import { useParams } from "next/navigation"
import { DayPage } from "@/components/diary/day-page"

export default function DiaryDayRoute() {
  const { date } = useParams<{ date: string }>()
  // key: trocar de dia remonta a tela (rascunhos e edição são por dia).
  return <DayPage key={date} date={date} />
}
