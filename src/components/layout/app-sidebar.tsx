"use client"

import {
  ArchiveIcon,
  BarChart3Icon,
  BrainCircuitIcon,
  FolderIcon,
  LogOutIcon,
  MessageSquarePlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ConversationList } from "@/components/layout/conversation-list"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { auth } from "@/lib/auth"
import { useSinapses } from "@/lib/queries"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/sinapses", label: "Sinapses", icon: BrainCircuitIcon },
  { href: "/arquivos", label: "Arquivos", icon: FolderIcon },
  { href: "/uso", label: "Uso e custos", icon: BarChart3Icon },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon },
]

/** Ativo na própria rota e nas filhas (`/sinapses/123`), mas não em `/sinapses-x`. */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar({
  onNavigate,
  onSearch,
}: {
  onNavigate?: () => void
  onSearch: () => void
}) {
  const pathname = usePathname()
  const onNewChat = pathname === "/"
  const sinapses = useSinapses()
  const pending = sinapses.data?.pendingSuggestions ?? 0

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 p-3">
        <BrainCircuitIcon className="size-5 text-primary" />
        <span className="font-semibold">Personal AI</span>
      </div>

      <div className="flex flex-col gap-1 px-3">
        <Button
          variant={onNewChat ? "secondary" : "outline"}
          className="w-full justify-start"
          nativeButton={false}
          render={
            <Link href="/" onClick={onNavigate} aria-current={onNewChat ? "page" : undefined} />
          }
        >
          <MessageSquarePlusIcon /> Nova conversa
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={onSearch}
        >
          <SearchIcon /> Buscar
          <Kbd className="ml-auto">Ctrl K</Kbd>
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 py-1">
        <ConversationList onNavigate={onNavigate} />
      </ScrollArea>

      <Separator />

      <nav className="flex flex-col gap-0.5 p-3" aria-label="Seções">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                active && "bg-sidebar-accent font-medium",
              )}
            >
              <Icon className="size-4" /> {label}
              {href === "/sinapses" && pending > 0 && (
                <span
                  className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
                  title="Sugestões pendentes"
                >
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-1 p-3">
        <Button variant="ghost" size="sm" onClick={() => auth.clear()}>
          <LogOutIcon /> Sair
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Arquivadas"
          nativeButton={false}
          render={<Link href="/lixeira?view=archived" onClick={onNavigate} />}
        >
          <ArchiveIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Lixeira"
          nativeButton={false}
          render={<Link href="/lixeira" onClick={onNavigate} />}
        >
          <Trash2Icon />
        </Button>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
