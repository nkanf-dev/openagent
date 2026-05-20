import * as React from "react"
import { Navigate, Outlet } from "react-router"
import { useTranslation } from "react-i18next"

import { AccountProvider, useAccount } from "~/context/AccountContext"
import { StoreFilterProvider } from "~/context/StoreFilterContext"
import { AppFooter } from "~/components/layout/AppFooter"
import { AppHeader } from "~/components/layout/AppHeader"
import { AppSidebar } from "~/components/layout/AppSidebar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import "~/i18n"

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed-state"

function LayoutInner() {
  const { i18n } = useTranslation()
  const { account, handleSignout } = useAccount()

  const [sidebarOpen, setSidebarOpen] = React.useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
      return saved !== null ? saved === "true" : true
    } catch {
      return true
    }
  })

  const handleSidebarOpenChange = React.useCallback((open: boolean) => {
    setSidebarOpen(open)
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open))
    } catch {}
  }, [])

  // Redirect to signin when explicitly not authenticated (null = confirmed no session)
  if (account === null) {
    return <Navigate to="/signin" replace />
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
      <AppSidebar account={account ?? undefined} />
      <SidebarInset>
        <AppHeader account={account ?? undefined} onSignOut={handleSignout} />
        <main className="flex flex-1 flex-col">
          <Outlet key={i18n.language} />
        </main>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function AppLayout() {
  return (
    <AccountProvider>
      <StoreFilterProvider>
        <LayoutInner />
      </StoreFilterProvider>
    </AccountProvider>
  )
}
