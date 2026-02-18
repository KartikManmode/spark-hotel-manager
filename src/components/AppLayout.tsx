import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-64 flex-1 p-6">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
