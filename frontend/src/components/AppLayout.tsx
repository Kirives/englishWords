import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="h-svh w-full overflow-hidden flex">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <header className="h-11 flex items-center border-b border-border/50 px-2 shrink-0">
            <SidebarTrigger className="h-7 w-7" />
          </header>
          <main className="flex-1 min-h-0 overflow-auto scrollbar-transparent p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
