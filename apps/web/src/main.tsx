import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/pages/app-layout';
import { DashboardPage } from '@/pages/dashboard';
import { HelpPage } from '@/pages/help/help-page';
import { ActivityLogPage } from '@/pages/history/activity-log-page';
import { WorkHistoryPage } from '@/pages/history/work-history-page';
import { LicenseKeysPage } from '@/pages/license-keys-page';
import { LoginPage } from '@/pages/login';
import { PrintPackagePage, PrintShipmentPage, PrintUnitLabelsPage } from '@/pages/print/print-pages';
import { MasterPage } from '@/pages/master/master-page';
import { ProjectDetailPage } from '@/pages/projects/project-detail-page';
import { ProjectsPage } from '@/pages/projects/projects-page';
import { UnitDetailPage } from '@/pages/units/unit-detail-page';
import { WorkStationPage } from '@/pages/work/work-station-page';
import { ProductTypeDetailPage } from '@/pages/master/product-type-detail-page';
import { ProductTypesPage } from '@/pages/master/product-types-page';
import { ProductsPage } from '@/pages/master/products-page';
import { UsersPage } from '@/pages/users';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Halaman cetak tanpa menu samping.
  { path: '/print/package/:id', element: <PrintPackagePage /> },
  { path: '/print/shipment/:id', element: <PrintShipmentPage /> },
  { path: '/print/unit-labels/:projectId', element: <PrintUnitLabelsPage /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/:id', element: <ProjectDetailPage /> },
      { path: '/units/:id', element: <UnitDetailPage /> },
      { path: '/work/:stage', element: <WorkStationPage /> },
      { path: '/license-keys', element: <LicenseKeysPage /> },
      { path: '/help', element: <HelpPage /> },
      { path: '/history', element: <WorkHistoryPage /> },
      { path: '/activity-logs', element: <ActivityLogPage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/master/products', element: <ProductsPage /> },
      { path: '/master/product-types', element: <ProductTypesPage /> },
      { path: '/master/product-types/:id', element: <ProductTypeDetailPage /> },
      { path: '/master/:kind', element: <MasterPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
